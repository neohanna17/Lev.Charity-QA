import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SPECS, pageStatus, categoryStatus, AUTOMATION_STATUS, ADMIN_BASE } from '../lib/automations';
import { timeAgo, fmtDuration } from '../lib/format';

// A tutorial-styled report for the daily automation checks: categories on the
// left (mirroring the admin tutorial's nav), the selected category's tested
// pages on the right, each tagged passed / changed / failed. Kept entirely
// separate from the manually-built Module health stats.
export default function AutomationReport({ runs, tests }) {
  const autoTests = useMemo(() => (tests || []).filter((t) => t.automation), [tests]);
  const testBySlug = useMemo(() => {
    const m = {};
    for (const t of autoTests) if (t.tutorialSlug) m[t.tutorialSlug] = t;
    return m;
  }, [autoTests]);
  const lastRunFor = (testId) => (runs || []).find((r) => r.automation && r.testId === testId);

  const cats = useMemo(
    () =>
      SPECS.map((spec) => {
        const test = testBySlug[spec.slug];
        const run = test ? lastRunFor(test.id) : null;
        return { spec, test, run, status: categoryStatus(test, run) };
      }),
    [testBySlug, runs],
  );

  const summary = useMemo(() => {
    const c = { total: SPECS.length, generated: 0, passed: 0, changed: 0, failed: 0 };
    for (const x of cats) {
      if (x.test) c.generated += 1;
      if (x.status === 'passed') c.passed += 1;
      else if (x.status === 'changed') c.changed += 1;
      else if (x.status === 'failed') c.failed += 1;
    }
    return c;
  }, [cats]);

  // Default to the first category that needs attention, else the first.
  const initial =
    cats.find((c) => c.status === 'failed')?.spec.slug ||
    cats.find((c) => c.status === 'changed')?.spec.slug ||
    cats[0]?.spec.slug;
  const [selected, setSelected] = useState(initial);
  const current = cats.find((c) => c.spec.slug === selected) || cats[0];

  if (summary.generated === 0) {
    return (
      <div className="card mt-6 p-10 text-center text-sm text-gray-500">
        No automation checks generated yet. Head to{' '}
        <Link to="/automations" className="text-brand hover:underline">
          Automations
        </Link>{' '}
        and press “Generate” to create the daily tutorial checks, then run them.
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Summary tiles — coverage, not pass/fail of manual modules */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Coverage" value={`${summary.generated}/${summary.total}`} sub="categories generated" />
        <Tile label="Passed" value={summary.passed} tone="text-emerald-600" />
        <Tile label="Changed" value={summary.changed} tone="text-amber-600" />
        <Tile label="Failing" value={summary.failed} tone="text-rose-600" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Left: category nav, like the tutorial sidebar */}
        <aside className="card max-h-[34rem] overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {cats.map(({ spec, status }) => {
              const active = spec.slug === selected;
              const meta = AUTOMATION_STATUS[status] || AUTOMATION_STATUS.never;
              return (
                <li key={spec.slug}>
                  <button
                    onClick={() => setSelected(spec.slug)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:bg-ink-700/50'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
                    <span className="truncate">{spec.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Right: tested pages for the selected category */}
        <div className="card p-5">
          {current && <CategoryDetail {...current} />}
        </div>
      </div>
    </div>
  );
}

function CategoryDetail({ spec, test, run, status }) {
  const meta = AUTOMATION_STATUS[status] || AUTOMATION_STATUS.never;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-gray-900">{spec.title}</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            {spec.links.length} page{spec.links.length === 1 ? '' : 's'} tested
            {run && (
              <>
                {' · '}
                {timeAgo(run.startedAt)} · {fmtDuration(run.durationMs)}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.pill}`}>{meta.label}</span>
          {run && (
            <Link to={`/runs/${run.id}`} className="text-xs font-medium text-brand hover:underline">
              View run →
            </Link>
          )}
        </div>
      </div>

      {!test ? (
        <div className="mt-4 rounded-lg bg-ink-700/50 px-4 py-3 text-sm text-gray-500">
          Not generated yet — create it from the Automations tab.
        </div>
      ) : !run ? (
        <div className="mt-4 rounded-lg bg-ink-700/50 px-4 py-3 text-sm text-gray-500">
          Never run yet. Run it from the Automations tab or wait for the morning sweep.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-ink-600/70">
          {spec.links.map((l) => {
            const st = pageStatus(run, l.href);
            const pm = AUTOMATION_STATUS[st] || AUTOMATION_STATUS.never;
            return (
              <li key={l.href} className="flex items-center gap-3 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${pm.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-gray-800">{l.label}</div>
                  <div className="truncate font-mono text-[11px] text-gray-400">{l.href}</div>
                </div>
                {st === 'changed' && run ? (
                  <Link
                    to={`/runs/${run.id}`}
                    title="See the visual diff on the run"
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium hover:underline ${pm.pill}`}
                  >
                    {pm.label} →
                  </Link>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.pill}`}>
                    {pm.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <a
        href={`${ADMIN_BASE}${spec.links[0].href}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block text-xs text-gray-400 hover:text-brand hover:underline"
      >
        Open this area on lev.charity ↗
      </a>
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
