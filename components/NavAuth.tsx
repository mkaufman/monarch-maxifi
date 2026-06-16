'use client';

import { useState } from 'react';

export default function NavAuth() {
  const [loading, setLoading] = useState(false);

  async function disconnect() {
    setLoading(true);
    await fetch('/api/auth/disconnect', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <button
      onClick={disconnect}
      disabled={loading}
      className="text-blue-200 hover:text-white transition-colors text-sm font-medium disabled:opacity-60"
    >
      {loading ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
