import { monarchProvider } from './monarch';
import { csvProvider } from './csv';
import { ynabProvider } from './ynab';
import { getAppSetting } from '@/lib/db';
import type { DataProvider } from './types';

const PROVIDERS: Record<string, DataProvider> = {
  monarch: monarchProvider,
  csv: csvProvider,
  ynab: ynabProvider,
};

// Returns the active data source, read from app_settings (defaults to Monarch).
export function getActiveProvider(): DataProvider {
  const active = getAppSetting('active_provider') ?? 'monarch';
  return PROVIDERS[active] ?? monarchProvider;
}

export * from './types';
