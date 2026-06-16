#!/usr/bin/env node
/**
 * Activates demo mode for screenshot-safe sharing.
 *
 * What it does:
 *   - Fetches live data from the running dev server
 *   - Scales all dollar amounts by a random global factor (~84%) with per-item jitter
 *   - Recomputes bucket totals from scaled category sums (so they add up correctly)
 *   - Replaces household names with fictional ones
 *   - Replaces special expense names with generic labels
 *   - Writes fixture files that the API routes serve instead of live data
 *   - Backs up real names so demo-off.mjs can restore them
 *
 * Usage:
 *   npm run demo:on          (server must be running at localhost:3000)
 *   npm run demo:on -- 2025  (specify a different year)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'monarch-maxifi.db');
const MONARCH_FIXTURE = path.join(ROOT, 'data', 'demo-monarch.json');
const BUDGETS_FIXTURE = path.join(ROOT, 'data', 'demo-budgets.json');
const BACKUP_PATH = path.join(ROOT, 'data', 'demo-backup.json');

const BASE_URL = 'http://localhost:3000';
const year = parseInt(process.argv[2] ?? String(new Date().getFullYear()), 10);

const FAKE_PERSON1 = 'Alex';
const FAKE_PERSON2 = 'Jordan';

// Generic names for special expenses — cycles if there are more than this many
const GENERIC_EXPENSE_NAMES = [
  'Home Improvement Project',
  'Vehicle Replacement',
  'Travel Fund',
  'Medical Deductible',
  'Home Appliance Upgrade',
  'Education Expenses',
];

// Global scale makes the totals clearly different from real numbers.
// A value < 1.0 also helps because "lower" demo numbers are less likely
// to accidentally match real amounts by coincidence.
const GLOBAL_SCALE = 0.84;

// --- Seeded-ish jitter helpers --------------------------------------------

// Returns a random multiplier in [1 - maxPct, 1 + maxPct]
function jitter(maxPct = 0.12) {
  return 1 + (Math.random() - 0.5) * maxPct * 2;
}

function scaleAmount(n, extraJitter = 0.12) {
  return Math.round(n * GLOBAL_SCALE * jitter(extraJitter));
}

function roundToNearest(n, multiple) {
  return Math.round(n / multiple) * multiple;
}

// Budget-style rounding: nearest $500 for small amounts, $1000 for large
function roundBudget(n) {
  return n > 20000 ? roundToNearest(n, 1000) : roundToNearest(n, 500);
}

// --- Fetch ----------------------------------------------------------------

console.log(`Fetching year=${year} data from ${BASE_URL}...`);

let monarchData, budgetsData;
try {
  const [mRes, bRes] = await Promise.all([
    fetch(`${BASE_URL}/api/monarch?year=${year}`),
    fetch(`${BASE_URL}/api/budgets?year=${year}`),
  ]);
  if (!mRes.ok) throw new Error(`/api/monarch → ${mRes.status} ${await mRes.text()}`);
  if (!bRes.ok) throw new Error(`/api/budgets → ${bRes.status} ${await bRes.text()}`);
  monarchData = await mRes.json();
  budgetsData = await bRes.json();
} catch (err) {
  console.error(`\nFailed to fetch data: ${err.message}`);
  console.error('Make sure the dev server is running:  npm run dev');
  process.exit(1);
}

// --- Backup real names and read current values ----------------------------

const db = new Database(DB_PATH);
const members = db.prepare('SELECT * FROM household_members').all();
fs.writeFileSync(BACKUP_PATH, JSON.stringify({ members }, null, 2));
console.log('Real names backed up to data/demo-backup.json');

const realPerson1 = members.find((m) => m.member_key === 'person1')?.name ?? 'Person 1';
const realPerson2 = members.find((m) => m.member_key === 'person2')?.name ?? 'Person 2';

// --- Scale /api/monarch response ------------------------------------------

const fakeMonarch = JSON.parse(JSON.stringify(monarchData));

for (const bucket of ['fixed', 'discretionary']) {
  const cats = fakeMonarch.buckets[bucket].categories;

  for (const cat of cats) {
    // Per-category scale keeps relative ordering intact while making each
    // category look distinct from its real value.
    const catFactor = GLOBAL_SCALE * jitter(0.18);

    const realYtd = cat.ytdTotal;
    const realForecast = cat.annualForecast;

    cat.ytdTotal = Math.round(realYtd * catFactor);

    // Preserve the forecast/ytd ratio (reflects the same model), but add
    // a small additional wobble so the forecast isn't a mechanical multiple.
    if (realYtd > 0) {
      const ratio = realForecast / realYtd;
      cat.annualForecast = Math.round(cat.ytdTotal * ratio * jitter(0.06));
    } else {
      // No YTD spend — scale forecast directly
      cat.annualForecast = Math.round(realForecast * catFactor * jitter(0.06));
    }
    // Forecast can't be less than what's already been spent
    cat.annualForecast = Math.max(cat.annualForecast, cat.ytdTotal);

    cat.priorYearTotal = Math.round((cat.priorYearTotal ?? 0) * catFactor * jitter(0.15));
  }

  // Recompute bucket totals so they exactly equal the sum of categories.
  // This is the critical consistency check — the UI shows both side-by-side.
  fakeMonarch.buckets[bucket].ytdTotal = cats.reduce((s, c) => s + c.ytdTotal, 0);
  fakeMonarch.buckets[bucket].annualForecast = cats.reduce((s, c) => s + c.annualForecast, 0);

  // Scale bucket budget with a small independent wobble (different from
  // categories so variance isn't identical to real).
  if (fakeMonarch.buckets[bucket].budget !== null) {
    fakeMonarch.buckets[bucket].budget = roundBudget(
      fakeMonarch.buckets[bucket].budget * GLOBAL_SCALE * jitter(0.05)
    );
  }
}

// Scale subcategory breakdown (Fixed bucket detail)
for (const item of fakeMonarch.fixedSubcategoryBreakdown ?? []) {
  item.forecast = Math.round(item.forecast * GLOBAL_SCALE * jitter(0.14));
  if (item.budget !== null) {
    item.budget = roundBudget(item.budget * GLOBAL_SCALE * jitter(0.08));
  }
  // Replace real names in labels (e.g. "Jane's Retirement" → "Alex's Retirement")
  item.label = item.label.replace(new RegExp(`\\b${realPerson1}\\b`, 'g'), FAKE_PERSON1)
                          .replace(new RegExp(`\\b${realPerson2}\\b`, 'g'), FAKE_PERSON2);
}

fs.writeFileSync(MONARCH_FIXTURE, JSON.stringify(fakeMonarch, null, 2));
console.log('Monarch fixture written to data/demo-monarch.json');

// --- Scale /api/budgets response ------------------------------------------

const fakeBudgets = JSON.parse(JSON.stringify(budgetsData));

for (const b of fakeBudgets.buckets ?? []) {
  b.amount = roundBudget(b.amount * GLOBAL_SCALE * jitter(0.07));
}

for (const s of fakeBudgets.subcategories ?? []) {
  s.amount = roundBudget(s.amount * GLOBAL_SCALE * jitter(0.10));
}

// Replace special expense names and scale amounts
let nameIdx = 0;
for (const se of fakeBudgets.specialExpenses ?? []) {
  se.name = GENERIC_EXPENSE_NAMES[nameIdx % GENERIC_EXPENSE_NAMES.length];
  nameIdx++;
  se.amount = roundBudget(se.amount * GLOBAL_SCALE * jitter(0.12));
}

fs.writeFileSync(BUDGETS_FIXTURE, JSON.stringify(fakeBudgets, null, 2));
console.log('Budgets fixture written to data/demo-budgets.json');

// --- Update names in SQLite -----------------------------------------------

const now = new Date().toISOString();
db.prepare("UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = 'person1'").run(FAKE_PERSON1, now);
db.prepare("UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = 'person2'").run(FAKE_PERSON2, now);

console.log(`\n✓ Demo mode active for year ${year}`);
console.log(`  ${realPerson1}  →  ${FAKE_PERSON1}`);
console.log(`  ${realPerson2}  →  ${FAKE_PERSON2}`);
console.log(`  All amounts scaled by ~${Math.round(GLOBAL_SCALE * 100)}% with per-item variation`);
console.log(`\nTake your screenshots, then restore with:\n  npm run demo:off\n`);
