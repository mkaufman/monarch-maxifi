'use client';

import { useRef, useState } from 'react';
import { PROVIDER_CATALOG, type ProviderDescriptor } from '@/lib/providers/catalog';

// Front-door screen shown when the active provider isn't ready. Presents every
// data source as a peer card (Monarch connect, CSV upload, YNAB stub). Adding a
// provider is a catalog entry — no layout change here.
export default function ConnectPrompt({ error }: { error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadCsv(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/csv', { method: 'POST', body: form });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Upload failed');
      // Upload activates CSV as the provider; reload so the report re-evaluates.
      window.location.reload();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-navy">Choose your data source</h2>
        <p className="text-text-secondary max-w-md">
          Connect a live account or upload a transaction export to view your spending report.
        </p>
      </div>

      {error && (
        <div className="bg-orange/10 border border-orange/30 text-orange rounded-lg px-4 py-3 text-sm max-w-md text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
        {PROVIDER_CATALOG.map((p) => (
          <ProviderCard key={p.id} provider={p} busy={busy} onUpload={() => fileInput.current?.click()} />
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadCsv(f);
        }}
      />

      {uploadError && <p className="text-sm text-orange">{uploadError}</p>}
    </div>
  );
}

function ProviderCard({
  provider,
  busy,
  onUpload,
}: {
  provider: ProviderDescriptor;
  busy: boolean;
  onUpload: () => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-border bg-surface p-5 text-center space-y-3 ${
        provider.kind === 'soon' ? 'opacity-60' : ''
      }`}
    >
      <div className="flex-1 space-y-1">
        <h3 className="font-semibold text-navy">{provider.label}</h3>
        <p className="text-xs text-text-secondary">{provider.tagline}</p>
      </div>

      {provider.kind === 'connect' && (
        <a
          href={provider.authUrl}
          className="bg-orange text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-orange/90 transition-colors"
        >
          Connect
        </a>
      )}
      {provider.kind === 'upload' && (
        <button
          type="button"
          disabled={busy}
          onClick={onUpload}
          className="bg-orange text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-orange/90 transition-colors disabled:opacity-60"
        >
          {busy ? 'Uploading…' : 'Choose file…'}
        </button>
      )}
      {provider.kind === 'soon' && (
        <span className="text-xs font-medium text-text-secondary border border-border rounded-lg px-4 py-2">
          Coming soon
        </span>
      )}
    </div>
  );
}
