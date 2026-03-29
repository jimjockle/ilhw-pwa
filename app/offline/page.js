'use client';

import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-brand-dark text-white gap-6 px-4">
      <div className="text-brand-gold mb-4">
        <WifiOff className="w-16 h-16" />
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">You're Offline</h1>
        <p className="text-gray-300 text-lg">Check your connection and try again</p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="mt-6 bg-brand-blue text-white px-6 py-3 rounded-full font-semibold hover:bg-brand-blue/90 transition active:scale-95"
      >
        Try Again
      </button>

      <p className="text-xs text-gray-500 mt-8 text-center max-w-xs">
        Some features may be limited while offline. Previously loaded messages will still be available.
      </p>
    </div>
  );
}
