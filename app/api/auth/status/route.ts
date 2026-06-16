import { NextResponse } from 'next/server';
import { getOAuthTokens } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tokens = getOAuthTokens();
  if (!tokens) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, expiresAt: tokens.expires_at });
}
