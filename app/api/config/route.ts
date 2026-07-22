import { NextRequest, NextResponse } from 'next/server';
import { getAllCategoryConfigs, upsertCategoryConfig, type CategoryConfigRow } from '@/lib/db';
import { getActiveProvider } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configs = getAllCategoryConfigs(getActiveProvider().id);
  return NextResponse.json(configs);
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as Partial<CategoryConfigRow> & { category_id: string };

  if (!body.category_id) {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 });
  }

  const provider = getActiveProvider().id;
  const existing = getAllCategoryConfigs(provider).find((c) => c.category_id === body.category_id);
  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  const updated: CategoryConfigRow = {
    ...existing,
    ...body,
    updated_at: new Date().toISOString(),
  };

  upsertCategoryConfig(updated);
  return NextResponse.json(updated);
}
