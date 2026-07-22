import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { setAppSetting } from '@/lib/db';
import { CSV_UPLOAD_PATH } from '@/lib/providers/csv';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  const text = await file.text();
  fs.mkdirSync(path.dirname(CSV_UPLOAD_PATH), { recursive: true });
  fs.writeFileSync(CSV_UPLOAD_PATH, text, 'utf-8');
  // Uploading a CSV switches the active provider to it.
  setAppSetting('active_provider', 'csv');
  return NextResponse.json({ ok: true });
}
