import { useEffect, useMemo, useState } from 'react';
import {
  watchSuites,
  watchTests,
  watchComponents,
  createSuite,
  saveSuite,
  deleteSuite,
} from '../lib/db';
import { triggerRun } from '../lib/triggerRun';
import Spinner from '../components/Spinner';
import { moduleOf } from '../lib/schema';
import {
  FREQUENCIES,
  WEEKDAYS,
  defaultSpec,
  buildCron,
  describeSchedule,
  localTzLabel,
} from '../lib/schedule';

// Older suites stored a single setupComponentId; new ones store ordered arrays.
function setupIdsOf(suite) {
  if (Array.isArray(suite.setupComponentIds) && suite.setupComponentIds.length)
    return suite.setupComponentIds;
  return suite.setupComponentId ? [suite.setupComponentId] : [];
}
const teardownIdsOf = (suite) =>
  Array.isArray(suite.teardownComponentIds) ? suite.teardownComponentIds : [];

export default function Suites() {
  const [suites, setSuites] = useState(null);
  const [tests, setTests] = useState([]);
  const [components, setComponents] = useState([]);
  const [running, setRunning] = useState(null);

  useEffect(() => {
    const u1 = watchSuites(setSuites);
    const u2 = watchTests(setTests);
    const u3 = watchComponents(setComponents);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  if (!suites) return <Spinner label="Loading suites…" />;

  async function handleNew() {
    await createSuite({ name: 'New suite' });
  }

  async function runSuite(suite) {
    setRunning(suite.id);
    try {
      const chosen = tests.filter((t) => (suite.testIds || []).includes(t.id));
      if (chosen.length === 0) {
        alert('This suite has no tests yet.');
        return;
      }
      const opts = {};
      const sIds = setupIdsOf(suite);
      const tIds = teardownIdsOf(suite);
      if (sIds.length) opts.setupComponentIds = sIds;
      if (tIds.length) opts.teardownComponentIds = tIds;
      for (const t of chosen) await triggerRun(t, opts);
      alert(`Queued ${chosen.length} run(s).`);
    } catch (e) {
      alert(e.message);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Suites</h1>
          <p className="text-sm text-gray-400">
            Group tests and run them together — manually or on a schedule.
          </p>
        </div>
        <button onClick={handleNew} data-tour="suites-new" className="btn-primary">
          + New suite
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {suites.length === 0 && (
          <div className="card p-10 text-center text-gray-500">No suites yet.</div>
        )}
        {suites.map((s, i) => (
          <SuiteCard
            key={s.id}
            suite={s}
            tests={tests}
            components={components}
            running={running === s.id}
            onRun={() => runSuite(s)}
            tour={i === 0 ? 'suite-card' : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SuiteCard({ suite, tests, components, running, onRun, tour }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suite.name);

  const selected = new Set(suite.testIds || []);
  const setupIds = setupIdsOf(suite);
  const teardownIds = teardownIdsOf(suite);
  const spec = { ...defaultSpec(), ...(suite.scheduleSpec || {}) };

  function toggleTest(id) {
    const next = new Set(suite.testIds || []);
    next.has(id) ? next.delete(id) : next.add(id);
    saveSuite(suite.id, { testIds: [...next] });
  }

  function bulkTests(ids, add) {
    const next = new Set(suite.testIds || []);
    ids.forEach((id) => (add ? next.add(id) : next.delete(id)));
    saveSuite(suite.id, { testIds: [...next] });
  }

  return (
    <div className="card overflow-hidden" data-tour={tour}>
      {/* Summary row — always visible */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-gray-500 hover:text-gray-800"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? '▾' : '▸'}
        </button>
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <span className="font-medium">{suite.name || 'Untitled suite'}</span>
          <span className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-500">
            <span>
              {selected.size} test{selected.size === 1 ? '' : 's'}
            </span>
            <span>· {spec.freq === 'manual' ? 'Manual only' : describeSchedule(spec)}</span>
            {setupIds.length > 0 && <span>· ↳ {setupIds.length} setup</span>}
            {teardownIds.length > 0 && <span>· {teardownIds.length} teardown</span>}
          </span>
        </button>
        <div className="flex gap-2">
          <button onClick={onRun} disabled={running} className="btn-primary py-1.5 px-3 text-xs">
            {running ? 'Queuing…' : '▶ Run suite'}
          </button>
          <button
            onClick={() => confirm('Delete suite?') && deleteSuite(suite.id)}
            className="btn-danger py-1.5 px-3 text-xs"
          >
            Delete
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-ink-600 bg-gray-50 p-4" data-tour="suite-panel">
          <div>
            <label className="label">Suite name</label>
            <input
              className="input max-w-sm font-medium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => saveSuite(suite.id, { name })}
            />
          </div>

          <SchedulePicker suite={suite} />

          <div className="grid gap-4 md:grid-cols-2">
            <ComponentList
              title="Run before each test"
              help="Prepended to every test in order — e.g. Accept cookies, then Log in."
              ids={setupIds}
              components={components}
              onChange={(ids) =>
                saveSuite(suite.id, { setupComponentIds: ids, setupComponentId: null })
              }
            />
            <ComponentList
              title="Run after each test"
              help="Appended to every test in order — e.g. Log out, reset state."
              ids={teardownIds}
              components={components}
              onChange={(ids) => saveSuite(suite.id, { teardownComponentIds: ids })}
            />
          </div>

          <TestPicker
            tests={tests}
            selected={selected}
            onToggle={toggleTest}
            onBulk={bulkTests}
          />
        </div>
      )}
    </div>
  );
}

// Ordered list of reusable components with add (via dropdown) and remove.
function ComponentList({ title, help, ids, components, onChange }) {
  const byId = useMemo(() => {
    const m = {};
    for (const c of components) m[c.id] = c;
    return m;
  }, [components]);

  const available = components.filter((c) => !ids.includes(c.id));

  function add(id) {
    if (id) onChange([...ids, id]);
  }
  function remove(id) {
    onChange(ids.filter((x) => x !== id));
  }
  function move(idx, dir) {
    const next = [...ids];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <div className="rounded-lg border border-ink-600 bg-white p-3">
      <div className="label">{title}</div>
      {ids.length === 0 && <p className="text-xs text-gray-400">None.</p>}
      <ol className="space-y-1">
        {ids.map((id, idx) => (
          <li
            key={id}
            className="flex items-center gap-2 rounded-md border border-ink-600 bg-gray-50 px-2 py-1 text-xs"
          >
            <span className="text-gray-400">{idx + 1}.</span>
            <span className="flex-1 truncate">
              {byId[id]?.name || '(deleted component)'}
            </span>
            <button
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              title="Move up"
            >
              ↑
            </button>
            <button
              onClick={() => move(idx, 1)}
              disabled={idx === ids.length - 1}
              className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              title="Move down"
            >
              ↓
            </button>
            <button
              onClick={() => remove(id)}
              className="px-1 text-gray-400 hover:text-red-600"
              title="Remove"
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <select
        className="input mt-2 text-sm"
        value=""
        onChange={(e) => add(e.target.value)}
        disabled={available.length === 0}
      >
        <option value="">
          {available.length === 0 ? 'No more components' : '+ Add component…'}
        </option>
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.steps?.length || 0} steps)
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">{help}</p>
    </div>
  );
}

// Pick tests for the suite, filtered by module and name so a long list stays
// manageable.
function TestPicker({ tests, selected, onToggle, onBulk }) {
  const [module, setModule] = useState('all');
  const [search, setSearch] = useState('');

  const modules = useMemo(
    () => ['all', ...[...new Set(tests.map(moduleOf))].sort()],
    [tests],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tests.filter((t) => {
      if (module !== 'all' && moduleOf(t) !== module) return false;
      if (q && !(t.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tests, module, search]);

  const filteredIds = filtered.map((t) => t.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  // The tests currently in the suite, in a stable order, so they can be
  // reviewed and removed without hunting through the filtered picker below.
  const chosen = tests.filter((t) => selected.has(t.id));

  return (
    <div className="rounded-lg border border-ink-600 bg-white p-3" data-tour="suite-tests">
      <div className="label mb-1">
        Tests in this suite
        <span className="ml-2 font-normal normal-case tracking-normal text-gray-400">
          {selected.size} selected
        </span>
      </div>

      {chosen.length === 0 ? (
        <p className="mb-3 text-xs text-gray-400">
          None yet — tick tests below to add them.
        </p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chosen.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-gray-50 py-0.5 pl-2.5 pr-1 text-xs"
            >
              <span className="max-w-[180px] truncate">{t.name}</span>
              <button
                onClick={() => onToggle(t.id)}
                className="grid h-4 w-4 place-items-center rounded-full text-gray-400 hover:bg-red-500/10 hover:text-red-600"
                title={`Remove "${t.name}" from this suite`}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            onClick={() => onBulk([...selected], false)}
            className="rounded-full px-2 py-0.5 text-xs text-gray-400 hover:text-red-600"
            title="Remove all tests from this suite"
          >
            Remove all
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="label mb-0 mr-auto">Add tests</div>
        <select
          className="input max-w-[160px] py-1 text-sm"
          value={module}
          onChange={(e) => setModule(e.target.value)}
        >
          {modules.map((m) => (
            <option key={m} value={m}>
              {m === 'all' ? 'All modules' : m}
            </option>
          ))}
        </select>
        <input
          className="input max-w-[180px] py-1 text-sm"
          placeholder="Search tests…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => onBulk(filteredIds, !allFilteredSelected)}
          disabled={filteredIds.length === 0}
          className="btn-ghost py-1 px-2.5 text-xs"
        >
          {allFilteredSelected ? 'Clear these' : 'Select all'}
        </button>
      </div>

      <div className="mt-2 max-h-64 overflow-auto rounded-md border border-ink-600 divide-y divide-ink-600">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-500">No tests match.</div>
        )}
        {filtered.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-ink-700/40"
          >
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => onToggle(t.id)}
              className="h-4 w-4 accent-brand"
            />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="text-xs text-gray-400">{moduleOf(t)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SchedulePicker({ suite }) {
  const [spec, setSpec] = useState({ ...defaultSpec(), ...(suite.scheduleSpec || {}) });

  // Persist both the structured spec (to repopulate this UI) and the UTC cron
  // string the runner evaluates.
  function apply(patch) {
    const next = { ...spec, ...patch };
    setSpec(next);
    saveSuite(suite.id, { scheduleSpec: next, schedule: buildCron(next) });
  }

  const needsTime = ['daily', 'weekdays', 'weekly'].includes(spec.freq);

  return (
    <div className="rounded-lg border border-ink-600 bg-white p-3" data-tour="suite-schedule">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Run automatically</label>
          <select
            className="input max-w-[220px]"
            value={spec.freq}
            onChange={(e) => apply({ freq: e.target.value })}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {spec.freq === 'everyN' && (
          <div>
            <label className="label">Every how many hours?</label>
            <input
              type="number"
              min={1}
              max={23}
              className="input max-w-[110px]"
              value={spec.everyHours}
              onChange={(e) => apply({ everyHours: Number(e.target.value) })}
            />
          </div>
        )}

        {spec.freq === 'weekly' && (
          <div>
            <label className="label">Day</label>
            <select
              className="input max-w-[150px]"
              value={spec.weekday}
              onChange={(e) => apply({ weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsTime && (
          <div>
            <label className="label">Time</label>
            <input
              type="time"
              className="input max-w-[140px]"
              value={spec.time}
              onChange={(e) => apply({ time: e.target.value })}
            />
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {describeSchedule(spec)}
        {spec.freq !== 'manual' && ` · times shown in ${localTzLabel()}; scheduled runs fire within the hour.`}
      </p>
    </div>
  );
}
