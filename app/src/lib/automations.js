// Shared automation model: the list of tutorial-derived checks (one per
// category, plus the tutorial-hub monitor) and helpers to read per-page and
// per-category status out of a run. Used by the Automations tab and the
// Automations report so both agree on what was tested.
import { TUTORIAL_AUTOMATIONS, ADMIN_BASE, TUTORIAL_HUB } from './tutorialAutomations';

export { ADMIN_BASE, TUTORIAL_HUB };

export const HUB_SLUG = '__tutorial_hub__';

// One spec per check: the hub monitor first, then a check per tutorial category.
// `links` are the admin pages a check visits — i.e. the steps it tests.
export const SPECS = [
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

const isFail = (s) => s === 'failed' || s === 'error';

// Status of a single page within a run, matched against the step labels the
// runner records ("Go to <url>" for navigate, 'Assert URL contains "<path>"'
// for the URL check). Returns: passed | changed | failed | skipped | running |
// never. "skipped" = the run stopped before reaching this page (an earlier
// step failed), so it was never exercised.
export function pageStatus(run, href) {
  if (!run) return 'never';
  if (run.status === 'queued' || run.status === 'running') return 'running';
  const steps = run.steps || [];
  const nav = steps.find((s) => s.type === 'navigate' && s.label === `Go to ${ADMIN_BASE}${href}`);
  const assert = steps.find((s) => s.type === 'assertUrl' && s.label === `Assert URL contains "${href}"`);
  if (!nav && !assert) return 'skipped';
  if ((nav && isFail(nav.status)) || (assert && isFail(assert.status))) return 'failed';
  const changed = nav?.visual?.status === 'changed' || assert?.visual?.status === 'changed';
  return changed ? 'changed' : 'passed';
}

// Overall status of a category from its test + latest automation run.
export function categoryStatus(test, run) {
  if (!test) return 'not_generated';
  if ((test.steps?.length || 0) === 0) return 'needs_steps';
  if (!run) return 'never';
  if (run.status === 'queued' || run.status === 'running') return 'running';
  if (isFail(run.status)) return 'failed';
  const changed = (run.steps || []).some((s) => s?.visual?.status === 'changed');
  return changed ? 'changed' : 'passed';
}

// Visual vocabulary for the custom automation statuses (dot + label + pill).
export const AUTOMATION_STATUS = {
  passed: { label: 'Passed', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' },
  changed: { label: 'Changed', dot: 'bg-amber-400', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70' },
  failed: { label: 'Failed', dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70' },
  running: { label: 'Running', dot: 'bg-blue-400', pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70' },
  skipped: { label: 'Not reached', dot: 'bg-ink-500', pill: 'bg-ink-700 text-gray-500' },
  never: { label: 'Not run', dot: 'bg-ink-500', pill: 'bg-ink-700 text-gray-500' },
  needs_steps: { label: 'No steps', dot: 'bg-slate-400', pill: 'bg-ink-700 text-gray-500' },
  not_generated: { label: 'Not generated', dot: 'bg-ink-500', pill: 'bg-ink-700 text-gray-500' },
};
