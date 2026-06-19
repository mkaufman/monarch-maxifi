import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export function tryDemoFixture(
  prefix: 'monarch' | 'budgets',
  year: number
): NextResponse | null {
  const fixture = path.join(process.cwd(), 'data', `demo-${prefix}-${year}.json`);
  if (!fs.existsSync(fixture)) return null;
  return NextResponse.json(JSON.parse(fs.readFileSync(fixture, 'utf-8')));
}
