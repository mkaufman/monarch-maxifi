import type { ForecastModel } from './categories';

export const PRIOR_YEAR_FALLBACK_DAYS = 60;

export interface ForecastInput {
  ytdTotal: number; // positive dollars
  daysElapsed: number;
  model: ForecastModel;
  overrideAmount?: number | null; // known_monthly or known_annual
  excludeAmount?: number | null; // adjusted_run_rate: amount to subtract before extrapolating
  addAmount?: number | null; // adjusted_run_rate: known future amount to add
  priorYearActual?: number | null; // run_rate fallback when early in year with no spend
}

export interface ForecastResult {
  annualForecast: number;
  model: ForecastModel;
  priorYearFallback?: boolean;
}

export function computeForecast(input: ForecastInput): ForecastResult {
  const { ytdTotal, daysElapsed, model, overrideAmount, excludeAmount, addAmount, priorYearActual } = input;

  switch (model) {
    case 'run_rate': {
      if (daysElapsed <= 0) return { annualForecast: 0, model };
      if (daysElapsed < PRIOR_YEAR_FALLBACK_DAYS && ytdTotal === 0 && (priorYearActual ?? 0) > 0) {
        return { annualForecast: priorYearActual!, model, priorYearFallback: true };
      }
      return { annualForecast: (ytdTotal / daysElapsed) * 365, model };
    }

    case 'known_monthly': {
      const monthly = overrideAmount ?? ytdTotal / Math.max(1, daysElapsed / 30.44);
      return { annualForecast: monthly * 12, model };
    }

    case 'known_annual': {
      return { annualForecast: overrideAmount ?? ytdTotal, model };
    }

    case 'adjusted_run_rate': {
      if (daysElapsed <= 0) return { annualForecast: 0, model };
      if (daysElapsed < PRIOR_YEAR_FALLBACK_DAYS && ytdTotal === 0 && (addAmount ?? 0) === 0 && (priorYearActual ?? 0) > 0) {
        return { annualForecast: priorYearActual!, model, priorYearFallback: true };
      }
      const adjusted = ytdTotal - (excludeAmount ?? 0) + (addAmount ?? 0);
      return { annualForecast: (adjusted / daysElapsed) * 365, model };
    }

    case 'no_further_spend': {
      return { annualForecast: ytdTotal, model };
    }

    default:
      return { annualForecast: (ytdTotal / Math.max(1, daysElapsed)) * 365, model };
  }
}

export const MODEL_LABELS: Record<ForecastModel, string> = {
  run_rate: 'Run Rate',
  known_monthly: 'Monthly',
  known_annual: 'Annual',
  adjusted_run_rate: 'Adjusted Run Rate',
  no_further_spend: 'No Further Spend',
};

// Flags for user review
export interface ForecastFlag {
  type: 'large_transaction' | 'high_mom_change' | 'zero_spend' | 'no_bucket' | 'no_budget' | 'prior_year_fallback';
  label: string;
}

export function computeFlags(opts: {
  ytdTotal: number;
  largestTransaction?: number;
  prevMonthTotal?: number;
  currMonthTotal?: number;
  hasBucket: boolean;
  hasBudget: boolean;
  priorYearFallback?: boolean;
}): ForecastFlag[] {
  const flags: ForecastFlag[] = [];

  if (opts.priorYearFallback) {
    flags.push({ type: 'prior_year_fallback', label: 'Using prior-year actual — no spend yet this year' });
  } else if (opts.ytdTotal === 0) {
    flags.push({ type: 'zero_spend', label: 'No YTD spend — forecast may be incomplete' });
  }

  if (!opts.hasBucket) {
    flags.push({ type: 'no_bucket', label: 'Category not assigned to a bucket — go to Settings' });
  }

  if (!opts.hasBudget) {
    flags.push({ type: 'no_budget', label: 'MaxiFi budget not set for this year' });
  }

  if (opts.ytdTotal > 0 && opts.largestTransaction && opts.largestTransaction > opts.ytdTotal * 0.5) {
    flags.push({
      type: 'large_transaction',
      label: 'Single transaction dominates YTD total — consider Adjusted Run Rate',
    });
  }

  if (
    opts.prevMonthTotal !== undefined &&
    opts.currMonthTotal !== undefined &&
    opts.prevMonthTotal > 0
  ) {
    const change = Math.abs(opts.currMonthTotal - opts.prevMonthTotal) / opts.prevMonthTotal;
    if (change > 0.2) {
      flags.push({ type: 'high_mom_change', label: 'Month-over-month change exceeds 20%' });
    }
  }

  return flags;
}
