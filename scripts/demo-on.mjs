#!/usr/bin/env node
/**
 * Activates demo mode for screenshot-safe sharing.
 *
 * What it does:
 *   - Fetches live data from the running dev server for the current year AND prior year
 *   - Scales all dollar amounts by a random global factor (~84%) with per-item jitter
 *   - Recomputes bucket totals from scaled category sums (so they add up correctly)
 *   - Replaces household names with fictional ones
 *   - Replaces special expense names with generic labels
 *   - Writes year-specific fixture files (demo-monarch-{year}.json, demo-budgets-{year}.json)
 *     that the API routes serve instead of live data
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
const BACKUP_PATH = path.join(ROOT, 'data', 'demo-backup.json');

if (fs.existsSync(BACKUP_PATH)) {
  console.error('\n✗ Demo mode is already active. Run npm run demo:off first.\n');
  process.exit(1);
}

const BASE_URL = 'http://localhost:3000';
const year = parseInt(process.argv[2] ?? String(new Date().getFullYear()), 10);
const priorYear = year - 1;

const FAKE_PERSON1 = 'David';
const FAKE_PERSON2 = 'Karen';

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

function roundToNearest(n, multiple) {
  return Math.round(n / multiple) * multiple;
}

// Budget-style rounding: nearest $500 for small amounts, $1000 for large
function roundBudget(n) {
  return n > 20000 ? roundToNearest(n, 1000) : roundToNearest(n, 500);
}

// --- Backup real names ----------------------------------------------------

const db = new Database(DB_PATH);
const members = db.prepare('SELECT * FROM household_members').all();
fs.writeFileSync(BACKUP_PATH, JSON.stringify({ members }, null, 2));
console.log('Real names backed up to data/demo-backup.json');

const realPerson1 = members.find((m) => m.member_key === 'person1')?.name ?? 'Person 1';
const realPerson2 = members.find((m) => m.member_key === 'person2')?.name ?? 'Person 2';

// --- Per-year fixture generator -------------------------------------------

let fixturesWritten = 0;

async function buildFixtures(targetYear) {
  console.log(`\nFetching year=${targetYear} data from ${BASE_URL}...`);

  let monarchData, budgetsData;
  try {
    const [mRes, bRes] = await Promise.all([
      fetch(`${BASE_URL}/api/monarch?year=${targetYear}`),
      fetch(`${BASE_URL}/api/budgets?year=${targetYear}`),
    ]);
    if (!mRes.ok) throw new Error(`/api/monarch → ${mRes.status} ${await mRes.text()}`);
    if (!bRes.ok) throw new Error(`/api/budgets → ${bRes.status} ${await bRes.text()}`);
    monarchData = await mRes.json();
    budgetsData = await bRes.json();
  } catch (err) {
    console.warn(`  Skipping year=${targetYear}: ${err.message}`);
    return;
  }

  // --- Scale /api/monarch response ----------------------------------------

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
    fakeMonarch.buckets[bucket].ytdTotal = cats.reduce((s, c) => s + c.ytdTotal, 0);
    fakeMonarch.buckets[bucket].annualForecast = cats.reduce((s, c) => s + c.annualForecast, 0);

    // Budget is scaled once below (in fakeBudgets) and copied in — not scaled here.
  }

  // --- Scale /api/budgets response ----------------------------------------
  // Budgets are scaled here first, then the same values are copied into the
  // monarch fixture so both screens always show identical budget numbers.

  const fakeBudgets = JSON.parse(JSON.stringify(budgetsData));

  for (const b of fakeBudgets.buckets ?? []) {
    b.amount = roundBudget(b.amount * GLOBAL_SCALE * jitter(0.07));
  }

  for (const s of fakeBudgets.subcategories ?? []) {
    s.amount = roundBudget(s.amount * GLOBAL_SCALE * jitter(0.10));
  }

  // Copy scaled bucket budgets into monarch fixture
  const scaledBucketBudget = Object.fromEntries(
    (fakeBudgets.buckets ?? []).map((b) => [b.bucket, b.amount])
  );
  for (const bucket of ['fixed', 'discretionary']) {
    if (fakeMonarch.buckets[bucket].budget !== null && scaledBucketBudget[bucket] !== undefined) {
      fakeMonarch.buckets[bucket].budget = scaledBucketBudget[bucket];
    }
  }

  // Recompute fixedSubcategoryBreakdown forecasts by summing the already-scaled
  // category forecasts — same logic as the real route, so totals always match.
  const scaledSubcatBudget = Object.fromEntries(
    (fakeBudgets.subcategories ?? []).map((s) => [s.subcategory, s.amount])
  );
  const forecastBySubcat = {};
  let unallocatedForecast = 0;
  for (const cat of fakeMonarch.buckets.fixed.categories) {
    const subcat = cat.config?.maxifi_subcategory;
    if (subcat) {
      forecastBySubcat[subcat] = (forecastBySubcat[subcat] ?? 0) + cat.annualForecast;
    } else {
      unallocatedForecast += cat.annualForecast;
    }
  }
  for (const item of fakeMonarch.fixedSubcategoryBreakdown ?? []) {
    if (item.key === 'unallocated') {
      item.forecast = unallocatedForecast;
    } else {
      item.forecast = forecastBySubcat[item.key] ?? 0;
    }
    if (item.budget !== null && scaledSubcatBudget[item.key] !== undefined) {
      item.budget = scaledSubcatBudget[item.key];
    }
    // Replace real names in labels (e.g. "Jane's Retirement" → "David's Retirement")
    item.label = item.label.replace(new RegExp(`\\b${realPerson1}\\b`, 'g'), FAKE_PERSON1)
                            .replace(new RegExp(`\\b${realPerson2}\\b`, 'g'), FAKE_PERSON2);
  }

  // Replace special expense names and scale amounts
  let nameIdx = 0;
  for (const se of fakeBudgets.specialExpenses ?? []) {
    se.name = GENERIC_EXPENSE_NAMES[nameIdx % GENERIC_EXPENSE_NAMES.length];
    nameIdx++;
    se.amount = roundBudget(se.amount * GLOBAL_SCALE * jitter(0.12));
  }

  // --- Write fixtures -------------------------------------------------------

  const monarchFixture = path.join(ROOT, 'data', `demo-monarch-${targetYear}.json`);
  const budgetsFixture = path.join(ROOT, 'data', `demo-budgets-${targetYear}.json`);

  fs.writeFileSync(monarchFixture, JSON.stringify(fakeMonarch, null, 2));
  console.log(`  Monarch fixture → data/demo-monarch-${targetYear}.json`);

  fs.writeFileSync(budgetsFixture, JSON.stringify(fakeBudgets, null, 2));
  console.log(`  Budgets fixture → data/demo-budgets-${targetYear}.json`);

  fixturesWritten++;
}

// --- Generate fixtures for current year and prior year --------------------

await buildFixtures(year);
await buildFixtures(priorYear);

if (fixturesWritten === 0) {
  fs.unlinkSync(BACKUP_PATH);
  console.error('\n✗ No fixtures written — demo mode not activated. Backup removed.\n');
  process.exit(1);
}

// --- Update names in SQLite -----------------------------------------------

const now = new Date().toISOString();
db.prepare("UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = 'person1'").run(FAKE_PERSON1, now);
db.prepare("UPDATE household_members SET name = ?, updated_at = ? WHERE member_key = 'person2'").run(FAKE_PERSON2, now);

console.log(`\n✓ Demo mode active for ${year} and ${priorYear}`);
console.log(`  ${realPerson1}  →  ${FAKE_PERSON1}`);
console.log(`  ${realPerson2}  →  ${FAKE_PERSON2}`);
console.log(`  All amounts scaled by ~${Math.round(GLOBAL_SCALE * 100)}% with per-item variation`);
console.log(`\nTake your screenshots, then restore with:\n  npm run demo:off\n`);
