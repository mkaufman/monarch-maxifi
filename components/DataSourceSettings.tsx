'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PROVIDER_CATALOG } from '@/lib/providers/catalog';

interface ProviderStatus {
  active: 'monarch' | 'csv';
  csvUploaded: boolean;
}

export default function DataSourceSettings() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/provider');
      setStatus((await res.json()) as ProviderStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/csv', { method: 'POST', body: form });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Upload failed');
      setMessage('CSV uploaded — now the active data source.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function switchTo(provider: 'monarch' | 'csv') {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Switch failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const active = status?.active ?? 'monarch';

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-navy">Data Source</h2>
      <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
        <p className="text-sm text-text-secondary">
          Choose where actuals come from. Monarch syncs live; CSV upload runs the same forecasts from a
          Monarch transaction export — useful when the live connection is unavailable. Category settings
          are kept separately per source.
        </p>

        <div className="flex flex-wrap gap-3">
          {PROVIDER_CATALOG.map((p) => {
            const isActive = active === p.id;
            const isSoon = p.kind === 'soon';
            const needsCsv = p.id === 'csv' && !status?.csvUploaded;
            const disabled = busy || isSoon || needsCsv;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => !isSoon && switchTo(p.id as 'monarch' | 'csv')}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  isActive
                    ? 'border-blue bg-blue/10 text-blue font-medium'
                    : 'border-border text-text-secondary hover:border-blue/50 disabled:opacity-50 disabled:hover:border-border'
                }`}
              >
                {isActive ? '● ' : ''}{p.label}{isSoon ? ' (soon)' : ''}
              </button>
            );
          })}
        </div>

        <div className="space-y-1 pt-1">
          <label className="text-sm text-text-secondary">
            {status?.csvUploaded ? 'Replace CSV export' : 'Upload Monarch CSV export'}
          </label>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
            className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-blue/10 file:px-4 file:py-2 file:text-sm file:text-blue hover:file:bg-blue/20"
          />
        </div>

        {message && <p className="text-xs text-success">✓ {message}</p>}
        {error && <p className="text-xs text-orange">{error}</p>}
      </div>
    </section>
  );
}
