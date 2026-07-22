import type { ProviderData, NormalizedGroup, DateRange } from './types';

// System groups whose "spend" is transfer/income bookkeeping, not real expenses.
// The Internal Master Category holds "Inflow: Ready to Assign"/"Uncategorized";
// Credit Card Payments accumulates CC transfer activity already counted as
// categorized spend elsewhere. Their categories are dropped so the report never
// sees income or double-counted transfers — a structural exclusion (no seed list
// needed, unlike CSV).
const SKIP_GROUPS = new Set(['Internal Master Category', 'Credit Card Payments']);

// ── Minimal YNAB response shapes (only the fields we read) ────────────────────

interface YnabCategory {
  id: string;
  name: string;
  category_group_id: string;
  hidden: boolean;
  deleted: boolean;
}
interface YnabCategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: YnabCategory[];
}
export interface YnabCategoriesData {
  category_groups: YnabCategoryGroup[];
}
interface YnabSubTransaction {
  category_id: string | null;
  amount: number;
  transfer_account_id: string | null;
  deleted: boolean;
}
export interface YnabTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // milliunits; outflow negative
  category_id: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
  subtransactions?: YnabSubTransaction[];
}

// ── Pure mapping (no network / no DB — unit-testable) ─────────────────────────

// Maps a YNAB categories response + a transaction list into the normalized shape.
// Amounts are milliunits (÷1000) with outflows negative; per category we sum
// signed then abs, so refunds net within a category — matching Monarch/CSV.
export function mapYnabData(
  categories: YnabCategoriesData,
  transactions: YnabTransaction[],
  range: DateRange,
): ProviderData {
  const groups: NormalizedGroup[] = [];
  for (const g of categories.category_groups) {
    if (g.deleted || g.hidden || SKIP_GROUPS.has(g.name)) continue;
    const cats = g.categories
      .filter((c) => !c.deleted)
      .map((c) => ({ id: c.id, name: c.name, variability: null as null }));
    if (cats.length === 0) continue;
    groups.push({ id: g.id, name: g.name, type: 'expense', categories: cats });
  }

  const ytdMilli: Record<string, number> = {};
  const priorMilli: Record<string, number> = {};
  const add = (bucket: Record<string, number>, catId: string, amt: number) => {
    bucket[catId] = (bucket[catId] ?? 0) + amt;
  };

  for (const t of transactions) {
    if (t.deleted) continue;
    // Split transactions carry their real categories on the subtransactions; the
    // parent's category_id is null. Fall back to the transaction itself otherwise.
    const legs: YnabSubTransaction[] =
      t.subtransactions && t.subtransactions.length > 0
        ? t.subtransactions
        : [{ category_id: t.category_id, amount: t.amount, transfer_account_id: t.transfer_account_id, deleted: false }];
    for (const leg of legs) {
      if (leg.deleted) continue;
      if (leg.transfer_account_id) continue; // transfer leg — not spending
      if (!leg.category_id) continue;
      if (t.date >= range.ytdStart && t.date <= range.ytdEnd) add(ytdMilli, leg.category_id, leg.amount);
      else if (t.date >= range.priorStart && t.date <= range.priorEnd) add(priorMilli, leg.category_id, leg.amount);
    }
  }

  const toDollars = (m: Record<string, number>): Record<string, number> => {
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) r[k] = Math.abs(v / 1000);
    return r;
  };

  return { groups, ytdByCategory: toDollars(ytdMilli), priorByCategory: toDollars(priorMilli) };
}
