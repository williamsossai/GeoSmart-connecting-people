import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const ConnectivityBanner: React.FC = () => {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" aria-live="polite" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-950">
      <div className="mx-auto flex max-w-7xl items-start gap-2.5 text-xs sm:items-center sm:text-sm">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        <p><span className="font-semibold">You’re offline.</span> A recent profile snapshot may be available, and profile edits can be saved as an encrypted draft on this device. Family, place, community and story changes still need an internet connection.</p>
      </div>
    </div>
  );
};
