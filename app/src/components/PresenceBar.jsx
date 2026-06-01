// Friendly label for the page a teammate is currently on, so you can tell at a
// glance whether someone's in the same place as you.
function pageLabel(path = '') {
  if (path === '/') return 'Modules';
  if (path === '/runs') return 'Runs';
  if (path.startsWith('/runs/')) return 'Viewing a run';
  if (path.startsWith('/suites')) return 'Suites';
  if (path.startsWith('/tests/')) return 'Editing a test';
  if (path.startsWith('/modules/')) return 'Browsing a module';
  if (path.startsWith('/components')) return 'Components';
  if (path.startsWith('/reports')) return 'Reports';
  if (path.startsWith('/feedback')) return 'Feedback';
  if (path.startsWith('/guide')) return 'Guide';
  if (path.startsWith('/tech')) return 'Tech guide';
  return 'Dashboard';
}

function initials(p) {
  const s = (p.name || p.email || '?').trim();
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function Avatar({ person }) {
  return person.photoURL ? (
    <img src={person.photoURL} alt="" className="h-6 w-6 shrink-0 rounded-full" />
  ) : (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] font-semibold text-brand">
      {initials(person)}
    </span>
  );
}

// Shows who else is currently active on the dashboard. Lives at the bottom of
// the sidebar, just above the signed-in user row.
export default function PresenceBar({ people = [] }) {
  if (people.length === 0) {
    return (
      <div className="mb-2 flex items-center gap-2 px-1 text-xs text-gray-400">
        <span className="h-2 w-2 rounded-full bg-gray-300" />
        Only you online
      </div>
    );
  }

  return (
    <div className="mb-2 px-1">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        {people.length} other{people.length === 1 ? '' : 's'} online
      </div>
      <ul className="space-y-1.5">
        {people.map((p) => (
          <li
            key={p.uid}
            className="flex items-center gap-2"
            title={`${p.name || p.email} · ${pageLabel(p.path)}`}
          >
            <Avatar person={p} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-xs text-gray-700">{p.name || p.email}</span>
              <span className="truncate text-[10px] text-gray-400">{pageLabel(p.path)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
