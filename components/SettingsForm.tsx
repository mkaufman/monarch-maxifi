'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CategoryConfigRow, MaxiFiBudgetRow, MaxiFiSubcategoryRow, MaxiFiSpecialExpenseRow } from '@/lib/db';

const BUCKET_OPTIONS = ['fixed', 'discretionary', 'excluded'] as const;
const MODEL_OPTIONS = [
  { value: 'run_rate', label: 'Run Rate' },
  { value: 'known_monthly', label: 'Monthly' },
  { value: 'known_annual', label: 'Annual' },
  { value: 'adjusted_run_rate', label: 'Adjusted Run Rate' },
  { value: 'no_further_spend', label: 'No Further Spend' },
] as const;

function memberLabel(name: string, n: 1 | 2): string {
  return name.trim() || `Person ${n}`;
}

function getSubcatOptions(person1: string, person2: string) {
  return [
    { value: 'housing', label: 'Housing' },
    { value: 'medicare_part_b', label: 'Medicare Part B' },
    { value: 'life_premium', label: 'Life Premium' },
    { value: 'person1_retirement', label: `${memberLabel(person1, 1)}'s Retirement` },
    { value: 'person2_retirement', label: `${memberLabel(person2, 2)}'s Retirement` },
    { value: 'taxes', label: 'Taxes' },
    { value: 'hsa_contributions', label: 'HSA Contributions' },
  ];
}

function getSubcatLabels(person1: string, person2: string): Record<string, string> {
  return {
    housing: 'Housing',
    medicare_part_b: 'Medicare Part B Premium',
    life_premium: 'Life Premium',
    person1_retirement: `${memberLabel(person1, 1)}'s Retirement Contributions`,
    person2_retirement: `${memberLabel(person2, 2)}'s Retirement Contributions`,
    taxes: 'Taxes',
    hsa_contributions: 'HSA Contributions',
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[$,]/g, '')) || 0;
}

export default function SettingsForm() {
  const currentYear = new Date().getFullYear();
  const [budgetYear, setBudgetYear] = useState(currentYear);

  const [configs, setConfigs] = useState<CategoryConfigRow[]>([]);
  const [budgets, setBudgets] = useState<MaxiFiBudgetRow[]>([]);
  const [subcategories, setSubcategories] = useState<MaxiFiSubcategoryRow[]>([]);
  const [specialExpenses, setSpecialExpenses] = useState<MaxiFiSpecialExpenseRow[]>([]);
  const [members, setMembers] = useState<{ person1: string; person2: string }>({ person1: '', person2: '' });
  const [membersSaved, setMembersSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (yr: number) => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, budRes, membRes] = await Promise.all([
        fetch('/api/config'),
        fetch(`/api/budgets?year=${yr}`),
        fetch('/api/members'),
      ]);
      const cfgJson = await cfgRes.json() as CategoryConfigRow[];
      const budJson = await budRes.json() as { buckets: MaxiFiBudgetRow[]; subcategories: MaxiFiSubcategoryRow[]; specialExpenses: MaxiFiSpecialExpenseRow[] };
      const membJson = await membRes.json() as { person1: string; person2: string };
      setConfigs(cfgJson);
      setBudgets(budJson.buckets ?? []);
      setSubcategories(budJson.subcategories ?? []);
      setSpecialExpenses(budJson.specialExpenses ?? []);
      setMembers({ person1: membJson.person1 ?? '', person2: membJson.person2 ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(budgetYear);
  }, [load, budgetYear]);

  // ── Config updates ────────────────────────────────────────────────────────

  const updateConfig = async (categoryId: string, patch: Partial<CategoryConfigRow>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId, ...patch }),
      });
      const updated = await res.json() as CategoryConfigRow;
      setConfigs((prev) => prev.map((c) => (c.category_id === categoryId ? updated : c)));
    } catch (e) {
      console.error('Failed to update config', e);
    }
  };

  // ── Member save ───────────────────────────────────────────────────────────

  const saveMember = async (key: 'person1' | 'person2', name: string) => {
    try {
      await fetch('/api/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_key: key, name }),
      });
      setMembersSaved(true);
      setTimeout(() => setMembersSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save member', e);
    }
  };

  // ── Budget save ───────────────────────────────────────────────────────────

  const saveBudgets = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: budgetYear,
          buckets: budgets.map((b) => ({ bucket: b.bucket, amount: b.amount })),
          subcategories: subcategories.map((s) => ({ subcategory: s.subcategory, amount: s.amount })),
          specialExpenses: specialExpenses.map((se) => ({
            id: se.id,
            year: se.year,
            name: se.name,
            amount: se.amount,
          })),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const getBudgetAmount = (bucket: 'fixed' | 'discretionary') =>
    budgets.find((b) => b.bucket === bucket)?.amount ?? 0;

  const setBudgetAmount = (bucket: 'fixed' | 'discretionary', amount: number) => {
    setBudgets((prev) => {
      const existing = prev.find((b) => b.bucket === bucket);
      if (existing) return prev.map((b) => (b.bucket === bucket ? { ...b, amount } : b));
      return [...prev, { year: budgetYear, bucket, amount, updated_at: new Date().toISOString() }];
    });
  };

  const getSubcatAmount = (sub: string) =>
    subcategories.find((s) => s.subcategory === sub)?.amount ?? 0;

  const setSubcatAmount = (sub: string, amount: number) => {
    setSubcategories((prev) => {
      const existing = prev.find((s) => s.subcategory === sub);
      if (existing) return prev.map((s) => (s.subcategory === sub ? { ...s, amount } : s));
      return [...prev, { year: budgetYear, subcategory: sub, amount, updated_at: new Date().toISOString() }];
    });
  };

  const addSpecialExpense = () => {
    setSpecialExpenses((prev) => [
      ...prev,
      { year: budgetYear, name: '', amount: 0, updated_at: new Date().toISOString() },
    ]);
  };

  const updateSpecialExpense = (idx: number, patch: Partial<MaxiFiSpecialExpenseRow>) => {
    setSpecialExpenses((prev) => prev.map((se, i) => (i === idx ? { ...se, ...patch } : se)));
  };

  const removeSpecialExpense = (idx: number) => {
    setSpecialExpenses((prev) => prev.filter((_, i) => i !== idx));
  };

  const subcatOptions = getSubcatOptions(members.person1, members.person2);
  const subcatLabels = getSubcatLabels(members.person1, members.person2);

  const fixedConfigs = configs.filter((c) => c.bucket === 'fixed');
  const discretionaryConfigs = configs.filter((c) => c.bucket === 'discretionary');
  const unassignedConfigs = configs.filter((c) => !c.bucket || c.bucket === 'excluded');

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 bg-surface rounded-xl border border-border" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {error && (
        <div className="bg-orange/10 border border-orange/30 text-orange rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Household Members ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-navy">Household Members</h2>
        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <p className="text-sm text-text-secondary">Names used to label retirement subcategories throughout the app. Leave blank to use &ldquo;Person 1&rdquo; / &ldquo;Person 2&rdquo;.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm text-text-secondary">Person 1 Name</label>
              <input
                type="text"
                value={members.person1}
                onChange={(e) => setMembers((m) => ({ ...m, person1: e.target.value }))}
                onBlur={() => saveMember('person1', members.person1)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                placeholder="Person 1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-text-secondary">Person 2 Name</label>
              <input
                type="text"
                value={members.person2}
                onChange={(e) => setMembers((m) => ({ ...m, person2: e.target.value }))}
                onBlur={() => saveMember('person2', members.person2)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                placeholder="Person 2"
              />
            </div>
          </div>
          {membersSaved && <p className="text-xs text-success">✓ Saved</p>}
        </div>
      </section>

      {/* ── MaxiFi Budgets ──────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-navy">MaxiFi Budgets</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setBudgetYear((y) => y - 1)} className="px-2 py-1 text-sm border border-border rounded hover:bg-bg">‹</button>
              <span className="font-semibold text-navy w-12 text-center">{budgetYear}</span>
              <button onClick={() => setBudgetYear((y) => y + 1)} className="px-2 py-1 text-sm border border-border rounded hover:bg-bg">›</button>
            </div>
            <button
              onClick={saveBudgets}
              disabled={saving}
              className="bg-orange text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-orange/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Budgets'}
            </button>
          </div>
        </div>

        {/* Top-level buckets */}
        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold text-navy flex items-center">
            Top-Level Totals
            <Tooltip content="Find both values in MaxiFi under Reports → Base Plan Dashboard → Discretionary Spending Plan." />
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <DollarInput
              label="Discretionary Total"
              value={getBudgetAmount('discretionary')}
              onChange={(v) => setBudgetAmount('discretionary', v)}
            />
            <DollarInput
              label="Fixed Total"
              value={getBudgetAmount('fixed')}
              onChange={(v) => setBudgetAmount('fixed', v)}
            />
          </div>
        </div>

        {/* Fixed subcategories */}
        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold text-navy">Fixed Subcategories</h3>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(subcatLabels).map(([key, label]) => (
              <DollarInput
                key={key}
                label={label}
                value={getSubcatAmount(key)}
                onChange={(v) => setSubcatAmount(key, v)}
              />
            ))}
          </div>
        </div>

        {/* Special Expenses */}
        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-navy">Special Expenses</h3>
              <p className="text-xs text-text-secondary mt-0.5">Planned costs from your MaxiFi profile (car purchase, home project, medical). Included in your Fixed MaxiFi budget — actuals tracked per category in the report.</p>
            </div>
            <button
              onClick={addSpecialExpense}
              className="text-sm text-blue hover:text-navy font-medium"
            >
              + Add
            </button>
          </div>
          {specialExpenses.filter((se) => !se.id || se.year === budgetYear).length === 0 && (
            <p className="text-sm text-text-secondary">No special expenses for {budgetYear}.</p>
          )}
          {specialExpenses.map((se, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="number"
                value={se.year}
                onChange={(e) => updateSpecialExpense(i, { year: parseInt(e.target.value) || budgetYear })}
                className="w-20 border border-border rounded px-2 py-1.5 text-sm text-text-primary bg-bg"
                placeholder="Year"
              />
              <input
                type="text"
                value={se.name}
                onChange={(e) => updateSpecialExpense(i, { name: e.target.value })}
                className="flex-1 border border-border rounded px-3 py-1.5 text-sm text-text-primary"
                placeholder="Description"
              />
              <input
                type="number"
                value={se.amount || ''}
                onChange={(e) => updateSpecialExpense(i, { amount: parseDollar(e.target.value) })}
                className="w-28 border border-border rounded px-2 py-1.5 text-sm text-right text-text-primary tabular-nums"
                placeholder="0"
              />
              <button
                onClick={() => removeSpecialExpense(i)}
                className="text-text-secondary hover:text-orange text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Category Configuration ─────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-navy">Category Configuration</h2>
        <p className="text-sm text-text-secondary">
          Assign each Monarch category to a spending bucket and forecasting model. Changes save immediately.
        </p>

        <CategoryConfigTable
          label="Fixed Categories"
          configs={fixedConfigs}
          onUpdate={updateConfig}
          showMaxiFiSubcategory
          subcatOptions={subcatOptions}
        />
        <CategoryConfigTable
          label="Discretionary Categories"
          configs={discretionaryConfigs}
          onUpdate={updateConfig}
        />
        {unassignedConfigs.length > 0 && (
          <CategoryConfigTable
            label="Excluded / Unassigned"
            configs={unassignedConfigs}
            onUpdate={updateConfig}
          />
        )}
      </section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Tooltip({ content, wide }: { content: React.ReactNode; wide?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      className="relative inline-flex items-center ml-1.5 align-middle"
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.top });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <span className="cursor-help text-text-secondary/50 text-[10px] w-3.5 h-3.5 rounded-full border border-text-secondary/30 inline-flex items-center justify-center leading-none select-none font-medium">?</span>
      {pos && (
        <span
          style={{ position: 'fixed', left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)' }}
          className={`${wide ? 'w-80' : 'w-60'} bg-navy text-white text-xs rounded-lg px-3 py-2.5 z-[9999] shadow-lg pointer-events-none`}
        >
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy" />
        </span>
      )}
    </span>
  );
}

function DollarInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-text-secondary">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(parseDollar(e.target.value))}
          className="w-full pl-7 pr-3 py-2 border border-border rounded-lg text-sm text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
          placeholder="0"
        />
      </div>
    </div>
  );
}

function CategoryConfigTable({
  label,
  configs,
  onUpdate,
  showMaxiFiSubcategory,
  subcatOptions = [],
}: {
  label: string;
  configs: CategoryConfigRow[];
  onUpdate: (id: string, patch: Partial<CategoryConfigRow>) => void;
  showMaxiFiSubcategory?: boolean;
  subcatOptions?: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(true);
  const needsOverride = (model: string) =>
    model === 'known_monthly' || model === 'known_annual' || model === 'adjusted_run_rate';

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-bg transition-colors"
      >
        <span className="font-semibold text-navy">{label}</span>
        <span className="text-text-secondary text-sm">{open ? '▼' : '▶'} {configs.length} categories</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-bg">
                <th className="text-left px-6 py-3 text-text-secondary font-medium">Category</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">
                  Bucket
                  <Tooltip wide content={
                    <ul className="space-y-1.5">
                      <li><span className="font-semibold">Fixed</span> — predictable, recurring costs tracked against subcategory budgets</li>
                      <li><span className="font-semibold">Discretionary</span> — variable spending tracked against the total</li>
                      <li><span className="font-semibold">Excluded</span> — transfers, savings, or anything to omit from the forecast</li>
                    </ul>
                  } />
                </th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">
                  Forecast Model
                  <Tooltip wide content={
                    <ul className="space-y-1.5">
                      <li><span className="font-semibold">Run Rate</span> — daily avg × 365</li>
                      <li><span className="font-semibold">Monthly</span> — fixed monthly amount × 12; enter it in Override</li>
                      <li><span className="font-semibold">Annual</span> — fixed full-year total; enter it in Override</li>
                      <li><span className="font-semibold">Adjusted Run Rate</span> — run rate after removing a one-time amount and/or adding known future spend</li>
                      <li><span className="font-semibold">No Further Spend</span> — forecasts exactly what&apos;s been spent so far</li>
                    </ul>
                  } />
                </th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">
                  Override $
                  <Tooltip wide content={
                    <ul className="space-y-1.5">
                      <li><span className="font-semibold">Monthly</span> — your expected monthly amount</li>
                      <li><span className="font-semibold">Annual</span> — the full-year total</li>
                      <li><span className="font-semibold">Adjusted Run Rate</span> — subtract a one-time item and/or add known future spend before extrapolating</li>
                    </ul>
                  } />
                </th>
                {showMaxiFiSubcategory && (
                  <th className="text-left px-4 py-3 text-text-secondary font-medium">
                    MaxiFi Subcategory
                    <Tooltip content="Maps this category to a specific fixed-cost line in your MaxiFi plan, enabling subcategory-level budget comparison." />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.category_id} className="border-t border-border hover:bg-bg/50 transition-colors">
                  <td className="px-6 py-2.5">
                    <span className="font-medium text-text-primary">{c.category_name}</span>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={c.bucket ?? ''}
                      onChange={(e) => onUpdate(c.category_id, { bucket: e.target.value as CategoryConfigRow['bucket'] })}
                      className="text-xs border border-border rounded px-2 py-1 bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-blue/30"
                    >
                      <option value="">— Unassigned —</option>
                      {BUCKET_OPTIONS.map((b) => (
                        <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={c.forecast_model}
                      onChange={(e) => onUpdate(c.category_id, { forecast_model: e.target.value as CategoryConfigRow['forecast_model'] })}
                      className="text-xs border border-border rounded px-2 py-1 bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-blue/30"
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {needsOverride(c.forecast_model) && (
                      <input
                        type="number"
                        value={c.forecast_override_amount ?? ''}
                        placeholder={c.forecast_model === 'known_monthly' ? 'Monthly $' : 'Annual $'}
                        onChange={(e) =>
                          onUpdate(c.category_id, {
                            forecast_override_amount: parseFloat(e.target.value) || null,
                          })
                        }
                        className="w-28 border border-border rounded px-2 py-1 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue/30"
                      />
                    )}
                    {c.forecast_model === 'adjusted_run_rate' && (
                      <div className="flex gap-1 mt-1">
                        <input
                          type="number"
                          value={c.forecast_exclude_amount ?? ''}
                          placeholder="Remove one-time $"
                          onChange={(e) =>
                            onUpdate(c.category_id, { forecast_exclude_amount: parseFloat(e.target.value) || null })
                          }
                          className="w-32 border border-border rounded px-2 py-1 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue/30"
                          title="Subtract this one-time amount from YTD spend before extrapolating"
                        />
                        <input
                          type="number"
                          value={c.forecast_add_amount ?? ''}
                          placeholder="Add future $"
                          onChange={(e) =>
                            onUpdate(c.category_id, { forecast_add_amount: parseFloat(e.target.value) || null })
                          }
                          className="w-24 border border-border rounded px-2 py-1 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue/30"
                          title="Add this known future spend to the extrapolated amount"
                        />
                      </div>
                    )}
                  </td>
                  {showMaxiFiSubcategory && (
                    <td className="px-4 py-2">
                      <select
                        value={c.maxifi_subcategory ?? ''}
                        onChange={(e) =>
                          onUpdate(c.category_id, {
                            maxifi_subcategory: (e.target.value || null) as CategoryConfigRow['maxifi_subcategory'],
                          })
                        }
                        className="text-xs border border-border rounded px-2 py-1 bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-blue/30"
                      >
                        <option value="">—</option>
                        {subcatOptions.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
