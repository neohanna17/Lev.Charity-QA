import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { watchTests, watchRecentRuns, watchComponents, createTest } from '../lib/db';
import { triggerRun } from '../lib/triggerRun';
import { useAuth } from '../context/AuthContext';
import { cryptoId } from '../lib/schema';
import { TUTORIAL_AUTOMATIONS, ADMIN_BASE, TUTORIAL_HUB } from '../lib/tutorialAutomations';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { timeAgo, fmtDuration } from '../lib/format';

const HUB_SLUG = '__tutorial_hub__';

// Every automation we know how to generate: the tutorial-hub monitor first,
// then one smoke check per tutorial category.
const SPECS = [
  {
    slug: HUB_SLUG,
    title: 'Tutorial hub — daily update check',
    module: 'Tutorial Monitor',
    links: [TUTORIAL_HUB],
    hub: true,
  },
  ...TUTORIAL_AUTOMATIONS.map((c) => ({
    slug: c.slug,
    title: c.title,
    module: c.title,
    links: c.links,
  })),
];

// Build the steps for one automation test: log in, then visit each admin page
// and assert the URL landed (catches auth failures, redirects, dead links).
function buildSteps(spec, login) {
  const steps = [
    { id: cryptoId(), type: 'component', componentId: login.id, componentName: login.name, selectors: [] },
  ];
  for (const l of spec.links) {
    steps.push({
      id: cryptoId(),
      type: 'navigate',
      value: ADMIN_BASE + l.href,
      selectors: [],
      target: { label: l.label },
    });
    steps.push({
      id: cryptoId(),
      type: 'assertUrl',
      value: l.href,
      selectors: [],
      target: { label: '' },
    });
  }
  return steps;
}

export default function Automations() {
  const { user } = useAuth();
  const [tests, setTests] = useState(null);
  const [runs, setRuns] = useState([]);
  const [components, setComponents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const u1 = watchTests(setTests);
    const u2 = watchRecentRuns(setRuns, 200);
    const u3 = watchComponents(setComponents);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const login = useMemo(
    () => components.find((c) => /log\s*in|sign\s*in/i.test(c.name || '')),
    [components],
  );

  const autoTests = useMemo(() => (tests || []).filter((t) => t.automation), [tests]);
  const testBySlug = useMemo(() => {
    const m = {};
    for (const t of autoTests) if (t.tutorialSlug) m[t.tutorialSlug] = t;
    return m;
  }, [autoTests]);
  const lastRunFor = (testId) => runs.find((r) => r.automation && r.testId === testId);

  const generated = SPECS.filter((s) => testBySlug[s.slug]);
  const missing = SPECS.filter((s) => !testBySlug[s.slug]);

  async function generate() {
    if (!login) {
      alert(
        'No “Log in” component found. Create a reusable component named “Log in” on the Components page first (it should use {{LEV_TEST_EMAIL}} / {{LEV_TEST_PASSWORD}}), then generate.',
      );
      return;
    }
    if (
      !confirm(
        `Create ${missing.length} automation test(s)? They log in and smoke-check the admin pages from the tutorial. Existing ones are left untouched.`,
      )
    )
      return;
    setBusy(true);
    setNote('');
    try {
      let made = 0;
      for (const spec of missing) {
        await createTest({
          name: `[Auto] ${spec.title}`,
          module: spec.module,
          automation: true,
          tutorialSlug: spec.slug,
          startUrl: ADMIN_BASE + spec.links[0].href,
          description: spec.hub
            ? 'Daily check that the admin Tutorial hub still loads when logged in. Set a visual baseline on this test so the morning run flags new tutorials/sections as a visual change.'
            : `Daily login + smoke check for “${spec.title}”: logs in and verifies each linked admin page loads. Read-only — safe to run unattended.`,
          steps: buildSteps(spec, login),
          createdBy: user?.email || null,
        });
        made += 1;
        setNote(`Created ${made}/${missing.length}…`);
      }
      setNote(`✓ Created ${made} automation test${made === 1 ? '' : 's'}.`);
    } catch (e) {
      alert('Generation failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    if (autoTests.length === 0) return;
    if (!confirm(`Run all ${autoTests.length} automation test(s) now?`)) return;
    setBusy(true);
    setNote('');
    try {
      let queued = 0;
      for (const t of autoTests) {
        if ((t.steps?.length || 0) === 0) continue;
        await triggerRun(t, { automation: true });
        queued += 1;
        setNote(`Queued ${queued}/${autoTests.length}…`);
      }
      setNote(`✓ Queued ${queued} run${queued === 1 ? '' : 's'}. Watch the results below.`);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function runOne(test) {
    setBusy(true);
    try {
      await triggerRun(test, { automation: true });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!tests) return <Spinner label="Loading automations…" />;

  const autoRuns = runs.filter((r) => r.automation);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Automations</h1>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              daily · scheduled
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Quick, read-only login-and-smoke checks generated from the admin{' '}
            <a href={`${ADMIN_BASE}/admin/tutorial`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              tutorial
            </a>
            . They log in with the QA bot and verify each admin page still loads. These run on
            their own morning schedule — separate from your Modules, Runs and Suites.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {missing.length > 0 && (
            <button onClick={generate} disabled={busy} className="btn-primary">
              {busy ? 'Working…' : `+ Generate ${missing.length} test${missing.length === 1 ? '' : 's'}`}
            </button>
          )}
          {autoTests.length > 0 && (
            <button onClick={runAll} disabled={busy} className="btn-ghost">
              ▶ Run all now
            </button>
          )}
        </div>
      </div>

      {note && (
        <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2 text-sm text-brand">
          {note}
        </div>
      )}

      {!login && missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800">
          To generate these, first create a reusable <strong>Log in</strong> component on the{' '}
          <Link to="/components" className="underline">Components</Link> page (using{' '}
          <code>{'{{LEV_TEST_EMAIL}}'}</code> / <code>{'{{LEV_TEST_PASSWORD}}'}</code>). The
          automations reuse it to log in every morning.
        </div>
      )}

      {/* Schedule explainer */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Info title="When they run" body="Every morning at 05:30 UTC (~07:30 SAST / 08:30 IDT) via GitHub Actions — plus any time you press “Run all now”." />
        <Info title="What's safe daily" body="Only read-only page loads run here. Anything that creates, edits or deletes data is NOT auto-generated — keep those as normal Module tests." />
        <Info title="Catching tutorial updates" body="Set a visual baseline on the “Tutorial hub” check; the morning run then flags a ⚠ visual change whenever new tutorials or sections appear." />
      </div>

      {/* The automation set */}
      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Checks ({generated.length}/{SPECS.length})
      </h2>
      <div className="card divide-y divide-ink-600">
        {SPECS.map((spec) => {
          const test = testBySlug[spec.slug];
          const last = test && lastRunFor(test.id);
          return (
            <div key={spec.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {spec.hub && <span title="Tutorial monitor">📣</span>}
                  <span className="truncate text-sm font-medium text-gray-800">{spec.title}</span>
                  {!test && (
                    <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-gray-500">
                      not generated
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {spec.links.length} page{spec.links.length === 1 ? '' : 's'}
                  {last && (
                    <>
                      {' · '}
                      {timeAgo(last.startedAt)} · {fmtDuration(last.durationMs)}
                    </>
                  )}
                </div>
              </div>
              {last && <StatusBadge status={last.status} />}
              {test ? (
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => runOne(test)} disabled={busy} className="btn-ghost py-1 px-2.5 text-xs">
                    ▶ Run
                  </button>
                  <Link to={`/tests/${test.id}`} className="btn-ghost py-1 px-2.5 text-xs">
                    Open
                  </Link>
                </div>
              ) : (
                <span className="shrink-0 text-xs text-gray-400">—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent automation runs */}
      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Recent automation runs
      </h2>
      <div className="card divide-y divide-ink-600">
        {autoRuns.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">
            No automation runs yet. Generate the checks, then “Run all now” (or wait for the
            morning sweep).
          </div>
        )}
        {autoRuns.slice(0, 40).map((r) => (
          <Link
            key={r.id}
            to={`/runs/${r.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-700/50"
          >
            <StatusBadge status={r.status} />
            <span className="min-w-0 flex-1 truncate text-sm">{r.testName}</span>
            <span className="shrink-0 text-xs text-gray-500">
              {timeAgo(r.startedAt)} · {fmtDuration(r.durationMs)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Info({ title, body }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-gray-50 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      <div className="mt-1 text-xs text-gray-600">{body}</div>
    </div>
  );
}
