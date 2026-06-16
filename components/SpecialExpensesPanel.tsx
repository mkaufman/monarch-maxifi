'use client';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

interface SpecialExpense {
  id: number;
  year: number;
  name: string;
  amount: number;
}

interface Props {
  expenses: SpecialExpense[];
}

export default function SpecialExpensesPanel({ expenses }: Props) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-navy">Special Expenses</h2>
        <p className="text-xs text-text-secondary mt-1">Planned amounts from your MaxiFi profile — actuals tracked in Fixed Spending above.</p>
      </div>
      {expenses.length === 0 ? (
        <p className="text-sm text-text-secondary">No special expenses for this year — add them in Settings.</p>
      ) : (
        <div className="space-y-3">
          {expenses.map((e) => (
            <div key={e.id} className="flex justify-between items-center">
              <span className="text-sm text-text-secondary">{e.name}</span>
              <span className="text-sm tabular-nums text-text-primary">{fmt(e.amount)}</span>
            </div>
          ))}
          <div className="pt-2 border-t border-border flex justify-between items-center">
            <span className="text-sm font-semibold text-text-primary">Total Planned</span>
            <span className="text-sm font-semibold tabular-nums text-text-primary">{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
