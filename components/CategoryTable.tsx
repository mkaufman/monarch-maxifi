'use client';

import { useState } from 'react';
import type { ForecastFlag } from '@/lib/forecast';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export interface CategoryRow {
  categoryId: string;
  categoryName: string;
  groupName: string;
  bucket: string | null;
  forecastModel: string;
  forecastModelLabel: string;
  ytdTotal: number;
  annualForecast: number;
  priorYearTotal: number;
  flags: ForecastFlag[];
}

type SortBy = 'group' | 'ytd';

interface Props {
  label: string;
  categories: CategoryRow[];
  defaultOpen?: boolean;
}

export default function CategoryTable({ label, categories, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [sortBy, setSortBy] = useState<SortBy>('group');

  const sorted = sortBy === 'ytd'
    ? [...categories].sort((a, b) => b.ytdTotal - a.ytdTotal)
    : categories; // API order already groups by Monarch group

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-bg transition-colors"
      >
        <span className="font-semibold text-navy">{label} Categories</span>
        <span className="text-text-secondary text-sm">{open ? '▼' : '▶'} {categories.length} categories</span>
      </button>

      {open && (
        <div className="border-t border-border flex justify-end px-6 py-2 gap-1">
          <div className="flex items-center gap-1 text-xs border border-border rounded-lg overflow-hidden">
            <SortButton active={sortBy === 'group'} onClick={() => setSortBy('group')}>Group</SortButton>
            <SortButton active={sortBy === 'ytd'} onClick={() => setSortBy('ytd')}>YTD ↓</SortButton>
          </div>
        </div>
      )}

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg">
                <th className="text-left px-6 py-3 text-text-secondary font-medium">Category</th>
                <th className="text-right px-4 py-3 text-text-secondary font-medium">YTD Actual</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Forecast Model</th>
                <th className="text-right px-4 py-3 text-text-secondary font-medium">Forecasted Annual</th>
                <th className="text-right px-4 py-3 text-text-secondary font-medium">Avg Monthly</th>
                <th className="text-right px-4 py-3 text-text-secondary font-medium">Prior Year</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cat) => (
                <tr key={cat.categoryId} className="border-t border-border hover:bg-bg/50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-medium">{cat.categoryName}</span>
                      {cat.flags.filter((f) => f.type !== 'prior_year_fallback').length > 0 && (
                        <span
                          className="text-warning cursor-help"
                          title={cat.flags.filter((f) => f.type !== 'prior_year_fallback').map((f) => f.label).join('\n')}
                        >
                          ⚠
                        </span>
                      )}
                      {cat.flags.filter((f) => f.type === 'prior_year_fallback').length > 0 && (
                        <span
                          className="text-text-secondary cursor-help text-xs"
                          title={cat.flags.filter((f) => f.type === 'prior_year_fallback').map((f) => f.label).join('\n')}
                        >
                          ℹ
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">{cat.groupName}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                    {cat.ytdTotal > 0 ? fmt(cat.ytdTotal) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-bg text-text-secondary rounded px-2 py-0.5 border border-border">
                      {cat.forecastModelLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-text-primary">
                    {fmt(cat.annualForecast)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                    {fmt(cat.annualForecast / 12)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {cat.priorYearTotal > 0 ? fmt(cat.priorYearTotal) : '—'}
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-text-secondary">
                    No categories
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 transition-colors ${
        active
          ? 'bg-navy text-white font-medium'
          : 'text-text-secondary hover:bg-bg'
      }`}
    >
      {children}
    </button>
  );
}
