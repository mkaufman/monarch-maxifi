import { NextResponse } from 'next/server';
import { clearOAuthTokens } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  clearOAuthTokens();
  return NextResponse.json({ ok: true });
}
