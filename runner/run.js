import { chromium } from 'playwright';
import { FieldValue } from 'firebase-admin/firestore';
import { db, bucket } from './firebase-admin.js';
import { runTest } from './playback.js';

const VIEWPORT = { width: 1280, height: 800 };

async function uploadScreenshot(runId, index, buffer) {
  if (!bucket) return null;
  const file = bucket.file(`runs/${runId}/step-${String(index).padStart(2, '0')}.png`);
  await file.save(buffer, { contentType: 'image/png', resumable: false });
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1 year
  });
  return url;
}

// Post a failure alert to a Discord channel webhook. No-op unless the run
// failed and DISCORD_WEBHOOK_URL is configured.
async function notifyDiscord({ runId, testName, outcome, errorMsg, steps, durationMs }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  if (outcome !== 'failed' && outcome !== 'error') return;

  const failed = (steps || []).find((s) => s.status === 'failed' || s.status === 'error');
  const detail = failed
    ? `**Failed step:** ${failed.label || failed.type}\n\`\`\`${(failed.message || 'no message').slice(0, 600)}\`\`\``
    : errorMsg
      ? `\`\`\`${errorMsg.slice(0, 600)}\`\`\``
      : 'The run failed.';
  const base = (process.env.DASHBOARD_URL || '').replace(/\/+$/, '');
  const link = base ? `${base}/runs/${runId}` : undefined;

  const body = {
    embeds: [
      {
        title: `❌ Test failed: ${testName || 'Untitled test'}`,
        url: link,
        color: 0xef4444,
        description: detail,
        fields: [
          { name: 'Status', value: String(outcome), inline: true },
          { name: 'Duration', value: `${Math.round((durationMs || 0) / 1000)}s`, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Lev.Charity QA' },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn('Discord notify failed:', res.status, await res.text().catch(() => ''));
    else console.log('→ Discord alert sent');
  } catch (e) {
    console.warn('Discord notify error:', e.message);
  }
}

async function executeRun(runId) {
  const runRef = db.collection('runs').doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    console.error(`Run ${runId} not found`);
    return;
  }
  const run = runSnap.data();

  const testSnap = await db.collection('tests').doc(run.testId).get();
  if (!testSnap.exists) {
    await runRef.update({
      status: 'error',
      error: `Test ${run.testId} no longer exists`,
      finishedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const test = { id: testSnap.id, ...testSnap.data() };

  await runRef.update({ status: 'running', testName: test.name });
  console.log(`▶ Running "${test.name}" (${test.steps?.length || 0} steps) → run ${runId}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  const collected = [];
  const startedAt = Date.now();
  let outcome = 'passed';
  let errorMsg = null;

  try {
    let i = 0;
    const { status } = await runTest(page, test, async (result, pg) => {
      try {
        const shot = await pg.screenshot({ fullPage: false });
        result.screenshotUrl = await uploadScreenshot(runId, i, shot);
      } catch (e) {
        console.warn('screenshot failed:', e.message);
      }
      i += 1;
      collected.push(result);
      // stream progress to the dashboard
      await runRef.update({ steps: collected, durationMs: Date.now() - startedAt });
      console.log(`  ${result.status === 'passed' ? '✓' : '✗'} ${result.label}`);
    });
    outcome = status;
  } catch (e) {
    outcome = 'error';
    errorMsg = e.message;
    console.error('run error:', e);
  } finally {
    await browser.close();
  }

  await runRef.update({
    status: outcome,
    steps: collected,
    error: errorMsg,
    durationMs: Date.now() - startedAt,
    finishedAt: FieldValue.serverTimestamp(),
  });
  console.log(`■ Run ${runId} finished: ${outcome}`);
  await notifyDiscord({
    runId,
    testName: test.name,
    outcome,
    errorMsg,
    steps: collected,
    durationMs: Date.now() - startedAt,
  });
  return outcome;
}

async function drainQueue() {
  // No orderBy so no composite index is required; the queued set is small, so
  // we sort by start time in memory.
  const snap = await db.collection('runs').where('status', '==', 'queued').limit(50).get();
  if (snap.empty) {
    console.log('No queued runs.');
    return;
  }
  const toMs = (t) => (t?.toMillis ? t.toMillis() : 0);
  const docs = snap.docs.sort((a, b) => toMs(a.data().startedAt) - toMs(b.data().startedAt));
  console.log(`Draining ${docs.length} queued run(s)…`);
  for (const doc of docs) {
    await executeRun(doc.id);
  }
}

// Enqueue and execute every active test. Used by the daily scheduled job so
// the whole suite is checked automatically without anyone clicking "Run".
async function runAllActive() {
  const snap = await db.collection('tests').get();
  const tests = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.status !== 'archived');
  if (tests.length === 0) {
    console.log('No active tests to run.');
    return;
  }
  console.log(`Daily check: running ${tests.length} active test(s)…`);
  let failures = 0;
  for (const test of tests) {
    const runRef = await db.collection('runs').add({
      testId: test.id,
      testName: test.name,
      status: 'queued',
      startedAt: FieldValue.serverTimestamp(),
      finishedAt: null,
      triggeredBy: 'schedule',
      steps: [],
      durationMs: 0,
      browser: 'chromium',
      error: null,
    });
    const outcome = await executeRun(runRef.id);
    if (outcome === 'failed' || outcome === 'error') failures += 1;
  }
  if (failures > 0) process.exitCode = 1;
}

async function main() {
  const runId = process.env.RUN_ID;
  if (runId) {
    const outcome = await executeRun(runId);
    // non-zero exit on failure so the GitHub Actions job reflects it
    if (outcome === 'failed' || outcome === 'error') process.exitCode = 1;
  } else if (process.env.RUN_ALL === '1') {
    await runAllActive();
  } else {
    await drainQueue();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
