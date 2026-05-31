import { useEffect, useMemo, useState } from 'react';
import { buildBugReport, jiraConfig, saveJiraConfig, jiraCreateUrl } from '../lib/bugReport';

// Shows a tracker-ready bug report for a failed run. Copy the body, optionally
// open the Jira create screen (with summary prefilled) and paste.
export default function BugReportModal({ run, onClose }) {
  const [cfg, setCfg] = useState(jiraConfig());
  const [copied, setCopied] = useState(false);

  const { summary, description } = useMemo(() => buildBugReport(run), [run]);
  const full = `${summary}\n\n${description}`;

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  function updateCfg(patch) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveJiraConfig(next);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for blocked clipboard: select the textarea contents.
      const ta = document.getElementById('bug-body');
      if (ta) {
        ta.focus();
        ta.select();
      }
    }
  }

  const createUrl = jiraCreateUrl(summary);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
          <h2 className="font-semibold">Create bug report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Jira site (optional)</label>
              <input
                className="input"
                placeholder="yourteam.atlassian.net"
                value={cfg.site}
                onChange={(e) => updateCfg({ site: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Project key (optional)</label>
              <input
                className="input"
                placeholder="QA"
                value={cfg.project}
                onChange={(e) => updateCfg({ project: e.target.value.toUpperCase() })}
              />
            </div>
          </div>

          <div>
            <label className="label">Summary</label>
            <input className="input" readOnly value={summary} />
          </div>

          <div>
            <label className="label">Description (copy into the Jira ticket)</label>
            <textarea
              id="bug-body"
              className="input font-mono text-xs"
              rows={12}
              readOnly
              value={description}
            />
          </div>

          <p className="text-xs text-gray-500">
            Screenshot, recording and trace are linked by URL (valid for a year). Paste the
            description into the ticket — the links stay clickable.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-600 px-5 py-3">
          <button onClick={copy} className="btn-primary text-sm">
            {copied ? '✓ Copied' : 'Copy ticket'}
          </button>
          {createUrl ? (
            <a
              href={createUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost text-sm"
            >
              Open Jira create screen →
            </a>
          ) : (
            <span className="text-xs text-gray-400">Set a Jira site above to enable the open link</span>
          )}
        </div>
      </div>
    </div>
  );
}
