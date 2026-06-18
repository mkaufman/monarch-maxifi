#!/usr/bin/env node
/**
 * Deactivates demo mode and restores real data.
 *
 * What it does:
 *   - Removes the fixture files that override live API data
 *   - Restores real household member names to the SQLite DB
 *   - Deletes the backup file
 *
 * Usage:  npm run demo:off
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'monarch-maxifi.db');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_PATH = path.join(ROOT, 'data', 'demo-backup.json');

// Remove all year-specific demo fixture files
const fixtures = fs.readdirSync(DATA_DIR).filter(
  (f) => f.startsWith('demo-monarch-') || f.startsWith('demo-budgets-')
);
for (const f of fixtures) {
  fs.unlinkSync(path.join(DATA_DIR, f));
  console.log(`Removed ${f}`);
}
if (fixtures.length === 0) {
  console.log('No demo fixtures found — demo mode was not active.');
}

// Restore real names from backup
if (fs.existsSync(BACKUP_PATH)) {
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'));
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();
  for (const m of backup.members) {
    db.prepare('UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = ?').run(
      m.name,
      now,
      m.member_key,
    );
  }
  fs.unlinkSync(BACKUP_PATH);
  const names = backup.members.map((m) => `${m.member_key} → ${m.name}`).join(', ');
  console.log(`Real names restored: ${names}`);
} else {
  console.log('No backup found — names were not changed (or already restored).');
}

console.log('\n✓ Real data restored. Refresh your browser to see live Monarch data.\n');
