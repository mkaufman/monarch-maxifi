'use client';

import { useState } from 'react';

// Personal Access Token entry for YNAB. Used by both the front-door chooser and
// the Settings data-source panel. On success, calls onConnected (Settings
// refresh) or reloads (front door → report re-evaluates readiness).
export default function YnabConnectForm({ onConnected }: { onConnected?: () => void }) {
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ynab/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: pat.trim() }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Connection failed');
      if (onConnected) onConnected();
      else window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="password"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        placeholder="Personal Access Token"
        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
      />
      <button
        type="button"
        disabled={busy || !pat.trim()}
        onClick={connect}
        className="w-full bg-orange text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-orange/90 transition-colors disabled:opacity-60"
      >
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      {error && <p className="text-xs text-orange">{error}</p>}
    </div>
  );
}
