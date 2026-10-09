import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Logo } from './components/Logo';
import OfflineBanner from './components/OfflineBanner';
import { SessionProvider, onboardingDone, useSession } from './hooks/useSession';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Welcome from './pages/Welcome';

export default function App() {
  return (
    <SessionProvider>
      <OfflineBanner />
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </SessionProvider>
  );
}

function Gate() {
  const { phase, session, error, retry } = useSession();

  if (phase === 'waking' || phase === 'slow') {
    return (
      <Splash>
        <p className="mt-6 text-lg font-semibold">{phase === 'slow' ? 'Waking up CurioX…' : 'Loading…'}</p>
        {phase === 'slow' && (
          <p className="mt-2 max-w-xs text-sm text-slate-500 dark:text-slate-400">The server was asleep to save energy. This can take up to a minute the first time.</p>
        )}
      </Splash>
    );
  }

  if (phase === 'error' || !session) {
    return (
      <Splash>
        <p className="mt-6 text-lg font-semibold">CurioX can't connect right now</p>
        <p className="mt-2 max-w-xs text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button onClick={retry} className="mt-5 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">
          Try again
        </button>
      </Splash>
    );
  }

  const done = onboardingDone(session);
  return (
    <Routes>
      <Route path="/" element={done ? <Chat /> : <Welcome />} />
      <Route path="/profile" element={done ? <Profile /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size={72} className="animate-pulse" />
      {children}
    </main>
  );
}
