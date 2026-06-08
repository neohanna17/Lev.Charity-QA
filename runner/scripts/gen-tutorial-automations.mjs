// One-off transform: tutorials.json (admin tutorial export) → the app's
// tutorialAutomations.js data module. Re-run if the tutorial export changes:
//   node runner/scripts/gen-tutorial-automations.mjs <path-to-tutorials.json>
import fs from 'node:fs';

const src = process.argv[2] || '/Users/Asus/Downloads/tutorials.json';
const tut = JSON.parse(fs.readFileSync(src, 'utf8'));

const cats = tut
  .map((t) => {
    const seen = new Set();
    const links = [];
    for (const q of t.quickLinks || []) {
      const href = (q.href || '').trim();
      if (!href || !(href.startsWith('/admin') || href.startsWith('/profile'))) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      links.push({ label: q.label, href });
    }
    return { slug: t.slug, title: t.title, order: t.order, links };
  })
  .filter((c) => c.links.length > 0)
  .sort((a, b) => a.order - b.order);

const header = `// AUTO-GENERATED from the lev.charity admin tutorial export (tutorials.json).
// Each entry is one tutorial category and the admin pages it links to. The
// Automations page turns these into daily login-and-smoke checks: log in,
// visit each page, assert it loaded. Read-only navigation only — safe to run
// unattended every morning. Regenerate with:
//   node runner/scripts/gen-tutorial-automations.mjs <tutorials.json>
// Do not hand-edit; trim links from the Automations UI instead.

export const ADMIN_BASE = 'https://lev.charity';

// The tutorial hub itself — monitored daily so we catch newly published
// tutorials / sections (pair it with a visual baseline to flag changes).
export const TUTORIAL_HUB = { href: '/admin/tutorial', label: 'Tutorial hub' };

`;

const body = `export const TUTORIAL_AUTOMATIONS = ${JSON.stringify(cats, null, 2)};\n`;

fs.writeFileSync('app/src/lib/tutorialAutomations.js', header + body);
console.log(`categories: ${cats.length}, links: ${cats.reduce((n, c) => n + c.links.length, 0)}`);
console.log('wrote app/src/lib/tutorialAutomations.js');
