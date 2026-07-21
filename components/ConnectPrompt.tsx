'use client';

export default function ConnectPrompt({ error }: { error?: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-navy">Connect to Monarch</h2>
        <p className="text-text-secondary max-w-sm">
          Sign in with your Monarch Money account to view your spending report.
        </p>
      </div>
      {error && (
        <div className="bg-orange/10 border border-orange/30 text-orange rounded-lg px-4 py-3 text-sm max-w-md text-center">
          {error}
        </div>
      )}
      <a
        href="/api/auth/authorize"
        className="bg-orange text-white font-semibold px-6 py-3 rounded-lg hover:bg-orange/90 transition-colors"
      >
        Connect with Monarch
      </a>
    </div>
  );
}
