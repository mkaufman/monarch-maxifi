#!/usr/bin/env node
/**
 * Activates demo mode using a local snapshot instead of a live Monarch connection.
 * Use this when the Monarch MCP is unavailable.
 *
 * What it does:
 *   - Reads monarch data from data/demo-monarch.json (snapshot captured before outage)
 *   - Reads budget data from the local SQLite DB (current corrected values)
 *   - Applies the same scaling and anonymization as demo-on.mjs
 *   - Writes demo-monarch-{year}.json and demo-budgets-{year}.json
 *   - Note: prior year fixtures are not generated (no snapshot available)
 *
 * Usage:
 *   npm run demo:on-offline          (defaults to current year)
 *   npm run demo:on-offline -- 2026  (specify year explicitly)
 *
 * Restore with:  npm run demo:off
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'monarch-maxifi.db');
const BACKUP_PATH = path.join(ROOT, 'data', 'demo-backup.json');
const MONARCH_SNAPSHOT = path.join(ROOT, 'data', 'demo-monarch.json');

if (fs.existsSync(BACKUP_PATH)) {
  console.error('\n✗ Demo mode is already active. Run npm run demo:off first.\n');
  process.exit(1);
}

if (!fs.existsSync(MONARCH_SNAPSHOT)) {
  console.error('\n✗ Monarch snapshot not found at data/demo-monarch.json\n');
  process.exit(1);
}

const year = parseInt(process.argv[2] ?? String(new Date().getFullYear()), 10);

const FAKE_PERSON1 = 'David';
const FAKE_PERSON2 = 'Karen';

const GENERIC_EXPENSE_NAMES = [
  'Home Improvement Project',
  'Vehicle Replacement',
  'Travel Fund',
  'Medical Deductible',
  'Home Appliance Upgrade',
  'Education Expenses',
];

const GLOBAL_SCALE = 0.84;

function jitter(maxPct = 0.12) {
  return 1 + (Math.random() - 0.5) * maxPct * 2;
}

function roundToNearest(n, multiple) {
  return Math.round(n / multiple) * multiple;
}

function roundBudget(n) {
  return n > 20000 ? roundToNearest(n, 1000) : roundToNearest(n, 500);
}

// --- Backup real names so demo:off can restore them ----------------------

const db = new Database(DB_PATH);
const members = db.prepare('SELECT * FROM household_members').all();

const realPerson1 = members.find((m) => m.member_key === 'person1')?.name ?? 'Person 1';
const realPerson2 = members.find((m) => m.member_key === 'person2')?.name ?? 'Person 2';

// Find category_config rows whose names contain real person names
const namePattern = new RegExp(`\\b(${realPerson1}|${realPerson2})\\b`, 'i');
const allCategories = db.prepare('SELECT category_id, category_name FROM category_config').all();
const affectedCategories = allCategories.filter((c) => namePattern.test(c.category_name));

fs.writeFileSync(BACKUP_PATH, JSON.stringify({ members, categoryNames: affectedCategories }, null, 2));
console.log('Real names backed up to data/demo-backup.json');

// --- Load monarch snapshot -----------------------------------------------

console.log('\nReading monarch snapshot from data/demo-monarch.json...');
const monarchData = JSON.parse(fs.readFileSync(MONARCH_SNAPSHOT, 'utf-8'));

if (monarchData.year !== year) {
  console.warn(`  Warning: snapshot is year ${monarchData.year}, generating fixture for ${year}.`);
}

// --- Load budget data from DB (not snapshot — snapshot is stale/pre-scaled) ---

console.log(`Reading budget data from DB for year=${year}...`);
const budgetsData = {
  year,
  buckets: db.prepare('SELECT * FROM maxifi_budgets WHERE year = ?').all(year),
  subcategories: db.prepare('SELECT * FROM maxifi_fixed_subcategories WHERE year = ?').all(year),
  specialExpenses: db.prepare('SELECT * FROM maxifi_special_expenses WHERE year = ?').all(year),
};

// --- Scale monarch data --------------------------------------------------

const fakeMonarch = JSON.parse(JSON.stringify(monarchData));

for (const bucket of ['fixed', 'discretionary']) {
  const cats = fakeMonarch.buckets[bucket]?.categories;
  if (!cats) continue;

  for (const cat of cats) {
    const catFactor = GLOBAL_SCALE * jitter(0.18);
    const realYtd = cat.ytdTotal;
    const realForecast = cat.annualForecast;

    cat.ytdTotal = Math.round(realYtd * catFactor);

    if (realYtd > 0) {
      const ratio = realForecast / realYtd;
      cat.annualForecast = Math.round(cat.ytdTotal * ratio * jitter(0.06));
    } else {
      cat.annualForecast = Math.round(realForecast * catFactor * jitter(0.06));
    }
    cat.annualForecast = Math.max(cat.annualForecast, cat.ytdTotal);
    cat.priorYearTotal = Math.round((cat.priorYearTotal ?? 0) * catFactor * jitter(0.15));
  }

  fakeMonarch.buckets[bucket].ytdTotal = cats.reduce((s, c) => s + c.ytdTotal, 0);
  fakeMonarch.buckets[bucket].annualForecast = cats.reduce((s, c) => s + c.annualForecast, 0);
}

// Replace real names in category names (e.g. "Alex's Business Expense" → "David's Business Expense")
for (const bucket of ['fixed', 'discretionary']) {
  for (const cat of fakeMonarch.buckets[bucket]?.categories ?? []) {
    cat.categoryName = cat.categoryName
      .replace(new RegExp(`\\b${realPerson1}\\b`, 'g'), FAKE_PERSON1)
      .replace(new RegExp(`\\b${realPerson2}\\b`, 'g'), FAKE_PERSON2);
  }
}

// --- Scale budget data ---------------------------------------------------

const fakeBudgets = JSON.parse(JSON.stringify(budgetsData));

for (const s of fakeBudgets.subcategories ?? []) {
  s.amount = roundBudget(s.amount * GLOBAL_SCALE * jitter(0.10));
}

// Anonymize special expense names and scale amounts (done here so the
// balanced fixed total below can include the scaled special expense amounts)
let nameIdx = 0;
for (const se of fakeBudgets.specialExpenses ?? []) {
  se.name = GENERIC_EXPENSE_NAMES[nameIdx % GENERIC_EXPENSE_NAMES.length];
  nameIdx++;
  se.amount = roundBudget(se.amount * GLOBAL_SCALE * jitter(0.12));
}

// Force the fixed bucket total to equal scaled subcats + scaled special expenses
// so the Fixed Budget Validation Warning doesn't fire during the demo.
const scaledSubcatTotal = (fakeBudgets.subcategories ?? []).reduce((s, c) => s + c.amount, 0);
const scaledSpecialTotal = (fakeBudgets.specialExpenses ?? []).reduce((s, se) => s + se.amount, 0);
for (const b of fakeBudgets.buckets ?? []) {
  b.amount = b.bucket === 'fixed'
    ? scaledSubcatTotal + scaledSpecialTotal
    : roundBudget(b.amount * GLOBAL_SCALE * jitter(0.07));
}

// Copy scaled bucket budgets into monarch fixture
const scaledBucketBudget = Object.fromEntries(
  (fakeBudgets.buckets ?? []).map((b) => [b.bucket, b.amount])
);
for (const bucket of ['fixed', 'discretionary']) {
  if (fakeMonarch.buckets[bucket]?.budget !== null && scaledBucketBudget[bucket] !== undefined) {
    fakeMonarch.buckets[bucket].budget = scaledBucketBudget[bucket];
  }
}

// Recompute fixedSubcategoryBreakdown from scaled category forecasts
const scaledSubcatBudget = Object.fromEntries(
  (fakeBudgets.subcategories ?? []).map((s) => [s.subcategory, s.amount])
);
const forecastBySubcat = {};
let unallocatedForecast = 0;
for (const cat of fakeMonarch.buckets.fixed?.categories ?? []) {
  const subcat = cat.config?.maxifi_subcategory;
  if (subcat) {
    forecastBySubcat[subcat] = (forecastBySubcat[subcat] ?? 0) + cat.annualForecast;
  } else {
    unallocatedForecast += cat.annualForecast;
  }
}
for (const item of fakeMonarch.fixedSubcategoryBreakdown ?? []) {
  item.forecast = item.key === 'unallocated' ? unallocatedForecast : (forecastBySubcat[item.key] ?? 0);
  if (item.budget !== null && scaledSubcatBudget[item.key] !== undefined) {
    item.budget = scaledSubcatBudget[item.key];
  }
  item.label = item.label
    .replace(new RegExp(`\\b${realPerson1}\\b`, 'g'), FAKE_PERSON1)
    .replace(new RegExp(`\\b${realPerson2}\\b`, 'g'), FAKE_PERSON2);
}

// --- Write fixtures ------------------------------------------------------

const monarchFixture = path.join(ROOT, 'data', `demo-monarch-${year}.json`);
const budgetsFixture = path.join(ROOT, 'data', `demo-budgets-${year}.json`);

fs.writeFileSync(monarchFixture, JSON.stringify(fakeMonarch, null, 2));
console.log(`  Monarch fixture → data/demo-monarch-${year}.json`);

fs.writeFileSync(budgetsFixture, JSON.stringify(fakeBudgets, null, 2));
console.log(`  Budgets fixture → data/demo-budgets-${year}.json`);

// --- Update names in SQLite ----------------------------------------------

const now = new Date().toISOString();

// Rename affected categories in category_config
for (const cat of affectedCategories) {
  const anonName = cat.category_name
    .replace(new RegExp(`\\b${realPerson1}\\b`, 'gi'), FAKE_PERSON1)
    .replace(new RegExp(`\\b${realPerson2}\\b`, 'gi'), FAKE_PERSON2);
  db.prepare('UPDATE category_config SET category_name = ?, updated_at = ? WHERE category_id = ?')
    .run(anonName, now, cat.category_id);
}
if (affectedCategories.length > 0) {
  console.log(`  Renamed ${affectedCategories.length} category name(s) containing real names`);
}

db.prepare("UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = 'person1'").run(FAKE_PERSON1, now);
db.prepare("UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = 'person2'").run(FAKE_PERSON2, now);

console.log(`\n✓ Demo mode active for ${year} (offline — no live Monarch connection needed)`);
console.log(`  ${realPerson1}  →  ${FAKE_PERSON1}`);
console.log(`  ${realPerson2}  →  ${FAKE_PERSON2}`);
console.log(`  All amounts scaled by ~${Math.round(GLOBAL_SCALE * 100)}% with per-item variation`);
console.log(`  Note: prior year (${year - 1}) not available — stay on ${year} during the demo`);
console.log(`\nRestore real data with:\n  npm run demo:off\n`);
