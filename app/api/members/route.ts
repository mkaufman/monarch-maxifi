import { NextRequest, NextResponse } from 'next/server';
import { getHouseholdMembers, upsertHouseholdMember } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = getHouseholdMembers();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.member_key] = row.name;
  }
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as { member_key: string; name: string };
  if (!body.member_key) {
    return NextResponse.json({ error: 'member_key is required' }, { status: 400 });
  }
  upsertHouseholdMember({
    member_key: body.member_key,
    name: body.name ?? '',
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
