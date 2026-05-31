// Build a tracker-ready bug report from a failed run. Output is plain text that
// pastes cleanly into Jira (or any tracker) and links to the stored evidence.

import { tsToDate, fmtDuration } from './format';

export function jiraConfig() {
  return {
    site: (localStorage.getItem('jira.site') || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    project: (localStorage.getItem('jira.project') || '').trim().toUpperCase(),
  };
}

export function saveJiraConfig({ site, project }) {
  if (site != null) localStorage.setItem('jira.site', site);
  if (project != null) localStorage.setItem('jira.project', project);
}

function failingStep(run) {
  return (run.steps || []).find((s) => s.status === 'failed' || s.status === 'error') || null;
}

export function buildBugReport(run) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const runUrl = origin ? `${origin}/runs/${run.id}` : `/runs/${run.id}`;
  const when = tsToDate(run.startedAt);
  const fail = failingStep(run);
  const steps = run.steps || [];
  // Reproduce up to and including the failing step.
  const failIdx = fail ? steps.indexOf(fail) : steps.length - 1;
  const repro = steps.slice(0, failIdx + 1);

  const project = jiraConfig().project;
  const summary = `[${project || 'QA'}] ${run.testName || 'Test'} failed${fail ? ` at "${fail.label || fail.type}"` : ''}`;

  const lines = [];
  lines.push(`Test: ${run.testName || 'Untitled test'}`);
  lines.push(`Result: ${run.status}`);
  lines.push(`Browser: ${run.browser || 'chromium'}`);
  lines.push(`Duration: ${fmtDuration(run.durationMs)}`);
  if (when) lines.push(`When: ${when.toLocaleString()}`);
  lines.push(`Run report: ${runUrl}`);
  lines.push('');

  lines.push('--- What went wrong ---');
  if (fail) {
    lines.push(`Failing step: ${fail.label || fail.type}`);
    if (fail.message) lines.push(`Error:\n${fail.message}`);
  } else if (run.error) {
    lines.push(run.error);
  } else {
    lines.push('Run failed (no step-level detail captured).');
  }
  lines.push('');

  lines.push('--- Steps to reproduce ---');
  repro.forEach((s, i) => {
    const prov = s.fromComponent ? `[${s.fromComponent}] ` : '';
    lines.push(`${i + 1}. ${prov}${s.label || s.type}`);
  });
  lines.push('');

  lines.push('--- Evidence ---');
  if (fail?.screenshotUrl) lines.push(`Screenshot (failing step): ${fail.screenshotUrl}`);
  if (run.videoUrl) lines.push(`Recording: ${run.videoUrl}`);
  if (run.traceUrl) lines.push(`Playwright trace: ${run.traceUrl}`);
  if (fail?.visual?.diffUrl) lines.push(`Visual diff: ${fail.visual.diffUrl}`);
  if (!fail?.screenshotUrl && !run.videoUrl && !run.traceUrl) lines.push('No artifacts captured.');

  return { summary, description: lines.join('\n') };
}

// Best-effort deep link to the Jira create-issue screen with the summary
// prefilled. Description prefill via URL is unreliable across Jira versions, so
// we rely on the copied body for that. Returns null when no site is configured.
export function jiraCreateUrl(summary) {
  const { site } = jiraConfig();
  if (!site) return null;
  const qs = new URLSearchParams({ summary: summary || '' }).toString();
  return `https://${site}/secure/CreateIssue!default.jspa?${qs}`;
}
