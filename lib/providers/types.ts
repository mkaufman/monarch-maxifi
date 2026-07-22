// Provider-agnostic data shape consumed by the report.
//
// Every data source (Monarch, CSV, YNAB) maps its native response into
// ProviderData. The business logic in app/api/monarch/route.ts reads only this
// shape and never learns which provider produced it.

export interface NormalizedCategory {
  id: string;
  name: string;
  variability: 'fixed' | 'flexible' | 'non_monthly' | null;
}

export interface NormalizedGroup {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  categories: NormalizedCategory[];
}

export interface ProviderData {
  groups: NormalizedGroup[];
  ytdByCategory: Record<string, number>; // abs, positive
  priorByCategory: Record<string, number>;
}

export interface DateRange {
  ytdStart: string;
  ytdEnd: string;
  priorStart: string;
  priorEnd: string;
}

export interface DataProvider {
  readonly id: 'monarch' | 'csv' | 'ynab';
  readonly label: string;
  isConnected(): Promise<boolean>;
  fetch(range: DateRange): Promise<ProviderData>;
}
