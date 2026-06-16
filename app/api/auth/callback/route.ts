import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const APP_BASE = process.env.APP_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const error = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (error) {
    return NextResponse.redirect(`${APP_BASE}/?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${APP_BASE}/?auth_error=missing_params`);
  }

  try {
    await exchangeCodeForTokens(code, state);
    return NextResponse.redirect(`${APP_BASE}/`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${APP_BASE}/?auth_error=${encodeURIComponent(message)}`);
  }
}
