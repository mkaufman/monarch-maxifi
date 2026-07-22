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
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as { provider?: string };
  if (body.provider !== 'monarch' && body.provider !== 'csv') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (body.provider === 'csv' && !fs.existsSync(CSV_UPLOAD_PATH)) {
    return NextResponse.json({ error: 'No CSV uploaded yet' }, { status: 400 });
  }
  setAppSetting('active_provider', body.provider);
  return NextResponse.json({ ok: true });
}
