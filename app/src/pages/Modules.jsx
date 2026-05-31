import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { watchTests, watchRecentRuns, createTest } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { moduleOf, DEFAULT_MODULES } from '../lib/schema';

export default function Modules() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState(null);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    const u1 = watchTests(setTests);
    const u2 = watchRecentRuns(setRuns, 200);
    return () => {
      u1();
      u2();
    };
  }, []);

  // Import a recording handed off from the Chrome extension via #import=<b64>.
  useEffect(() => {
    const m = window.location.hash.match(/import=([^&]+)/);
    if (!m) return;
    (async () => {
      try {
        const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
        const rec = JSON.parse(json);
        const id = await createTest({
          name: rec.name || 'Recorded test',
          module: rec.module || '',
          startUrl: rec.startUrl || '',
          steps: rec.steps || [],
          createdBy: user?.email || null,
        });
        window.history.replaceState(null, '', window.location.pathname);
        navigate(`/tests/${id}`);
      } catch (e) {
        alert('Could not import recording: ' + e.message);
        window.history.replaceState(null, '', window.location.pathname);
      }
    })();
  }, [user]);

  async function handleNew() {
    const id = await createTest({
      name: 'New test',
      startUrl: import.meta.env.VITE_DEFAULT_BASE_URL || '',
      createdBy: user?.email || null,
    });
    navigate(`/tests/${id}`);
  }

  if (!tests) return <Spinner label="Loading modules…" />;

  const lastRunFor = (testId) => runs.find((r) => r.testId === testId);

  // Group tests by module, then summarise health from each test's last run.
  const groups = {};
  for (const t of tests) {
    const m = moduleOf(t);
    (groups[m] ||= []).push(t);
  }
  const names = Object.keys(groups).sort((a, b) => {
    const rank = (n) =>
      n === 'Uncategorized'
        ? 999
        : DEFAULT_MODULES.indexOf(n) === -1
          ? 500
          : DEFAULT_MODULES.indexOf(n);
    const ra = rank(a);
    const rb = rank(b);
    return ra === rb ? a.localeCompare(b) : ra - rb;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Modules</h1>
          <p className="text-sm text-gray-400">
            Pick a module to see its tests. Record with the Lev.Charity QA extension or add
            tests by hand.
          </p>
        </div>
        <button onClick={handleNew} className="btn-primary">
          + New test
        </button>
      </div>

      {names.length === 0 ? (
        <div className="card mt-6 p-10 text-center text-gray-400">
          No tests yet. Install the recorder extension and capture a flow on{' '}
          <span className="text-gray-200">lev.charity</span>, or create one manually.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {names.map((name) => {
            const list = groups[name];
            let passed = 0;
            let failed = 0;
            let never = 0;
            for (const t of list) {
              const last = lastRunFor(t.id);
              if (!last) never += 1;
              else if (last.status === 'passed') passed += 1;
              else if (last.status === 'failed' || last.status === 'error') failed += 1;
            }
            return (
              <button
                key={name}
                onClick={() => navigate(`/modules/${encodeURIComponent(name)}`)}
                className="card p-5 text-left transition-colors hover:bg-ink-700/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{name}</span>
                  <span className="text-xs text-gray-500">
                    {list.length} test{list.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {passed > 0 && (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-green-400">
                      {passed} passing
                    </span>
                  )}
                  {failed > 0 && (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-400">
                      {failed} failing
                    </span>
                  )}
                  {never > 0 && (
                    <span className="rounded-full bg-ink-600 px-2 py-0.5 text-gray-400">
                      {never} not run
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
