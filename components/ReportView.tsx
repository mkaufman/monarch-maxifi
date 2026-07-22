'use client';

import { useState, useCallback, useEffect } from 'react';
import BucketSummary from './BucketSummary';
import CategoryTable, { type CategoryRow } from './CategoryTable';
import SpecialExpensesPanel from './SpecialExpensesPanel';
import ConnectPrompt from './ConnectPrompt';

interface BucketData {
  ytdTotal: number;
  annualForecast: number;
  budget: number | null;
  categories: CategoryRow[];
}

interface SubcategoryBreakdownItem {
  key: string;
  label: string;
  forecast: number;
  budget: number | null;
}

interface ReportData {
  year: number;
  startDate: string;
  endDate: string;
  daysElapsed: number;
  fixedSubcategoryBreakdown: SubcategoryBreakdownItem[];
  buckets: {
    fixed: BucketData;
    discretionary: BucketData;
  };
  unassigned: Array<{ categoryId: string; categoryName: string; groupName: string }>;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ReportView() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ReportData | null>(null);
  const [specialExpenses, setSpecialExpenses] = useState<Array<{ id: number; year: number; name: string; amount: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) {
      setAuthError(err);
      // Remove from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const fetchReport = useCallback(async (yr: number) => {
    setLoading(true);
    setError(null);
    try {
      const [monarchRes, budgetsRes] = await Promise.all([
        fetch(`/api/monarch?year=${yr}`),
        fetch(`/api/budgets?year=${yr}`),
      ]);
      if (monarchRes.status === 401) {
        setReady(false);
        return;
      }
      const monarchJson = await monarchRes.json();
      if (!monarchRes.ok) throw new Error(monarchJson.error ?? 'Failed to fetch');
      const budgetsJson = await budgetsRes.json();
      setData(monarchJson as ReportData);
      setSpecialExpenses(budgetsJson.specialExpenses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Gate on the *active* provider's readiness, not Monarch auth specifically:
    // a CSV user with an uploaded file needs no Monarch token.
    async function init() {
      const prov = await (await fetch('/api/provider')).json() as {
        active: 'monarch' | 'csv' | 'ynab';
        csvUploaded: boolean;
        ynabConnected: boolean;
      };
      let isReady: boolean;
      if (prov.active === 'csv') {
        isReady = prov.csvUploaded;
      } else if (prov.active === 'ynab') {
        isReady = prov.ynabConnected;
      } else {
        // Monarch: still requires a live connection.
        isReady = ((await (await fetch('/api/auth/status')).json()) as { connected: boolean }).connected;
      }
      setReady(isReady);
      if (isReady) fetchReport(year);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleYearChange = (yr: number) => {
    setYear(yr);
    fetchReport(yr);
  };

  if (ready === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-text-secondary text-sm">Loading…</div>
      </div>
    );
  }

  if (ready === false) {
    return <ConnectPrompt error={authError} />;
  }

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Annual Spending Report</h1>
          {data && (
            <p className="text-sm text-text-secondary mt-1">
              {fmtDate(data.startDate)} – {fmtDate(data.endDate)} · {data.daysElapsed} days elapsed
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleYearChange(year - 1)}
              className="px-2 py-1 text-text-secondary hover:text-navy rounded border border-border hover:bg-bg transition-colors"
            >
              ‹
            </button>
            <span className="font-semibold text-navy w-12 text-center">{year}</span>
            <button
              onClick={() => handleYearChange(year + 1)}
              disabled={year >= currentYear}
              className="px-2 py-1 text-text-secondary hover:text-navy rounded border border-border hover:bg-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
          <button
            onClick={() => fetchReport(year)}
            disabled={loading}
            className="bg-orange text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-orange/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-orange/10 border border-orange/30 text-orange rounded-lg px-4 py-3 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-6 space-y-3 animate-pulse">
              <div className="h-5 bg-bg rounded w-24" />
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-4 bg-bg rounded w-28" />
                  <div className="h-4 bg-bg rounded w-20" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Report content */}
      {data && !loading && (
        <>
          {/* Unassigned categories alert */}
          {data.unassigned.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 text-sm">
              <strong className="text-text-primary">⚠ {data.unassigned.length} categories need bucket assignment</strong>
              <p className="text-text-secondary mt-1">
                {data.unassigned.map((u) => u.categoryName).join(', ')} — go to Settings to assign.
              </p>
            </div>
          )}

          {/* Bucket summaries */}
          <div className="grid grid-cols-2 gap-6">
            <BucketSummary
              label="Fixed Spending"
              ytdTotal={data.buckets.fixed.ytdTotal}
              annualForecast={data.buckets.fixed.annualForecast}
              budget={data.buckets.fixed.budget}
              subcategoryBreakdown={data.fixedSubcategoryBreakdown}
            />
            <BucketSummary
              label="Discretionary Spending"
              ytdTotal={data.buckets.discretionary.ytdTotal}
              annualForecast={data.buckets.discretionary.annualForecast}
              budget={data.buckets.discretionary.budget}
            />
          </div>

          {/* Category breakdowns */}
          <div className="space-y-4">
            <CategoryTable label="Fixed Spending" categories={data.buckets.fixed.categories} />
            <CategoryTable label="Discretionary Spending" categories={data.buckets.discretionary.categories} />
          </div>

          {/* Special Expenses */}
          <SpecialExpensesPanel expenses={specialExpenses.filter((e) => e.year === year)} />
        </>
      )}
    </div>
  );
}
