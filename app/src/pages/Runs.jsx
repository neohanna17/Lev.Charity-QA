import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { watchRecentRuns, watchTests } from '../lib/db';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { timeAgo, fmtDuration } from '../lib/format';
import { moduleOf } from '../lib/schema';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'passed', label: 'Passed' },
  { value: 'running', label: 'In progress' },
];

export default function Runs() {
  const [runs, setRuns] = useState(null);
  const [tests, setTests] = useState([]);
  const [status, setStatus] = useState('all');
  const [module, setModule] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const u1 = watchRecentRuns(setRuns, 200);
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

  const modules = useMemo(
    () => [...new Set(Object.values(moduleByTest))].sort(),
    [moduleByTest],
  );

  const filtered = useMemo(() => {
    if (!runs) return [];
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (status === 'failed' && !(r.status === 'failed' || r.status === 'error')) return false;
      if (status === 'passed' && r.status !== 'passed') return false;
      if (status === 'running' && !(r.status === 'running' || r.status === 'queued')) return false;
      if (module !== 'all' && (moduleByTest[r.testId] || 'Uncategorized') !== module) return false;
      if (q && !(r.testName || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, status, module, search, moduleByTest]);

  if (!runs) return <Spinner label="Loading runs…" />;

  return (
    <div>
      <h1 className="text-xl font-semibold">Runs</h1>
      <p className="text-sm text-gray-500">Most recent test executions across all tests.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-white p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                status === f.value ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          className="input max-w-[180px]"
          value={module}
          onChange={(e) => setModule(e.target.value)}
        >
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="input max-w-[220px]"
          placeholder="Search by test name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} of {runs.length}
        </span>
      </div>

      <div className="card mt-4 divide-y divide-ink-600">
        {filtered.length === 0 && (
          <div className="p-10 text-center text-gray-500">No runs match these filters.</div>
        )}
        {filtered.map((r) => (
          <Link
            key={r.id}
            to={`/runs/${r.id}`}
            className="flex items-center gap-4 px-4 py-3 hover:bg-ink-700/50"
          >
            <StatusBadge status={r.status} />
            <span className="min-w-0 flex-1 truncate font-medium">{r.testName}</span>
            <span className="hidden text-xs text-gray-500 md:inline">
              {moduleByTest[r.testId] || '—'}
            </span>
            <span className="hidden text-xs text-gray-500 sm:inline">{r.triggeredBy}</span>
            <span className="text-xs text-gray-500">{fmtDuration(r.durationMs)}</span>
            <span className="w-20 text-right text-xs text-gray-500">{timeAgo(r.startedAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
