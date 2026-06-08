import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../lib/usePresence';
import PresenceBar from './PresenceBar';
import ProductTour from './ProductTour';

const navItems = [
  { to: '/', label: 'Modules', end: true, tour: 'nav-modules' },
  { to: '/runs', label: 'Runs', tour: 'nav-runs' },
  { to: '/suites', label: 'Suites', tour: 'nav-suites' },
  { to: '/automations', label: 'Automations', tour: 'nav-automations' },
  { to: '/components', label: 'Components', tour: 'nav-components' },
  { to: '/reports', label: 'Reports', tour: 'nav-reports' },
  { to: '/guide', label: 'Guide', tour: 'nav-guide' },
  { to: '/tech', label: 'Tech guide', tour: 'nav-tech' },
  { to: '/feedback', label: 'Feature feedback', tour: 'nav-feedback' },
  { to: '/qa-plan', label: 'QA Plan', tour: 'nav-qa-plan', temporary: true },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoOk, setLogoOk] = useState(true);
  const others = usePresence(user);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-ink-600 bg-white">
        <button
          onClick={() => navigate('/')}
          data-tour="nav-home"
          className="flex flex-col items-start gap-1 px-4 py-4 border-b border-ink-600"
        >
          {logoOk ? (
            <img
              src="/logo.png"
              alt="levcharity"
              className="h-7 w-auto max-w-full"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <span className="text-xl font-bold tracking-tight text-gray-900">levcharity</span>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">
            QA Dashboard
          </span>
        </button>

        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-tour={n.tour}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-gray-500 hover:bg-ink-700 hover:text-gray-800'
                }`
              }
            >
              <span>{n.label}</span>
              {n.temporary && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  temp
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-ink-600 p-3">
          {user && <PresenceBar people={others} />}
          {user && (
            <div className="flex items-center gap-2">
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full" />
              )}
              <span className="flex-1 truncate text-xs text-gray-500">
                {user.displayName || user.email}
              </span>
              <button onClick={logout} data-tour="nav-signout" className="btn-ghost py-1 px-2 text-xs">
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
      </main>

      <ProductTour />
    </div>
  );
}
