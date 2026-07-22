import fs from 'fs';
import path from 'path';
import type { DataProvider, ProviderData, NormalizedGroup } from './types';

// Uploaded Monarch CSV export lives here (data/ is gitignored). Raw text is
// stored and aggregated on each fetch, so one export serves both the current
// year and the prior-year comparison without a second upload.
export const CSV_UPLOAD_PATH = path.join(process.cwd(), 'data', 'uploads', 'transactions.csv');

// Minimal RFC-4180 parser: handles quoted fields containing commas, embedded
// newlines, and escaped ("") quotes — all of which Monarch exports produce.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

interface CsvRow { date: string; category: string; amount: number; }

function readRows(): CsvRow[] {
  const table = parseCsv(fs.readFileSync(CSV_UPLOAD_PATH, 'utf-8'));
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  const di = header.indexOf('date');
  const ci = header.indexOf('category');
  const ai = header.indexOf('amount');
  if (di < 0 || ci < 0 || ai < 0) {
    throw new Error('CSV missing a required Date, Category, or Amount column');
  }
  const rows: CsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.length <= Math.max(di, ci, ai)) continue; // blank/short line
    const date = cells[di]?.trim();
    const category = cells[ci]?.trim();
    if (!date || !category) continue;
    const amount = parseFloat(cells[ai]?.trim().replace(/[$,]/g, ''));
    if (Number.isNaN(amount)) continue;
    rows.push({ date, category, amount });
  }
  return rows;
}

// Sum signed amounts per category within [start, end] (ISO dates sort as
// strings), then abs — so refunds net against spend within a category, exactly
// as Monarch's expense totals behave.
function aggregate(rows: CsvRow[], start: string, end: string): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const row of rows) {
    if (row.date < start || row.date > end) continue;
    sums[row.category] = (sums[row.category] ?? 0) + row.amount;
  }
  const result: Record<string, number> = {};
  for (const [cat, sum] of Object.entries(sums)) result[cat] = Math.abs(sum);
  return result;
}

export const csvProvider: DataProvider = {
  id: 'csv',
  label: 'CSV Upload',

  async isConnected() {
    return fs.existsSync(CSV_UPLOAD_PATH);
  },

  async fetch(range): Promise<ProviderData> {
    if (!fs.existsSync(CSV_UPLOAD_PATH)) {
      throw new Error('No CSV uploaded');
    }
    const rows = readRows();
    const ytdByCategory = aggregate(rows, range.ytdStart, range.ytdEnd);
    const priorByCategory = aggregate(rows, range.priorStart, range.priorEnd);

    // CSV has no group hierarchy, so every category goes in one synthetic
    // expense group. Income/transfer categories ride along here but are dropped
    // downstream by category_config bucket='excluded' (seeded from
    // DEFAULT_CATEGORY_CONFIG); unrecognized ones surface as "unassigned".
    // id = name, scoped to the 'csv' provider namespace.
    const names = new Set([...Object.keys(ytdByCategory), ...Object.keys(priorByCategory)]);
    const group: NormalizedGroup = {
      id: 'imported',
      name: 'Imported',
      type: 'expense',
      categories: [...names].sort().map((name) => ({ id: name, name, variability: null })),
    };

    return { groups: [group], ytdByCategory, priorByCategory };
  },
};
