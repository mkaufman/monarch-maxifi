import { NextRequest, NextResponse } from 'next/server';
import {
  getMaxiFiBudgets,
  upsertMaxiFiBudget,
  getMaxiFiSubcategories,
  upsertMaxiFiSubcategory,
  getSpecialExpenses,
  upsertSpecialExpense,
  deleteSpecialExpense,
} from '@/lib/db';
import { tryDemoFixture } from '@/lib/demo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);
  if (isNaN(year)) return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });

  const demo = tryDemoFixture('budgets', year);
  if (demo) return demo;

  const [buckets, subcategories, specialExpenses] = await Promise.all([
    Promise.resolve(getMaxiFiBudgets(year)),
    Promise.resolve(getMaxiFiSubcategories(year)),
    Promise.resolve(getSpecialExpenses(year)),
  ]);

  return NextResponse.json({ year, buckets, subcategories, specialExpenses });
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as {
    year: number;
    buckets?: Array<{ bucket: 'fixed' | 'discretionary'; amount: number }>;
    subcategories?: Array<{ subcategory: string; amount: number }>;
    specialExpenses?: Array<{ id?: number; year: number; name: string; amount: number; _delete?: boolean }>;
  };

  if (!body.year) {
    return NextResponse.json({ error: 'year is required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.buckets) {
    for (const b of body.buckets) {
      upsertMaxiFiBudget({ year: body.year, bucket: b.bucket, amount: b.amount, updated_at: now });
    }
  }

  if (body.subcategories) {
    for (const s of body.subcategories) {
      upsertMaxiFiSubcategory({ year: body.year, subcategory: s.subcategory, amount: s.amount, updated_at: now });
    }
  }

  if (body.specialExpenses) {
    for (const se of body.specialExpenses) {
      if (se._delete && se.id) {
        deleteSpecialExpense(se.id);
      } else {
        upsertSpecialExpense({ id: se.id, year: se.year, name: se.name, amount: se.amount, updated_at: now });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
