import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  if (online) return null;
  return (
    <div role="alert" className="bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
      You're offline. CurioX needs a connection to answer.
    </div>
  );
}
