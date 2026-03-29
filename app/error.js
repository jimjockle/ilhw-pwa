'use client';

export default function Error({ error, reset }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-brand-dark text-white gap-6 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Something went wrong</h1>
        <p className="text-gray-300 text-lg mb-4">An unexpected error occurred</p>
        {error && (
          <p className="text-sm text-gray-400 mb-4 font-mono bg-white/5 px-4 py-2 rounded">
            {error.message || 'Unknown error'}
          </p>
        )}
      </div>

      <button
        onClick={() => reset()}
        className="bg-brand-blue text-white px-6 py-3 rounded-full font-semibold hover:bg-brand-blue/90 transition active:scale-95"
      >
        Try Again
      </button>
    </div>
  );
}
