import { useEffect, useMemo, useRef, useState } from 'react';
import { QA_PLAN, CORE_ADDONS } from '../lib/qaPlan';
import {
  watchQaStatus,
  setQaStatus,
  setQaNote,
  watchQaTasks,
  createQaTask,
  updateQaTask,
  deleteQaTask,
  setQaTaskModule,
  watchQaModules,
  setQaModuleTitle,
  createQaModule,
  deleteQaModule,
  setQaModuleHidden,
} from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../lib/format';

// The states a plan task can be in. Everything starts "In testing" (assigned
// to everyone); "Failed" is what counts toward the fail rate. "N/A" marks a
// task that's obsolete / no longer applicable — it's excluded from pass & fail
// rates entirely (see `applicable` below).
const STATUSES = [
  {
    value: 'in_testing',
    label: 'In testing',
    chip: 'bg-gray-100 text-gray-600 ring-1 ring-gray-300',
    active: 'bg-gray-700 text-white',
    dot: 'bg-gray-400',
    bar: 'bg-gray-300',
    text: 'text-gray-600',
  },
  {
    value: 'bugs_found',
    label: 'Failed',
    chip: 'bg-red-500/10 text-red-700 ring-1 ring-red-400/40',
    active: 'bg-red-600 text-white',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    text: 'text-red-600',
  },
  {
    value: 'passed',
    label: 'Passed',
    chip: 'bg-green-500/10 text-green-700 ring-1 ring-green-400/40',
    active: 'bg-green-600 text-white',
    dot: 'bg-green-500',
    bar: 'bg-green-500',
    text: 'text-green-600',
  },
  {
    value: 'na',
    label: 'N/A',
    chip: 'bg-slate-500/10 text-slate-600 ring-1 ring-slate-400/40',
    active: 'bg-slate-600 text-white',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400',
    text: 'text-slate-500',
  },
];
const STATUS_BY = Object.fromEntries(STATUSES.map((s) => [s.value, s]));
const DEFAULT_STATUS = 'in_testing';

const PRIORITY_CLASS = {
  P0: 'bg-red-500/15 text-red-700',
  P1: 'bg-orange-500/15 text-orange-700',
  P2: 'bg-blue-500/15 text-blue-700',
  P3: 'bg-gray-200 text-gray-600',
};

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// Tasks that count toward pass/fail rates: everything except N/A (obsolete).
const applicable = (c) => c.total - (c.na || 0);

function tally(tasks, statusMap) {
  const c = { in_testing: 0, bugs_found: 0, passed: 0, na: 0, total: tasks.length };
  for (const t of tasks) {
    const s = statusMap[t.id]?.status || DEFAULT_STATUS;
    c[s] = (c[s] || 0) + 1;
  }
  return c;
}

// A thin stacked bar: green (passed) · red (failed) · grey (in testing) ·
// slate (N/A). Segment widths are of the full task count so N/A still shows.
function ProgressBar({ counts, height = 'h-2.5' }) {
  const { passed, bugs_found, in_testing, na = 0, total } = counts;
  if (!total) return <div className={`${height} w-full rounded-full bg-gray-200`} />;
  const seg = (n, cls) =>
    n > 0 ? <div className={cls} style={{ width: `${(n / total) * 100}%` }} /> : null;
  return (
    <div className={`flex ${height} w-full overflow-hidden rounded-full bg-gray-200`}>
      {seg(passed, 'bg-green-500')}
      {seg(bugs_found, 'bg-red-500')}
      {seg(in_testing, 'bg-gray-300')}
      {seg(na, 'bg-slate-400')}
    </div>
  );
}

export default function QAPlan({ readOnly = false }) {
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState({});
  const [customTasks, setCustomTasks] = useState([]); // member-added checks
  const [modulesMap, setModulesMap] = useState({}); // qaModules: built-in overrides + custom modules
  const [tab, setTab] = useState('module'); // 'module' (Modules) | 'addon' (Core Add-ons)
  const [selected, setSelected] = useState(null); // module code
  const [filter, setFilter] = useState('all'); // detail-view status filter
  const [saving, setSaving] = useState(null); // task id currently saving
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false); // module add-form open

  useEffect(() => watchQaStatus(setStatusMap), []);
  useEffect(() => watchQaTasks(setCustomTasks), []);
  useEffect(() => watchQaModules(setModulesMap), []);

  // Built-in groups: the static plan (Modules) + the static Core Add-ons.
  const builtins = useMemo(
    () => [
      ...QA_PLAN.map((m) => ({ ...m, kind: 'module', custom: false })),
      ...CORE_ADDONS.map((m) => ({ ...m, kind: 'addon', custom: false })),
    ],
    [],
  );

  // Effective groups: built-ins with title/hidden overrides applied, plus any
  // custom modules/add-ons members created.
  const groups = useMemo(() => {
    const list = builtins.map((m) => {
      const ov = modulesMap[m.code] || {};
      return { ...m, title: ov.title || m.title, hidden: !!ov.hidden };
    });
    for (const [id, data] of Object.entries(modulesMap)) {
      if (!data.custom) continue;
      list.push({
        code: id,
        title: data.title || 'Untitled module',
        kind: data.kind === 'addon' ? 'addon' : 'module',
        tasks: [],
        custom: true,
        hidden: !!data.hidden,
        createdBy: data.createdBy || null,
      });
    }
    return list;
  }, [builtins, modulesMap]);

  const groupByCode = useMemo(() => Object.fromEntries(groups.map((g) => [g.code, g])), [groups]);

  // Bucket every task under its effective module code (honours per-task moves).
  // Built-in plan checks first (original order), then member-added checks in the
  // order they were added — first added stays first, newer ones appended after.
  // A just-added check has no server timestamp yet, so treat it as newest so it
  // lands at the bottom.
  const tasksByModule = useMemo(() => {
    const ms = (t) =>
      t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : Number.MAX_SAFE_INTEGER;
    const map = {};
    for (const m of builtins) {
      for (const t of m.tasks) {
        const eff = statusMap[t.id]?.moduleCode || m.code;
        (map[eff] ||= []).push(t);
      }
    }
    const oldestFirst = [...customTasks].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    for (const t of oldestFirst) (map[t.moduleCode] ||= []).push(t);
    return map;
  }, [builtins, statusMap, customTasks]);

  // Groups for the active tab (hidden excluded unless "show removed" is on).
  const visibleGroups = groups.filter((g) => g.kind === tab && (!g.hidden || showRemoved));
  const removedCount = groups.filter((g) => g.kind === tab && g.hidden).length;
  const tabCounts = {
    module: groups.filter((g) => g.kind === 'module' && !g.hidden).length,
    addon: groups.filter((g) => g.kind === 'addon' && !g.hidden).length,
  };

  // Per-tab rollup of statuses.
  const overall = useMemo(() => {
    const tabTasks = groups
      .filter((g) => g.kind === tab && !g.hidden)
      .flatMap((g) => tasksByModule[g.code] || []);
    return tally(tabTasks, statusMap);
  }, [groups, tab, tasksByModule, statusMap]);

  const moduleStats = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.code, tally(tasksByModule[g.code] || [], statusMap)])),
    [groups, tasksByModule, statusMap],
  );

  // Move-dropdown options: every non-hidden group, both tabs (grouped by kind).
  const moduleOptions = useMemo(
    () => groups.filter((g) => !g.hidden).map((g) => ({ code: g.code, title: g.title, kind: g.kind })),
    [groups],
  );

  async function saveNote(taskId, note) {
    await setQaNote(taskId, note, user);
  }

  async function mark(taskId, status) {
    setSaving(taskId);
    try {
      await setQaStatus(taskId, status, user);
    } finally {
      setSaving(null);
    }
  }

  async function addTask(moduleCode, data) {
    await createQaTask({ moduleCode, ...data, createdBy: user?.displayName || user?.email || null });
  }

  async function removeTask(taskId) {
    if (confirm('Delete this custom check? (Built-in checks can’t be deleted.)')) {
      await deleteQaTask(taskId);
    }
  }

  async function moveTask(task, toCode) {
    if (!toCode) return;
    if (task.custom) await updateQaTask(task.id, { moduleCode: toCode });
    else await setQaTaskModule(task.id, toCode, user);
  }

  async function renameModule(code, title) {
    try {
      await setQaModuleTitle(code, title, user);
    } catch (e) {
      alert(`Could not rename.\n\n${explainError(e)}`);
    }
  }

  // Surface write failures (the common one is unpublished Firestore rules) so
  // they're never silent.
  function explainError(e) {
    const msg = e?.message || String(e);
    if (/permission|insufficient|PERMISSION_DENIED/i.test(msg)) {
      return 'Permission denied — the QA Plan Firestore rules need to be published (Firebase Console → Firestore → Rules → Publish).';
    }
    return msg;
  }

  async function addModule(title) {
    try {
      await createQaModule({ title, kind: tab, createdBy: user?.displayName || user?.email || null });
      setAdding(false);
    } catch (e) {
      alert(`Could not create this ${tab === 'addon' ? 'core add-on' : 'module'}.\n\n${explainError(e)}`);
    }
  }

  // Delete a custom module/add-on (only when empty), or hide/restore a built-in.
  async function deleteModule(group) {
    const count = (tasksByModule[group.code] || []).length;
    const label = group.kind === 'addon' ? 'core add-on' : 'module';
    try {
      if (group.custom) {
        if (count > 0) {
          alert(`This ${label} still has ${count} check(s). Move or delete them first, then delete it.`);
          return;
        }
        if (confirm(`Delete the “${group.title}” ${label}? This can’t be undone.`)) {
          await deleteQaModule(group.code);
          setSelected(null);
        }
      } else if (
        confirm(
          `Remove the “${group.title}” ${label} from the plan?` +
            (count ? ` Its ${count} check(s) are hidden but kept — you can restore it from “Show removed”.` : ''),
        )
      ) {
        await setQaModuleHidden(group.code, true, user);
        setSelected(null);
      }
    } catch (e) {
      alert(`Could not update this ${label}.\n\n${explainError(e)}`);
    }
  }

  async function restoreModule(code) {
    try {
      await setQaModuleHidden(code, false, user);
    } catch (e) {
      alert(`Could not restore.\n\n${explainError(e)}`);
    }
  }

  const current =
    selected && groupByCode[selected]
      ? { ...groupByCode[selected], tasks: tasksByModule[selected] || [] }
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">QA Plan</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                readOnly ? 'bg-blue-500/15 text-blue-700' : 'bg-amber-500/15 text-amber-700'
              }`}
            >
              {readOnly ? 'Shared · read-only' : 'Temporary'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            LevCharity 2.0 manual test plan.
            {readOnly
              ? ' Live progress snapshot — updates appear automatically.'
              : ' Organise checks across Modules and Core Add-ons; mark each as '}
            {!readOnly && (
              <>
                <b>In testing</b>, <b>Failed</b>, <b>Passed</b>, or <b>N/A</b>.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Tabs: Modules / Core Add-ons */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-white p-1">
          {[
            { value: 'module', label: 'Modules' },
            { value: 'addon', label: 'Core Add-ons' },
          ].map((tb) => (
            <button
              key={tb.value}
              onClick={() => {
                setTab(tb.value);
                setSelected(null);
                setShowRemoved(false);
                setAdding(false);
              }}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === tb.value ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tb.label}
              <span className="ml-1.5 text-xs text-gray-400">{tabCounts[tb.value]}</span>
            </button>
          ))}
        </div>
        {!readOnly && !current && !adding && (
          <button onClick={() => setAdding(true)} className="btn-primary ml-auto py-1.5 px-3 text-xs">
            + Add {tab === 'addon' ? 'core add-on' : 'module'}
          </button>
        )}
      </div>

      {!readOnly && adding && !current && (
        <AddModuleForm kind={tab} onCancel={() => setAdding(false)} onSave={addModule} />
      )}

      {/* Overall progress for the active tab */}
      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {tab === 'addon' ? 'Core Add-ons' : 'Modules'} · progress
          </h2>
          <span className="text-xs text-gray-500">
            {overall.passed + overall.bugs_found} of {applicable(overall)} tested
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar counts={overall} height="h-3" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Pass rate" value={`${pct(overall.passed, applicable(overall))}%`} sub={`${overall.passed} passed`} tone="text-green-600" />
          <Stat label="Fail rate" value={`${pct(overall.bugs_found, applicable(overall))}%`} sub={`${overall.bugs_found} failed`} tone="text-red-600" />
          <Stat label="In testing" value={`${overall.in_testing}`} sub="not yet resolved" tone="text-gray-600" />
          <Stat label="N/A" value={`${overall.na}`} sub="obsolete / skipped" tone="text-slate-500" />
          <Stat label="Total tasks" value={`${overall.total}`} sub={`${visibleGroups.filter((g) => !g.hidden).length} ${tab === 'addon' ? 'add-ons' : 'modules'}`} tone="text-gray-800" />
        </div>
      </div>

      {!current ? (
        /* ---------- Module / add-on cards ---------- */
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleGroups.map((g) => {
              const c = moduleStats[g.code];
              return (
                <button
                  key={g.code}
                  onClick={() => {
                    setSelected(g.code);
                    setFilter('all');
                  }}
                  className={`card group overflow-hidden p-0 text-left transition hover:border-brand/40 hover:shadow-sm ${
                    g.hidden ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 border-b border-ink-600 bg-gray-50/60 px-4 py-2.5">
                    {g.custom ? (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                        custom
                      </span>
                    ) : (
                      <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">
                        {g.code}
                      </span>
                    )}
                    <span className="flex-1 text-sm font-medium text-gray-500 group-hover:text-gray-800">
                      {g.title}
                    </span>
                    {g.hidden && (
                      <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                        removed
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <ProgressBar counts={c} />
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-gray-400">{c.total} tasks</span>
                      <span className="flex items-center gap-2">
                        <span className="text-green-600">{pct(c.passed, applicable(c))}% pass</span>
                        <span className="text-red-600">{pct(c.bugs_found, applicable(c))}% fail</span>
                        {c.na > 0 && <span className="text-slate-500">{c.na} N/A</span>}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {visibleGroups.length === 0 && (
              <div className="col-span-full card p-8 text-center text-sm text-gray-500">
                No {tab === 'addon' ? 'core add-ons' : 'modules'} here yet.
                {!readOnly && ' Use “Add” above to create one.'}
              </div>
            )}
          </div>
          {removedCount > 0 && (
            <button
              onClick={() => setShowRemoved((v) => !v)}
              className="mt-3 text-xs text-gray-400 hover:text-gray-700"
            >
              {showRemoved ? 'Hide removed' : `Show removed (${removedCount})`}
            </button>
          )}
        </>
      ) : (
        /* ---------- Selected module detail ---------- */
        <ModuleDetail
          module={current}
          counts={moduleStats[current.code]}
          statusMap={statusMap}
          filter={filter}
          setFilter={setFilter}
          onBack={() => setSelected(null)}
          onMark={mark}
          onNote={saveNote}
          onAddTask={addTask}
          onDeleteTask={removeTask}
          onMove={moveTask}
          onRename={renameModule}
          onDeleteModule={deleteModule}
          onRestore={restoreModule}
          moduleOptions={moduleOptions}
          saving={saving}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-gray-50 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-gray-400">{sub}</div>
    </div>
  );
}

function ModuleDetail({
  module,
  counts,
  statusMap,
  filter,
  setFilter,
  onBack,
  onMark,
  onNote,
  onAddTask,
  onDeleteTask,
  onMove,
  onRename,
  onDeleteModule,
  onRestore,
  moduleOptions,
  saving,
  readOnly,
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(module.title);
  const kindLabel = module.kind === 'addon' ? 'core add-on' : 'module';
  const tasks = module.tasks.filter((t) => {
    if (filter === 'all') return true;
    return (statusMap[t.id]?.status || DEFAULT_STATUS) === filter;
  });

  const FILTERS = [
    { value: 'all', label: `All (${counts.total})` },
    { value: 'in_testing', label: `In testing (${counts.in_testing})` },
    { value: 'bugs_found', label: `Failed (${counts.bugs_found})` },
    { value: 'passed', label: `Passed (${counts.passed})` },
    { value: 'na', label: `N/A (${counts.na})` },
  ];

  return (
    <div className="mt-6">
      <button onClick={onBack} className="btn-ghost mb-3 py-1 px-2 text-xs">
        ← All modules
      </button>

      <div className="card p-4">
        <div className="flex items-start gap-2">
          <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-sm font-bold text-brand">
            {module.code}
          </span>
          {renaming ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                className="input flex-1 py-1 text-base font-semibold"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && titleDraft.trim()) {
                    onRename(module.code, titleDraft.trim());
                    setRenaming(false);
                  }
                  if (e.key === 'Escape') setRenaming(false);
                }}
              />
              <button
                onClick={() => {
                  if (titleDraft.trim()) onRename(module.code, titleDraft.trim());
                  setRenaming(false);
                }}
                className="btn-primary py-1 px-3 text-xs"
              >
                Save
              </button>
              <button onClick={() => setRenaming(false)} className="btn-ghost py-1 px-3 text-xs">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <h2 className="flex-1 text-lg font-semibold text-gray-700">{module.title}</h2>
              {module.hidden && (
                <span className="shrink-0 rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                  removed
                </span>
              )}
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => {
                      setTitleDraft(module.title);
                      setRenaming(true);
                    }}
                    className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-ink-700 hover:text-gray-800"
                    title={`Rename this ${kindLabel}`}
                  >
                    ✎ Rename
                  </button>
                  {module.hidden ? (
                    <button
                      onClick={() => onRestore(module.code)}
                      className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-500/10"
                    >
                      ↺ Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => onDeleteModule(module)}
                      className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-red-500/10 hover:text-red-600"
                      title={module.custom ? `Delete this ${kindLabel}` : `Remove this ${kindLabel} from the plan`}
                    >
                      {module.custom ? '🗑 Delete' : '🗑 Remove'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-3">
          <ProgressBar counts={counts} height="h-3" />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <span className="text-green-600">{pct(counts.passed, applicable(counts))}% pass · {counts.passed}</span>
          <span className="text-red-600">{pct(counts.bugs_found, applicable(counts))}% fail · {counts.bugs_found}</span>
          <span className="text-gray-500">{counts.in_testing} still in testing</span>
          {counts.na > 0 && <span className="text-slate-500">{counts.na} N/A</span>}
        </div>
      </div>

      {/* Status filter + Add check */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-600 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {!readOnly && !adding && (
          <button onClick={() => setAdding(true)} className="btn-primary ml-auto py-1.5 px-3 text-xs">
            + Add check
          </button>
        )}
      </div>

      {!readOnly && adding && (
        <AddCheckForm
          moduleTitle={module.title}
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            await onAddTask(module.code, data);
            setAdding(false);
          }}
        />
      )}

      <div className="card mt-3 divide-y divide-ink-600">
        {tasks.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">No tasks in this view.</div>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            t={t}
            meta={statusMap[t.id]}
            onMark={onMark}
            onNote={onNote}
            onDelete={onDeleteTask}
            onMove={onMove}
            moduleOptions={moduleOptions}
            currentCode={module.code}
            saving={saving}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const TYPES = ['Functional', 'Integration', 'E2E', 'Security', 'UI/Visual', 'Performance', 'Other'];

function AddModuleForm({ kind, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const label = kind === 'addon' ? 'core add-on' : 'module';

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave(title.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mt-3 flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[220px] flex-1">
        <label className="label">New {label} name</label>
        <input
          className="input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={kind === 'addon' ? 'e.g. Loyalty Points' : 'e.g. Mobile App'}
        />
      </div>
      <button onClick={save} disabled={saving || !title.trim()} className="btn-primary py-2 px-4 text-sm">
        {saving ? 'Adding…' : `Add ${label}`}
      </button>
      <button onClick={onCancel} className="btn-ghost py-2 px-4 text-sm">
        Cancel
      </button>
    </div>
  );
}

function AddCheckForm({ moduleTitle, onSave, onCancel }) {
  const [feature, setFeature] = useState('');
  const [verify, setVerify] = useState('');
  const [priority, setPriority] = useState('P2');
  const [type, setType] = useState('Functional');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!feature.trim()) return;
    setSaving(true);
    try {
      await onSave({ feature: feature.trim(), verify: verify.trim(), priority, type });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mt-3 space-y-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        New check · {moduleTitle}
      </div>
      <div>
        <label className="label">What to check</label>
        <input
          className="input"
          autoFocus
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="e.g. Recurring donation can be cancelled by the donor"
        />
      </div>
      <div>
        <label className="label">How to verify (optional)</label>
        <textarea
          className="input"
          rows={2}
          value={verify}
          onChange={(e) => setVerify(e.target.value)}
          placeholder="What you should see if it passes…"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="label">Priority</label>
          <select className="input max-w-[120px]" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input max-w-[160px]" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !feature.trim()} className="btn-primary py-1.5 px-3 text-xs">
          {saving ? 'Adding…' : 'Add check'}
        </button>
        <button onClick={onCancel} className="btn-ghost py-1.5 px-3 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// A searchable white dropdown for moving a check to another module / add-on —
// replaces the native <select> (whose OS menu doesn't match the UI). Type to
// filter; results stay grouped by Modules / Core Add-ons.
function MoveDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const current = options.find((o) => o.code === value);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const ql = q.trim().toLowerCase();
  const matches = options.filter((o) => !ql || o.title.toLowerCase().includes(ql));
  const modules = matches.filter((o) => o.kind !== 'addon');
  const addons = matches.filter((o) => o.kind === 'addon');

  const pick = (code) => {
    if (code !== value) onChange(code);
    setOpen(false);
    setQ('');
  };

  const Item = ({ o }) => (
    <button
      type="button"
      onClick={() => pick(o.code)}
      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink-700/60 ${
        o.code === value ? 'font-medium text-brand' : 'text-gray-700'
      }`}
    >
      <span className="truncate">{o.title}</span>
      {o.code === value && <span className="shrink-0 text-brand">✓</span>}
    </button>
  );

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-brand/40 hover:text-gray-900"
        title="Move this check to another module or core add-on"
      >
        <span className="text-gray-400">Move to</span>
        <span className="max-w-[160px] truncate font-medium text-gray-800">
          {current?.title || 'choose…'}
        </span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-ink-600 bg-white shadow-xl">
          <div className="border-b border-ink-600 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter') {
                  const first = [...modules, ...addons][0];
                  if (first) pick(first.code);
                }
              }}
              placeholder="Search modules & add-ons…"
              className="w-full rounded-md border border-ink-500 px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {modules.length > 0 && (
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Modules
              </div>
            )}
            {modules.map((o) => (
              <Item key={o.code} o={o} />
            ))}
            {addons.length > 0 && (
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Core Add-ons
              </div>
            )}
            {addons.map((o) => (
              <Item key={o.code} o={o} />
            ))}
            {matches.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-400">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ t, meta, onMark, onNote, onDelete, onMove, moduleOptions, currentCode, saving, readOnly }) {
  const status = meta?.status || DEFAULT_STATUS;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meta?.note || '');
  const [savingNote, setSavingNote] = useState(false);

  async function save() {
    setSavingNote(true);
    try {
      await onNote(t.id, draft.trim());
      setEditing(false);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
              {t.custom ? 'custom' : t.id}
            </span>
            {t.priority && (
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  PRIORITY_CLASS[t.priority] || 'bg-gray-200 text-gray-600'
                }`}
              >
                {t.priority}
              </span>
            )}
            {t.type && <span className="text-xs text-gray-400">{t.type}</span>}
            {t.custom && t.createdBy && (
              <span className="text-xs text-gray-400">· added by {t.createdBy}</span>
            )}
            {t.custom && !readOnly && onDelete && (
              <button
                onClick={() => onDelete(t.id)}
                title="Delete this custom check"
                className="ml-auto rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-500/10 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </div>
          <div className="mt-1 text-sm font-medium text-gray-800">{t.feature}</div>
          {t.verify && <div className="mt-0.5 text-xs text-gray-500">{t.verify}</div>}
          {meta?.updatedBy && (
            <div className={`mt-1 text-xs ${STATUS_BY[status]?.text || 'text-gray-400'}`}>
              {STATUS_BY[status]?.label} · {meta.updatedBy}
              {meta.updatedAt ? ` · ${timeAgo(meta.updatedAt)}` : ''}
            </div>
          )}
          {!readOnly && onMove && moduleOptions && (
            <div className="mt-2">
              <MoveDropdown
                value={currentCode}
                options={moduleOptions}
                onChange={(code) => onMove(t, code)}
              />
            </div>
          )}
        </div>

        {/* Status: read-only badge for shared view, buttons otherwise */}
        {readOnly ? (
          <div className="shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_BY[status]?.chip || ''
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${STATUS_BY[status]?.dot || ''}`} />
              {STATUS_BY[status]?.label}
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 gap-1 rounded-lg border border-ink-600 bg-gray-50 p-1">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => onMark(t.id, s.value)}
                disabled={saving === t.id}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  status === s.value ? s.active : 'text-gray-500 hover:bg-white'
                }`}
                title={`Mark as ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes — reason a test failed, repro steps, blockers, context. Shown
          read-only on the public share; editable for members. */}
      {readOnly
        ? meta?.note && (
            <div className="mt-2 rounded-lg border border-ink-600 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Note{meta.noteBy ? ` · ${meta.noteBy}` : ''}
                {meta.noteAt ? ` · ${timeAgo(meta.noteAt)}` : ''}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{meta.note}</p>
            </div>
          )
        : editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="input text-sm"
              rows={3}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Why it failed, steps to reproduce, blockers, or any context…"
            />
            <div className="flex gap-2">
              <button onClick={save} disabled={savingNote} className="btn-primary py-1 px-3 text-xs">
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
              <button
                onClick={() => {
                  setDraft(meta?.note || '');
                  setEditing(false);
                }}
                className="btn-ghost py-1 px-3 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : meta?.note ? (
          <div className="mt-2 rounded-lg border border-ink-600 bg-gray-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Note{meta.noteBy ? ` · ${meta.noteBy}` : ''}
                {meta.noteAt ? ` · ${timeAgo(meta.noteAt)}` : ''}
              </div>
              <button
                onClick={() => {
                  setDraft(meta.note || '');
                  setEditing(true);
                }}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Edit
              </button>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{meta.note}</p>
          </div>
        ) : (
          <button
            onClick={() => {
              setDraft('');
              setEditing(true);
            }}
            className="mt-1.5 text-xs text-gray-400 hover:text-brand"
          >
            + Add note
          </button>
        )}
    </div>
  );
}
