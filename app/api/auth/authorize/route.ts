import { NextResponse } from 'next/server';
import { startOAuthFlow } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const url = await startOAuthFlow();
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${process.env.APP_URL ?? 'http://localhost:3000'}/?auth_error=${encodeURIComponent(message)}`,
    );
  }
}
