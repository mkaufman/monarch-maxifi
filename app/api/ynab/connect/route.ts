import { NextRequest, NextResponse } from 'next/server';
import { getAppSetting, setAppSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

const YNAB_API = 'https://api.ynab.com/v1';

// Connect YNAB via Personal Access Token: validate the token, resolve a default
// budget, store both, and switch the active provider to YNAB.
export async function POST(request: NextRequest) {
  const { pat } = (await request.json()) as { pat?: string };
  if (!pat || !pat.trim()) {
    return NextResponse.json({ error: 'A Personal Access Token is required' }, { status: 400 });
  }
  const token = pat.trim();

  // Validate + pick a budget in one call: /budgets 401s on a bad token.
  const res = await fetch(`${YNAB_API}/budgets`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    return NextResponse.json({ error: 'Invalid Personal Access Token' }, { status: 400 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: `YNAB request failed (HTTP ${res.status})` }, { status: 502 });
  }
  const body = (await res.json()) as {
    data: { budgets: Array<{ id: string; name: string }>; default_budget?: { id: string } | null };
  };
  const budgetId = body.data.default_budget?.id ?? body.data.budgets[0]?.id;
  if (!budgetId) {
    return NextResponse.json({ error: 'No YNAB budgets found for this token' }, { status: 400 });
  }

  setAppSetting('ynab_pat', token);
  setAppSetting('ynab_budget_id', budgetId);
  setAppSetting('active_provider', 'ynab');
  return NextResponse.json({ ok: true });
}

// Disconnect YNAB: clear the token and fall back to Monarch if YNAB was active.
export async function DELETE() {
  setAppSetting('ynab_pat', '');
  setAppSetting('ynab_budget_id', '');
  if (getAppSetting('active_provider') === 'ynab') {
    setAppSetting('active_provider', 'monarch');
  }
  return NextResponse.json({ ok: true });
}
