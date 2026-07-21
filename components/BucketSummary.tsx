'use client';

import { useState, useEffect } from 'react';

const LS_KEY = 'monarch-maxifi:fixed-breakdown-expanded';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

interface SubcategoryBreakdownItem {
  key: string;
  label: string;
  forecast: number;
  budget: number | null;
}

interface Props {
  label: string;
  ytdTotal: number;
  annualForecast: number;
  budget: number | null;
  subcategoryBreakdown?: SubcategoryBreakdownItem[];
}

export default function BucketSummary({ label, ytdTotal, annualForecast, budget, subcategoryBreakdown }: Props) {
  const variance = budget !== null ? annualForecast - budget : null;
  const overBudget = variance !== null && variance > 0;
  const variancePct = budget !== null && budget > 0 ? Math.round(Math.abs(variance!) / budget * 100) : null;

  // Default expanded; persist collapse preference in localStorage.
  // Initialise to true to match server render, then sync from storage after mount.
  const [expanded, setExpanded] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) setExpanded(stored !== 'false');
    setHydrated(true);
  }, []);

  function toggle() {
    setExpanded((prev) => {
      localStorage.setItem(LS_KEY, String(!prev));
      return !prev;
    });
  }

  const hasBreakdown = subcategoryBreakdown && subcategoryBreakdown.length > 0;

  return (
    <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
      <h2 className="text-lg font-semibold text-navy">{label}</h2>
      <div className="space-y-3">
        <Row label="YTD Actual" value={fmt(ytdTotal)} />
        <Row label="Forecasted Annual" value={fmt(annualForecast)} bold />
        <Row label="MaxiFi Budget" value={budget !== null ? fmt(budget) : '—'} />
        {variance !== null && (
          <div className="pt-2 border-t border-border flex justify-between items-center">
            <span className="text-sm text-text-secondary">Variance</span>
            <span className={`text-sm font-semibold tabular-nums ${overBudget ? 'text-orange' : 'text-success'}`}>
              {overBudget ? '+' : ''}{fmt(variance)}
              {variancePct !== null && (
                <span className="ml-2 font-normal opacity-75">
                  ({variancePct}% {overBudget ? 'over' : 'below'} budget)
                </span>
              )}
            </span>
          </div>
        )}
        {budget === null && (
          <p className="pt-2 border-t border-border text-xs text-warning">
            ⚠ MaxiFi budget not set — go to Settings
          </p>
        )}
      </div>

      {hasBreakdown && (
        <div className="border-t border-border pt-3">
          <button
            onClick={toggle}
            className="flex items-center justify-between w-full text-left group"
          >
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Subcategory Breakdown
            </span>
            <span className="text-xs text-text-secondary group-hover:text-navy transition-colors">
              {/* Avoid flash of wrong chevron before localStorage is read */}
              {hydrated ? (expanded ? '▼' : '▶') : '▼'}
            </span>
          </button>

          {expanded && (
            <div className="mt-2 space-y-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 pb-1">
                <span className="text-xs text-text-secondary"></span>
                <span className="text-xs text-text-secondary text-right">Forecast</span>
                <span className="text-xs text-text-secondary text-right">Budget</span>
                <span className="text-xs text-text-secondary text-right">±</span>
              </div>
              {subcategoryBreakdown!.map((item) => {
                const v = item.budget !== null ? item.forecast - item.budget : null;
                const over = v !== null && v > 0;
                return (
                  <div key={item.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-baseline">
                    <span className="text-sm text-text-secondary truncate">{item.label}</span>
                    <span className="text-sm tabular-nums text-text-primary text-right">{fmt(item.forecast)}</span>
                    <span className="text-sm tabular-nums text-text-secondary text-right">
                      {item.budget !== null ? fmt(item.budget) : '—'}
                    </span>
                    <span className={`text-sm tabular-nums text-right ${
                      v === null ? 'text-text-secondary' : over ? 'text-orange' : 'text-success'
                    }`}>
                      {v !== null ? (over ? '+' : '') + fmt(v) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-semibold text-text-primary' : 'text-text-primary'}`}>
        {value}
      </span>
    </div>
  );
}
