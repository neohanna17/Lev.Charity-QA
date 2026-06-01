import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import Modules from './pages/Modules';
import ModuleTests from './pages/ModuleTests';
import TestDetail from './pages/TestDetail';
import Runs from './pages/Runs';
import RunDetail from './pages/RunDetail';
import Suites from './pages/Suites';
import Components from './pages/Components';
import Reports from './pages/Reports';
import Guide from './pages/Guide';
import TechGuide from './pages/TechGuide';
import Feedback from './pages/Feedback';
import QAPlan from './pages/QAPlan';

// A minimal chrome for public, no-login pages (e.g. the shared QA Plan).
function PublicShell({ children }) {
  return (
    <div className="min-h-full bg-ink-800">
      <header className="border-b border-ink-600 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-6 py-3">
          <img src="/logo.png" alt="levcharity" className="h-6 w-auto" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">
            QA Dashboard
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, member, loading } = useAuth();
  const { pathname } = useLocation();

  // Public share link: a read-only QA Plan that needs no login or membership.
  // Handled before the auth gate so it renders for anyone with the URL.
  if (pathname.startsWith('/share/qa-plan')) {
    return (
      <PublicShell>
        <QAPlan readOnly />
      </PublicShell>
    );
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!user) return <Login />;
  if (!member) return <NoAccess />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Modules />} />
        <Route path="/modules/:name" element={<ModuleTests />} />
        <Route path="/tests/:id" element={<TestDetail />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:id" element={<RunDetail />} />
        <Route path="/suites" element={<Suites />} />
        <Route path="/components" element={<Components />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/tech" element={<TechGuide />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/qa-plan" element={<QAPlan />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
