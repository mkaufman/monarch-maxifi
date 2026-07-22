// Client-safe provider metadata — the single source of truth for which data
// sources exist and how each is activated. No server imports (unlike
// providers/index.ts, which pulls in the DB), so both the front-door chooser
// and the Settings toggle can render from it. Adding YNAB later = one entry.
export type ProviderId = 'monarch' | 'csv' | 'ynab';

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  tagline: string;
  // connect = redirect to an auth flow (authUrl); upload = file upload;
  // token = paste a personal access token; soon = not yet available (disabled).
  kind: 'connect' | 'upload' | 'token' | 'soon';
  authUrl?: string;
}

export const PROVIDER_CATALOG: ProviderDescriptor[] = [
  { id: 'monarch', label: 'Monarch', tagline: 'Live sync with Monarch Money', kind: 'connect', authUrl: '/api/auth/authorize' },
  { id: 'csv', label: 'CSV Upload', tagline: 'From a Monarch transaction export', kind: 'upload' },
  { id: 'ynab', label: 'YNAB', tagline: 'Live sync with a Personal Access Token', kind: 'token' },
];
