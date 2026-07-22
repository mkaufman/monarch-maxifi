import { getAppSetting } from '@/lib/db';
import type { DataProvider, ProviderData } from './types';
import { mapYnabData, type YnabCategoriesData, type YnabTransaction } from './ynab-map';

const YNAB_API = 'https://api.ynab.com/v1';

async function ynabGet<T>(path: string, pat: string): Promise<T> {
  const res = await fetch(`${YNAB_API}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) {
    const detail = res.status === 401 ? 'invalid or expired token' : `HTTP ${res.status}`;
    throw new Error(`YNAB request failed (${detail})`);
  }
  return (await res.json()) as T;
}

export const ynabProvider: DataProvider = {
  id: 'ynab',
  label: 'YNAB',

  async isConnected() {
    return !!getAppSetting('ynab_pat');
  },

  async fetch(range): Promise<ProviderData> {
    const pat = getAppSetting('ynab_pat');
    if (!pat) throw new Error('YNAB not connected');
    const budgetId = getAppSetting('ynab_budget_id') || 'last-used';

    const cats = await ynabGet<{ data: YnabCategoriesData }>(`/budgets/${budgetId}/categories`, pat);
    // One fetch since the prior-year start covers both windows; split by date in
    // the mapper. since_date is inclusive and has no upper bound (filtered below).
    const txns = await ynabGet<{ data: { transactions: YnabTransaction[] } }>(
      `/budgets/${budgetId}/transactions?since_date=${range.priorStart}`,
      pat,
    );
    return mapYnabData(cats.data, txns.data.transactions, range);
  },
};
