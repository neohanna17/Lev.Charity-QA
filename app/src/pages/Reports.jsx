import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { watchRecentRuns, watchTests } from '../lib/db';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { timeAgo, fmtDuration, tsToDate } from '../lib/format';
import { moduleOf } from '../lib/schema';

const WINDOWS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 0, label: 'All time' },
];

const isFail = (s) => s === 'failed' || s === 'error';
const isFinished = (s) => s === 'passed' || isFail(s);

export default function Reports() {
  const [runs, setRuns] = useState(null);
  const [tests, setTests] = useState([]);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const u1 = watchRecentRuns(setRuns, 500);
    const u2 = watchTests(setTests);
    return () => {
      u1();
      u2();
    };
  }, []);

  const moduleByTest = useMemo(() => {
    const m = {};
    for (const t of tests) m[t.id] = moduleOf(t);
    return m;
  }, [tests]);

  const stats = useMemo(() => {
    if (!runs) return null;
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    const inWindow = runs.filter((r) => {
      const d = tsToDate(r.startedAt);
      return d ? d.getTime() >= cutoff : false;
    });
    const finished = inWindow.filter((r) => isFinished(r.status));
    const passed = finished.filter((r) => r.status === 'passed').length;
    const failed = finished.length - passed;
    const passRate = finished.length ? Math.round((passed / finished.length) * 100) : null;

    // Per-module health.
    const byModule = {};
    for (const r of finished) {
      const mod = moduleByTest[r.testId] || 'Uncategorized';
      (byModule[mod] ||= { module: mod, passed: 0, failed: 0 });
      if (r.status === 'passed') byModule[mod].passed += 1;
      else byModule[mod].failed += 1;
    }
    const modules = Object.values(byModule)
      .map((m) => ({ ...m, total: m.passed + m.failed, rate: Math.round((m.passed / (m.passed + m.failed)) * 100) }))
      .sort((a, b) => a.rate - b.rate);

    // Per-test aggregates (over the window).
    const byTest = {};
    for (const r of finished) {
      const id = r.testId;
      (byTest[id] ||= {
        testId: id,
        name: r.testName || tests.find((t) => t.id === id)?.name || 'Unknown test',
        runs: 0,
        passed: 0,
        failed: 0,
        statuses: [],
        durations: [],
      });
      const b = byTest[id];
      b.runs += 1;
      if (r.status === 'passed') b.passed += 1;
      else b.failed += 1;
      b.statuses.push(r.status);
      if (r.durationMs) b.durations.push(r.durationMs);
    }
    const tList = Object.values(byTest);

    const topFailing = tList
      .filter((t) => t.failed > 0)
      .map((t) => ({ ...t, rate: Math.round((t.failed / t.runs) * 100) }))
      .sort((a, b) => b.failed - a.failed || b.rate - a.rate)
      .slice(0, 8);

    // Flaky: same test both passed and failed within the window.
    const flaky = tList
      .filter((t) => t.passed > 0 && t.failed > 0)
      .map((t) => ({ ...t, rate: Math.round((t.failed / t.runs) * 100) }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 8);

    const slowest = tList
      .filter((t) => t.durations.length)
      .map((t) => ({ ...t, avg: Math.round(t.durations.reduce((s, n) => s + n, 0) / t.durations.length) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);

    const recentFailures = inWindow
      .filter((r) => isFail(r.status))
      .slice(0, 12);

    return {
      total: finished.length,
      passed,
      failed,
      passRate,
      modules,
      topFailing,
      flaky,
      slowest,
      recentFailures,
    };
  }, [runs, days, moduleByTest, tests]);

  if (!runs) return <Spinner label="Loading reports…" />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-500">Health and trends across all test runs.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-white p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setDays(w.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                days === w.value ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {stats.total === 0 ? (
        <div className="card mt-6 p-10 text-center text-gray-500">
          No finished runs in this window.
        </div>
      ) : (
        <>
          {/* Headline tiles */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Pass rate" value={`${stats.passRate}%`} accent={stats.passRate >= 90 ? 'green' : stats.passRate >= 70 ? 'amber' : 'red'} />
            <Tile label="Runs" value={stats.total} />
            <Tile label="Passed" value={stats.passed} accent="green" />
            <Tile label="Failed" value={stats.failed} accent={stats.failed ? 'red' : undefined} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Module health */}
            <Panel title="Module health">
              {stats.modules.length === 0 ? (
                <Empty>No module data.</Empty>
              ) : (
                <ul className="space-y-2">
                  {stats.modules.map((m) => (
                    <li key={m.module} className="flex items-center gap-3">
                      <span className="w-32 truncate text-sm">{m.module}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-700">
                        <div
                          className={`h-full ${m.rate >= 90 ? 'bg-emerald-500' : m.rate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${m.rate}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-xs text-gray-500">
                        {m.rate}% · {m.total} run{m.total === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Most failing */}
            <Panel title="Most failing tests">
              {stats.topFailing.length === 0 ? (
                <Empty>No failures — nice.</Empty>
              ) : (
                <ul className="divide-y divide-ink-600">
                  {stats.topFailing.map((t) => (
                    <TestRow key={t.testId} t={t} right={`${t.failed} fail · ${t.rate}%`} />
                  ))}
                </ul>
              )}
            </Panel>

            {/* Flaky */}
            <Panel title="Flaky tests" hint="Passed and failed within this window">
              {stats.flaky.length === 0 ? (
                <Empty>No flaky tests detected.</Empty>
              ) : (
                <ul className="divide-y divide-ink-600">
                  {stats.flaky.map((t) => (
                    <TestRow key={t.testId} t={t} right={`${t.passed}✓ / ${t.failed}✗`} />
                  ))}
                </ul>
              )}
            </Panel>

            {/* Slowest */}
            <Panel title="Slowest tests" hint="Average run duration">
              {stats.slowest.length === 0 ? (
                <Empty>No timing data.</Empty>
              ) : (
                <ul className="divide-y divide-ink-600">
                  {stats.slowest.map((t) => (
                    <TestRow key={t.testId} t={t} right={fmtDuration(t.avg)} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* Recent failures */}
          <Panel title="Recent failures" className="mt-6">
            {stats.recentFailures.length === 0 ? (
              <Empty>No recent failures.</Empty>
            ) : (
              <ul className="divide-y divide-ink-600">
                {stats.recentFailures.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/runs/${r.id}`}
                      className="flex items-center gap-3 px-1 py-2.5 hover:bg-ink-700/50"
                    >
                      <StatusBadge status={r.status} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.testName}</span>
                      <span className="text-xs text-gray-500">{moduleByTest[r.testId] || '—'}</span>
                      <span className="w-20 text-right text-xs text-gray-500">{timeAgo(r.startedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

const ACCENTS = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
};

function Tile({ label, value, accent }) {
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? ACCENTS[accent] : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({ title, hint, className = '', children }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      <div className="card p-4">{children}</div>
    </section>
  );
}

function TestRow({ t, right }) {
  return (
    <li>
      <Link
        to={`/tests/${t.testId}`}
        className="flex items-center gap-3 px-1 py-2.5 hover:bg-ink-700/50"
      >
        <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
        <span className="text-xs text-gray-500">{right}</span>
      </Link>
    </li>
  );
}

function Empty({ children }) {
  return <div className="py-6 text-center text-sm text-gray-500">{children}</div>;
}
