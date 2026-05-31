import { useMemo, useState } from 'react';

// In-depth technical guide aimed at QA engineers / developers who want to
// understand how the system is wired: Playwright, GitHub Actions, Firebase, and
// the data model. Same data-driven accordion pattern as the onboarding Guide.
const SECTIONS = [
  {
    id: 'architecture',
    title: 'Architecture at a glance',
    summary: 'The four moving parts and how they talk.',
    body: (
      <>
        <p>The system is four pieces, each doing one job:</p>
        <ul>
          <li>
            <strong>Dashboard</strong> — a React + Vite app hosted on Netlify. It’s the UI
            and the source of truth for <em>what</em> to test. It reads and writes Firestore
            directly from the browser (Firebase web SDK) and never runs any test itself.
          </li>
          <li>
            <strong>Firebase</strong> — Firestore stores tests, suites, components and runs;
            Storage holds run artifacts (video, trace, screenshots); Auth gates access to
            members only.
          </li>
          <li>
            <strong>Runner</strong> — a Node + Playwright script (<code>runner/run.js</code>)
            that executes inside <strong>GitHub Actions</strong>. It’s the only component
            that touches a real browser, and it uses the Firebase <em>Admin</em> SDK (service
            account) to read queued runs and write results back.
          </li>
          <li>
            <strong>Chrome extension</strong> — a Manifest V3 recorder that captures clicks
            and types into a list of steps, then hands them to the dashboard.
          </li>
        </ul>
        <p>
          Nothing in the browser ever drives Playwright; the dashboard only enqueues work and
          watches Firestore for the runner’s updates to stream in live.
        </p>
      </>
    ),
  },
  {
    id: 'lifecycle',
    title: 'Lifecycle of a run',
    summary: 'From “Run” click to results on screen.',
    body: (
      <>
        <p>A single run flows like this:</p>
        <ol>
          <li>
            The dashboard calls <code>enqueueRun()</code> — a new <code>runs</code> doc is
            written with <code>status: 'queued'</code> and the run options (fromStep, toStep,
            setupComponentId, updateBaselines).
          </li>
          <li>
            <code>triggerRun()</code> POSTs the run id to a Netlify function
            (<code>netlify/functions/trigger-run.js</code>) with the user’s Firebase ID token.
          </li>
          <li>
            The function verifies the caller and fires a GitHub{' '}
            <code>repository_dispatch</code> event of type <code>run-test</code>, carrying the
            run id as the payload.
          </li>
          <li>
            GitHub Actions starts the <strong>Run Reflect-LEV tests</strong> workflow. It
            checks out the repo, installs the runner’s deps, installs the Chromium browser,
            and runs <code>node run.js</code> with the run id in <code>RUN_ID</code>.
          </li>
          <li>
            The runner loads that run + its test from Firestore, replays the steps with
            Playwright, and after <em>each</em> step writes the result, a screenshot URL, and
            progress back to the run doc.
          </li>
          <li>
            The dashboard’s <code>watchRun()</code> listener is subscribed to that doc, so the
            steps, video and trace appear in near-real-time without a refresh.
          </li>
        </ol>
        <p>
          A GitHub Actions <code>concurrency</code> group (<code>reflect-lev-runner</code>,{' '}
          <code>cancel-in-progress: false</code>) serialises runs so two jobs never fight over
          the same baselines.
        </p>
      </>
    ),
  },
  {
    id: 'triggers',
    title: 'What triggers the runner',
    summary: 'Dispatch, manual, and two cron schedules.',
    body: (
      <>
        <p>The workflow (<code>.github/workflows/run-tests.yml</code>) has four entry points:</p>
        <ul>
          <li>
            <strong>repository_dispatch</strong> (<code>run-test</code>) — the normal path; a
            single run requested from the dashboard.
          </li>
          <li>
            <strong>workflow_dispatch</strong> — manual trigger from the Actions tab. Optional
            <code>run_id</code>; blank means “drain all queued runs”.
          </li>
          <li>
            <strong>Daily cron</strong> (<code>0 6 * * *</code>, 06:00 UTC) — full sweep:
            sets <code>RUN_ALL</code> and runs every active test, <code>RUN_CONCURRENCY</code>
            at a time (default 3). This is also when retention cleanup runs.
          </li>
          <li>
            <strong>Hourly cron</strong> (<code>0 * * * *</code>) — sets{' '}
            <code>RUN_SCHEDULED</code> and runs only the suites whose schedule is due that
            hour.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'playback',
    title: 'Step playback & self-healing',
    summary: 'How recorded steps map to Playwright calls.',
    body: (
      <>
        <p>
          <code>runner/playback.js</code> turns each recorded step into a Playwright action:{' '}
          <code>navigate</code> → <code>page.goto</code>, <code>click</code> →{' '}
          <code>locator.click</code>, <code>type</code> → <code>locator.fill</code>,{' '}
          <code>select</code>, <code>hover</code>, <code>press</code>, plus assertions
          (<code>assertText</code>, <code>assertVisible</code>, <code>assertUrl</code>).
        </p>
        <p>
          <strong>Self-healing:</strong> the recorder stores an <em>ordered list</em> of
          candidate selectors per element (id, role, text, CSS path…). At run time{' '}
          <code>resolve()</code> tries them in order and waits for the first one that resolves
          to a <em>visible</em> element. If a fallback (index &gt; 0) wins, the step is marked
          <code>healedWith</code> so you can see the original selector drifted — the run still
          passes, but you’re told. If none match, the step fails with all candidates listed.
        </p>
        <p>
          Execution is fail-fast: the first failed step stops the run (everything after is
          left unexecuted). Timeouts are 8s per action, 4s per selector attempt.
        </p>
      </>
    ),
  },
  {
    id: 'components',
    title: 'Components & setup expansion',
    summary: 'How reusable blocks are inlined before playback.',
    body: (
      <>
        <p>
          A <code>component</code> step is a reference, not a copy. Before playback,
          <code>expandComponents()</code> replaces each component step with that component’s
          steps inline, tagging each expanded step with <code>fromComponent</code> (so the run
          view can show “↳ Log in:” provenance). Expansion is <strong>one level deep</strong> —
          components can’t nest, which keeps cycles impossible.
        </p>
        <p>
          A suite’s <code>setupComponentId</code> is prepended as a synthetic component step in
          front of every test in that suite at enqueue time, so each test starts logged in
          without duplicating the login steps.
        </p>
      </>
    ),
  },
  {
    id: 'visual',
    title: 'Visual regression',
    summary: 'Baselines, diffing, and when it’s skipped.',
    body: (
      <>
        <p>
          Each step captures a screenshot. When a test has a stored baseline for that step,
          the runner pixel-diffs the new shot against it. If the fraction of differing pixels
          exceeds <code>VISUAL_THRESHOLD</code> (default 0.01 = 1%), the step is flagged{' '}
          <code>visual: changed</code> with the ratio and a diff image; otherwise it’s
          unchanged. With no baseline yet, the shot becomes the baseline
          (<code>baseline-created</code>).
        </p>
        <p>
          Baselines are (re)captured by running with <code>updateBaselines</code> (the “Set
          visual baseline” button). Visual checks are <strong>skipped</strong> for partial
          runs (run-from / run-until) and when a setup component is prepended, because the
          step indices no longer line up with the baseline set.
        </p>
      </>
    ),
  },
  {
    id: 'secrets',
    title: 'Credentials & secrets',
    summary: 'How login works without leaking passwords.',
    body: (
      <>
        <p>
          Test steps store the literal tokens <code>{'{{LEV_TEST_EMAIL}}'}</code> and{' '}
          <code>{'{{LEV_TEST_PASSWORD}}'}</code>. The real values live as GitHub Actions
          repository secrets and are exposed to the runner only as environment variables.
        </p>
        <p>
          <code>injectSecrets()</code> substitutes <code>{'{{ENV_VAR}}'}</code> tokens with{' '}
          <code>process.env</code> values <em>only at the instant the value is typed</em> into
          the page — never on the stored step, its label, the streamed progress, or Firestore.
          So the plaintext password never touches the database, the logs, or the UI.
        </p>
        <p>
          The runner authenticates to Firebase with a service-account JSON
          (<code>FIREBASE_SERVICE_ACCOUNT</code> secret); the dashboard uses the public
          Firebase web config (safe to expose) plus member-gated Firestore rules.
        </p>
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Artifacts, retention & data model',
    summary: 'Where everything is stored and for how long.',
    body: (
      <>
        <p>
          Per-run artifacts (video, Playwright trace, screenshots, visual diffs) are uploaded
          to Firebase Storage under <code>runs/&#123;runId&#125;/</code> and referenced from
          the run doc by signed URL (valid ~1 year).
        </p>
        <p>
          <strong>Retention:</strong> during the daily sweep, <code>cleanupOldRuns()</code>{' '}
          deletes runs (and their Storage prefix) older than <code>RETENTION_DAYS</code>{' '}
          (default 30; set 0 to keep forever). Deleting a run from the dashboard removes the
          doc immediately; its Storage prefix is reaped by the same sweep.
        </p>
        <p>
          <strong>Firestore collections:</strong> <code>tests</code>, <code>suites</code>,{' '}
          <code>components</code>, <code>runs</code>, and <code>members</code> (the allow-list
          that gates access). Runs are queried by <code>startedAt</code> and{' '}
          <code>testId</code> — both single-field indexes that exist automatically.
        </p>
      </>
    ),
  },
  {
    id: 'local',
    title: 'Running & extending locally',
    summary: 'For developers touching the runner.',
    body: (
      <>
        <p>
          The runner is self-contained in <code>runner/</code>. To run it locally you need the
          same env vars the workflow sets (<code>FIREBASE_SERVICE_ACCOUNT</code>,{' '}
          <code>FIREBASE_STORAGE_BUCKET</code>, <code>FIREBASE_PROJECT_ID</code>, the{' '}
          <code>LEV_TEST_*</code> creds, and a <code>RUN_ID</code> or <code>RUN_ALL</code>),
          then <code>npm install</code> in <code>runner/</code>, install Chromium, and run{' '}
          <code>node run.js</code>.
        </p>
        <p>
          <strong>Adding a step type</strong> means three edits kept in sync: the vocabulary in{' '}
          <code>app/src/lib/schema.js</code> (<code>STEP_TYPES</code>), the executor in{' '}
          <code>runner/playback.js</code> (<code>execStep</code>), and — if the recorder
          should emit it — the Chrome extension’s content script. The dashboard never installs
          packages at the repo root; the app and runner have separate dependency trees.
        </p>
      </>
    ),
  },
];

export default function TechGuide() {
  const [openId, setOpenId] = useState(SECTIONS[0].id);
  const toc = useMemo(() => SECTIONS.map((s) => ({ id: s.id, title: s.title })), []);

  return (
    <div>
      <h1 className="text-xl font-semibold">Technical guide</h1>
      <p className="text-sm text-gray-500">
        How the QA system is built — Playwright, GitHub Actions and Firebase. For QA engineers
        and developers who want the full picture.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-8 space-y-1">
            {toc.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setOpenId(t.id);
                  document
                    .getElementById(`tsec-${t.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  openId === t.id
                    ? 'bg-brand/10 text-brand'
                    : 'text-gray-500 hover:bg-ink-700 hover:text-gray-800'
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
        </nav>

        <div className="space-y-3">
          {SECTIONS.map((s) => {
            const open = openId === s.id;
            return (
              <div key={s.id} id={`tsec-${s.id}`} className="card overflow-hidden scroll-mt-8">
                <button
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="text-sm text-gray-500">{s.summary}</span>
                  </span>
                  <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>
                    ›
                  </span>
                </button>
                {open && (
                  <div className="guide-body border-t border-ink-600 px-5 py-4 text-sm leading-relaxed text-gray-700">
                    {s.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
