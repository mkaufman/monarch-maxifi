import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getAppSetting, setAppSetting } from '@/lib/db';
import { CSV_UPLOAD_PATH } from '@/lib/providers/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const active = getAppSetting('active_provider') ?? 'monarch';
  return NextResponse.json({
    active,
    csvUploaded: fs.existsSync(CSV_UPLOAD_PATH),
    ynabConnected: !!getAppSetting('ynab_pat'),
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as { provider?: string };
  if (body.provider !== 'monarch' && body.provider !== 'csv' && body.provider !== 'ynab') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (body.provider === 'csv' && !fs.existsSync(CSV_UPLOAD_PATH)) {
    return NextResponse.json({ error: 'No CSV uploaded yet' }, { status: 400 });
  }
  if (body.provider === 'ynab' && !getAppSetting('ynab_pat')) {
    return NextResponse.json({ error: 'YNAB not connected yet' }, { status: 400 });
  }
  setAppSetting('active_provider', body.provider);
  return NextResponse.json({ ok: true });
}
