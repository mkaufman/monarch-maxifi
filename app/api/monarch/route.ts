import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/providers';
import { getAllCategoryConfigs, upsertCategoryConfig, deleteCategoryConfig, getMaxiFiBudgets, getMaxiFiSubcategories, getSpecialExpenses, getHouseholdMembers } from '@/lib/db';
import { DEFAULT_CATEGORY_CONFIG, defaultModelFromVariability } from '@/lib/categories';
import { computeForecast, computeFlags, MODEL_LABELS } from '@/lib/forecast';
import { tryDemoFixture } from '@/lib/demo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);
  if (isNaN(year)) return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });

  const demo = tryDemoFixture('monarch', year);
  if (demo) return demo;

  const today = new Date();
  const startOfYear = `${year}-01-01`;
  const endDate =
    year === today.getFullYear()
      ? today.toISOString().split('T')[0]
      : `${year}-12-31`;

  const priorYear = year - 1;
  const priorStart = `${priorYear}-01-01`;
  const priorEnd = `${priorYear}-12-31`;

  const daysElapsed =
    year === today.getFullYear()
      ? Math.floor((today.getTime() - new Date(`${year}-01-01`).getTime()) / 86400000) + 1
      : 365;

  try {
    const provider = getActiveProvider();
    const { groups, ytdByCategory, priorByCategory } = await provider.fetch({
      ytdStart: startOfYear,
      ytdEnd: endDate,
      priorStart,
      priorEnd,
    });

    // Sync DB category config with the active provider's categories
    const existingConfigs = getAllCategoryConfigs(provider.id);
    const existingIds = new Set(existingConfigs.map((c) => c.category_id));
    const now = new Date().toISOString();

    const monarchExpenseIds = new Set<string>();
    for (const group of groups) {
      if (group.type !== 'expense') continue;
      for (const cat of group.categories) {
        monarchExpenseIds.add(cat.id);
        if (existingIds.has(cat.id)) continue;
        const defaults = DEFAULT_CATEGORY_CONFIG[cat.name];
        upsertCategoryConfig({
          provider: provider.id,
          category_id: cat.id,
          category_name: cat.name,
          bucket: defaults?.bucket ?? null,
          maxifi_subcategory: defaults?.maxifiSubcategory ?? null,
          maxifi_group: defaults?.maxifiGroup ?? null,
          forecast_model: defaults?.forecastModel ?? defaultModelFromVariability(cat.variability),
          forecast_override_amount: null,
          forecast_exclude_amount: null,
          forecast_add_amount: null,
          updated_at: now,
        });
      }
    }

    // Remove DB rows for categories no longer present in the provider's data
    for (const config of existingConfigs) {
      if (!monarchExpenseIds.has(config.category_id)) {
        deleteCategoryConfig(provider.id, config.category_id);
      }
    }

    const allConfigs = getAllCategoryConfigs(provider.id);
    const configById = Object.fromEntries(allConfigs.map((c) => [c.category_id, c]));

    // Get MaxiFi budgets for the year
    const budgets = getMaxiFiBudgets(year);
    const budgetByBucket: Record<string, number> = {};
    for (const b of budgets) {
      budgetByBucket[b.bucket] = b.amount;
    }
    const hasBudget = budgets.length > 0;

    // Build category rows for all expense categories
    const categoryRows: Array<{
      categoryId: string;
      categoryName: string;
      groupName: string;
      bucket: string | null;
      forecastModel: string;
      forecastModelLabel: string;
      ytdTotal: number;
      annualForecast: number;
      priorYearTotal: number;
      flags: ReturnType<typeof computeFlags>;
      config: ReturnType<typeof getAllCategoryConfigs>[number];
    }> = [];
    for (const group of groups) {
      if (group.type !== 'expense') continue;
      for (const cat of group.categories) {
        const config = configById[cat.id];
        if (!config || config.bucket === 'excluded') continue;

        const ytdTotal = ytdByCategory[cat.id] ?? 0;
        const priorYearActual = priorByCategory[cat.id] ?? 0;
        const { annualForecast, priorYearFallback } = computeForecast({
          ytdTotal,
          daysElapsed,
          model: config.forecast_model,
          overrideAmount: config.forecast_override_amount,
          excludeAmount: config.forecast_exclude_amount,
          addAmount: config.forecast_add_amount,
          priorYearActual,
        });

        const flags = computeFlags({
          ytdTotal,
          hasBucket: !!config.bucket,
          hasBudget,
          priorYearFallback,
        });

        categoryRows.push({
          categoryId: cat.id,
          categoryName: cat.name,
          groupName: group.name,
          bucket: config.bucket,
          forecastModel: config.forecast_model,
          forecastModelLabel: MODEL_LABELS[config.forecast_model],
          ytdTotal,
          annualForecast,
          priorYearTotal: priorByCategory[cat.id] ?? 0,
          flags,
          config,
        });
      }
    }

    // Surface uncategorized/unassigned categories
    const unassigned = [];
    for (const group of groups) {
      if (group.type !== 'expense') continue;
      for (const cat of group.categories) {
        const config = configById[cat.id];
        if (!config || !config.bucket) {
          unassigned.push({ categoryId: cat.id, categoryName: cat.name, groupName: group.name });
        }
      }
    }

    // Fixed subcategory breakdown
    const subcatOrder = [
      'housing', 'medicare_part_b', 'life_premium',
      'person1_retirement', 'person2_retirement',
      'taxes', 'hsa_contributions',
    ];
    const members = getHouseholdMembers();
    const person1 = members.find((m) => m.member_key === 'person1')?.name || 'Person 1';
    const person2 = members.find((m) => m.member_key === 'person2')?.name || 'Person 2';
    const subcatLabels: Record<string, string> = {
      housing: 'Housing',
      medicare_part_b: 'Medicare Part B Premium',
      life_premium: 'Life Premium',
      person1_retirement: `${person1}'s Retirement`,
      person2_retirement: `${person2}'s Retirement`,
      taxes: 'Taxes',
      hsa_contributions: 'HSA Contributions',
    };
    const subcatBudgetRows = getMaxiFiSubcategories(year);
    const budgetBySubcat: Record<string, number> = {};
    for (const s of subcatBudgetRows) budgetBySubcat[s.subcategory] = s.amount;

    const forecastBySubcat: Record<string, number> = {};
    let otherExpensesForecast = 0;
    for (const row of categoryRows) {
      if (row.bucket !== 'fixed') continue;
      const subcat = row.config.maxifi_subcategory;
      // Only the recurring subcategories get their own row. Everything else —
      // null, or one-off/special items like COBRA & Medical — rolls into
      // "Other / Special Expenses" so the breakdown reconciles to the bucket total.
      if (subcat && subcatOrder.includes(subcat)) {
        forecastBySubcat[subcat] = (forecastBySubcat[subcat] ?? 0) + row.annualForecast;
      } else {
        otherExpensesForecast += row.annualForecast;
      }
    }
    const specialExpensesTotal = getSpecialExpenses(year).reduce((sum, e) => sum + e.amount, 0);

    // Manually-entered contribution actuals (HSA, retirement) that Monarch can't see.
    // Use the user's amount as the subcategory forecast and add it to the Fixed total.
    let manualContributionsTotal = 0;
    for (const s of subcatBudgetRows) {
      if (s.actual_amount != null && subcatOrder.includes(s.subcategory)) {
        forecastBySubcat[s.subcategory] = (forecastBySubcat[s.subcategory] ?? 0) + s.actual_amount;
        manualContributionsTotal += s.actual_amount;
      }
    }

    const fixedSubcategoryBreakdown = subcatOrder
      .map((key) => ({
        key,
        label: subcatLabels[key],
        forecast: forecastBySubcat[key] ?? 0,
        budget: key in budgetBySubcat ? budgetBySubcat[key] : null,
      }))
      .filter((item) => item.forecast > 0 || item.budget !== null);

    if (otherExpensesForecast > 0 || specialExpensesTotal > 0) {
      fixedSubcategoryBreakdown.push({
        key: 'other_expenses',
        label: 'Other / Special Expenses',
        forecast: otherExpensesForecast,
        budget: specialExpensesTotal > 0 ? specialExpensesTotal : null,
      });
    }

    // Bucket summaries
    const fixed = categoryRows.filter((r) => r.bucket === 'fixed');
    const discretionary = categoryRows.filter((r) => r.bucket === 'discretionary');

    const sum = (rows: typeof categoryRows, key: 'ytdTotal' | 'annualForecast') =>
      rows.reduce((acc, r) => acc + r[key], 0);

    return NextResponse.json({
      year,
      startDate: startOfYear,
      endDate,
      daysElapsed,
      fixedSubcategoryBreakdown,
      buckets: {
        fixed: {
          ytdTotal: sum(fixed, 'ytdTotal'),
          annualForecast: sum(fixed, 'annualForecast') + manualContributionsTotal,
          budget: budgetByBucket['fixed'] ?? null,
          categories: fixed,
        },
        discretionary: {
          ytdTotal: sum(discretionary, 'ytdTotal'),
          annualForecast: sum(discretionary, 'annualForecast'),
          budget: budgetByBucket['discretionary'] ?? null,
          categories: discretionary,
        },
      },
      unassigned,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'Not connected to Monarch') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
