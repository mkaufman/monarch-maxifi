import { fetchMonarchData } from '@/lib/monarch';
import { getOAuthTokens } from '@/lib/db';
import type { DataProvider, ProviderData } from './types';

// Monarch Money provider. Wraps the existing MCP fetch and maps its response
// into the normalized ProviderData shape. The YTD/prior lookup-building that
// used to live inline in app/api/monarch/route.ts moves here unchanged.
export const monarchProvider: DataProvider = {
  id: 'monarch',
  label: 'Monarch Money',

  // Mirrors app/api/auth/status: a stored token means connected.
  async isConnected() {
    return getOAuthTokens() !== undefined;
  },

  async fetch(range): Promise<ProviderData> {
    const { categories, ytd, prior } = await fetchMonarchData(
      range.ytdStart,
      range.ytdEnd,
      range.priorStart,
      range.priorEnd,
    );

    const ytdByCategory: Record<string, number> = {};
    for (const row of ytd.data) ytdByCategory[row.entity_id] = Math.abs(row.amount);

    const priorByCategory: Record<string, number> = {};
    for (const row of prior.data) priorByCategory[row.entity_id] = Math.abs(row.amount);

    const groups = categories.category_groups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      categories: g.categories.map((c) => ({
        id: c.id,
        name: c.name,
        variability: c.budget_variability,
      })),
    }));

    return { groups, ytdByCategory, priorByCategory };
  },
};
