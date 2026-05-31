import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// Interactive product tour. Mounted once inside the Layout (so it can navigate
// via React Router) and started by dispatching a `start-product-tour` window
// event from anywhere (e.g. the Guide page button).
//
// Steps walk across every main page. `path` switches route before a step; the
// tour waits for the step's target element to appear before highlighting it.
// Elements are matched by `data-tour="…"` anchors placed throughout the app; a
// step with no `element` shows a centred popover.
const STEPS = [
  {
    path: '/',
    popover: {
      title: '👋 Welcome to Lev.Charity QA',
      description:
        "This quick tour walks through every part of the dashboard and what each button does. Use Next / Back, or press Esc to leave any time.",
    },
  },

  // ---- Sidebar ----
  {
    path: '/',
    element: '[data-tour="nav-modules"]',
    popover: {
      title: 'Modules',
      description: 'Home. Your tests grouped by area of the site (Campaigns, Donations…).',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-runs"]',
    popover: { title: 'Runs', description: 'Every test execution, newest first.', side: 'right' },
  },
  {
    element: '[data-tour="nav-suites"]',
    popover: {
      title: 'Suites',
      description: 'Groups of tests you run together — on demand or on a schedule.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-components"]',
    popover: {
      title: 'Components',
      description: 'Reusable blocks of steps — like “Log in” — that you drop into many tests.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-reports"]',
    popover: {
      title: 'Reports',
      description: 'Pass rates, module health, flaky and slowest tests, recent failures.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-guide"]',
    popover: {
      title: 'Guide',
      description: 'The written, step-by-step onboarding — read it any time.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-tech"]',
    popover: {
      title: 'Tech guide',
      description: 'How it all works under the hood: Playwright, GitHub Actions, Firebase.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-signout"]',
    popover: { title: 'Sign out', description: 'Leave the dashboard. Access is members-only.', side: 'right' },
  },

  // ---- Modules page ----
  {
    path: '/',
    element: '[data-tour="modules-smoke"]',
    popover: {
      title: '+ Login smoke test',
      description:
        'One click creates a starter test that runs your “Log in” component and checks it reached the dashboard. The fastest way to confirm login works.',
    },
  },
  {
    element: '[data-tour="modules-new"]',
    popover: {
      title: '+ New test',
      description: 'Create a blank test to build by hand, step by step.',
    },
  },
  {
    element: '[data-tour="modules-card"]',
    popover: {
      title: 'Module cards',
      description:
        'Each card shows its test count and health — passing / failing / not run. Empty modules are dashed. Click a card to see its tests, then click a test to open the editor where you Run it, Save, set a visual baseline, Save-as-component, archive or delete.',
    },
  },

  // ---- Runs page ----
  {
    path: '/runs',
    element: '[data-tour="runs-toolbar"]',
    popover: {
      title: 'Filter runs',
      description: 'Narrow by status (all / failed / passed / in progress), module, or test name.',
    },
  },
  {
    element: '[data-tour="runs-list"]',
    popover: {
      title: 'Run history',
      description:
        'Each row is one execution. Click one to open its detail: the video recording, a downloadable Playwright trace, per-step screenshots and self-heal notes — plus ↻ Re-run, Delete run, and (on failures) Create bug report for Jira.',
    },
  },

  // ---- Suites page ----
  {
    path: '/suites',
    element: '[data-tour="suites-new"]',
    popover: { title: '+ New suite', description: 'Create a group of tests that run together.' },
  },
  {
    element: '[data-tour="suite-card"]',
    popover: {
      title: 'A suite',
      description:
        'Collapses to a one-line summary (tests · schedule · before/after components). Expand it to set a schedule, add components to run before and after every test (e.g. Log in / Log out), and pick tests filtered by module and search. “▶ Run suite” runs them all now.',
    },
  },

  // ---- Components page ----
  {
    path: '/components',
    element: '[data-tour="components-new"]',
    popover: {
      title: '+ New component',
      description: 'Save a sequence of steps once (like “Log in”) and reuse it across tests.',
    },
  },
  {
    element: '[data-tour="components-list"]',
    popover: {
      title: 'Your components',
      description:
        'Expand one to edit its steps — every test that uses it updates automatically. You can also create a component straight from a recording in the Chrome extension.',
    },
  },

  // ---- Reports page ----
  {
    path: '/reports',
    element: '[data-tour="reports-window"]',
    popover: {
      title: 'Time window',
      description: 'Switch between the last 7 days, 30 days, or all time.',
    },
  },
  {
    element: '[data-tour="reports-tiles"]',
    popover: {
      title: 'Headline health',
      description:
        'Overall pass rate and run counts, then panels for module health, most-failing, flaky and slowest tests, and recent failures. Click any item to jump straight to it.',
    },
  },

  // ---- Finish ----
  {
    path: '/guide',
    element: '[data-tour="nav-guide"]',
    popover: {
      title: "🎉 That's the tour!",
      description:
        'You can reopen this walkthrough any time from the Guide page, or read the written guide for more detail. Happy testing!',
      side: 'right',
    },
  },
];

function waitForEl(selector, timeout = 5000) {
  return new Promise((resolve) => {
    if (!selector) return resolve(null);
    const started = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - started > timeout) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export default function ProductTour() {
  const navigate = useNavigate();
  const driverRef = useRef(null);

  const goToStep = useCallback(
    async (step) => {
      if (step?.path && step.path !== window.location.pathname) {
        navigate(step.path);
      }
      await waitForEl(step?.element);
    },
    [navigate],
  );

  const start = useCallback(async () => {
    if (driverRef.current?.isActive?.()) return;
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: 'rgba(15,23,42,0.6)',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done',
      steps: STEPS.map((s) => ({ element: s.element, popover: s.popover })),
      onNextClick: async () => {
        const i = d.getActiveIndex();
        const next = STEPS[i + 1];
        if (!next) {
          d.destroy();
          return;
        }
        await goToStep(next);
        d.moveNext();
      },
      onPrevClick: async () => {
        const i = d.getActiveIndex();
        const prev = STEPS[i - 1];
        if (!prev) {
          d.movePrevious();
          return;
        }
        await goToStep(prev);
        d.movePrevious();
      },
    });
    driverRef.current = d;
    await goToStep(STEPS[0]);
    d.drive();
  }, [goToStep]);

  useEffect(() => {
    const handler = () => start();
    window.addEventListener('start-product-tour', handler);
    return () => {
      window.removeEventListener('start-product-tour', handler);
      driverRef.current?.destroy?.();
    };
  }, [start]);

  return null;
}

// Helper any component can import to kick off the tour.
export function startProductTour() {
  window.dispatchEvent(new Event('start-product-tour'));
}
