import Database from 'better-sqlite3';
import path from 'path';
import type { ForecastModel, Bucket, MaxiFiSubcategory } from './categories';

const DB_PATH = path.join(process.cwd(), 'data', 'monarch-maxifi.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_client (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      client_id TEXT NOT NULL,
      registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_state (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_config (
      category_id TEXT PRIMARY KEY,
      category_name TEXT NOT NULL,
      bucket TEXT CHECK(bucket IN ('fixed', 'discretionary', 'excluded')),
      maxifi_subcategory TEXT,
      maxifi_group TEXT,
      forecast_model TEXT NOT NULL DEFAULT 'run_rate',
      forecast_override_amount REAL,
      forecast_exclude_amount REAL,
      forecast_add_amount REAL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maxifi_budgets (
      year INTEGER NOT NULL,
      bucket TEXT NOT NULL CHECK(bucket IN ('fixed', 'discretionary')),
      amount REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (year, bucket)
    );

    CREATE TABLE IF NOT EXISTS maxifi_fixed_subcategories (
      year INTEGER NOT NULL,
      subcategory TEXT NOT NULL,
      amount REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (year, subcategory)
    );

    CREATE TABLE IF NOT EXISTS maxifi_special_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS report_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS household_members (
      member_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Add actual_amount for manually-tracked contributions (HSA, retirement) that
  // Monarch's expense feed can't see. Guarded ALTER so existing DBs pick it up.
  const subcatCols = db.prepare(`PRAGMA table_info(maxifi_fixed_subcategories)`).all() as Array<{ name: string }>;
  if (!subcatCols.some((c) => c.name === 'actual_amount')) {
    db.exec(`ALTER TABLE maxifi_fixed_subcategories ADD COLUMN actual_amount REAL`);
  }

  // Seed household members (INSERT OR IGNORE — won't overwrite existing names)
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO household_members (member_key, name, updated_at) VALUES ('person1', 'Person 1', ?)`).run(now);
  db.prepare(`INSERT OR IGNORE INTO household_members (member_key, name, updated_at) VALUES ('person2', 'Person 2', ?)`).run(now);
}

// ── Category config ──────────────────────────────────────────────────────────

export interface CategoryConfigRow {
  category_id: string;
  category_name: string;
  bucket: Bucket | null;
  maxifi_subcategory: MaxiFiSubcategory | null;
  maxifi_group: string | null;
  forecast_model: ForecastModel;
  forecast_override_amount: number | null;
  forecast_exclude_amount: number | null;
  forecast_add_amount: number | null;
  updated_at: string;
}

export function getAllCategoryConfigs(): CategoryConfigRow[] {
  return getDb()
    .prepare('SELECT * FROM category_config ORDER BY category_name')
    .all() as CategoryConfigRow[];
}

export function getCategoryConfig(categoryId: string): CategoryConfigRow | undefined {
  return getDb()
    .prepare('SELECT * FROM category_config WHERE category_id = ?')
    .get(categoryId) as CategoryConfigRow | undefined;
}

export function deleteCategoryConfig(categoryId: string): void {
  getDb().prepare('DELETE FROM category_config WHERE category_id = ?').run(categoryId);
}

export function upsertCategoryConfig(config: CategoryConfigRow): void {
  getDb()
    .prepare(`
      INSERT INTO category_config (
        category_id, category_name, bucket, maxifi_subcategory, maxifi_group,
        forecast_model, forecast_override_amount, forecast_exclude_amount,
        forecast_add_amount, updated_at
      ) VALUES (
        @category_id, @category_name, @bucket, @maxifi_subcategory, @maxifi_group,
        @forecast_model, @forecast_override_amount, @forecast_exclude_amount,
        @forecast_add_amount, @updated_at
      )
      ON CONFLICT(category_id) DO UPDATE SET
        category_name = excluded.category_name,
        bucket = excluded.bucket,
        maxifi_subcategory = excluded.maxifi_subcategory,
        maxifi_group = excluded.maxifi_group,
        forecast_model = excluded.forecast_model,
        forecast_override_amount = excluded.forecast_override_amount,
        forecast_exclude_amount = excluded.forecast_exclude_amount,
        forecast_add_amount = excluded.forecast_add_amount,
        updated_at = excluded.updated_at
    `)
    .run(config);
}

// ── MaxiFi budgets ───────────────────────────────────────────────────────────

export interface MaxiFiBudgetRow {
  year: number;
  bucket: 'fixed' | 'discretionary';
  amount: number;
  updated_at: string;
}

export function getMaxiFiBudgets(year: number): MaxiFiBudgetRow[] {
  return getDb()
    .prepare('SELECT * FROM maxifi_budgets WHERE year = ?')
    .all(year) as MaxiFiBudgetRow[];
}

export function upsertMaxiFiBudget(row: MaxiFiBudgetRow): void {
  getDb()
    .prepare(`
      INSERT INTO maxifi_budgets (year, bucket, amount, updated_at)
      VALUES (@year, @bucket, @amount, @updated_at)
      ON CONFLICT(year, bucket) DO UPDATE SET
        amount = excluded.amount,
        updated_at = excluded.updated_at
    `)
    .run(row);
}

// ── MaxiFi fixed subcategories ───────────────────────────────────────────────

export interface MaxiFiSubcategoryRow {
  year: number;
  subcategory: string;
  amount: number;
  actual_amount: number | null; // manually-entered contribution actual (HSA, retirement); null = tracked via Monarch
  updated_at: string;
}

export function getMaxiFiSubcategories(year: number): MaxiFiSubcategoryRow[] {
  return getDb()
    .prepare('SELECT * FROM maxifi_fixed_subcategories WHERE year = ?')
    .all(year) as MaxiFiSubcategoryRow[];
}

export function upsertMaxiFiSubcategory(row: MaxiFiSubcategoryRow): void {
  getDb()
    .prepare(`
      INSERT INTO maxifi_fixed_subcategories (year, subcategory, amount, actual_amount, updated_at)
      VALUES (@year, @subcategory, @amount, @actual_amount, @updated_at)
      ON CONFLICT(year, subcategory) DO UPDATE SET
        amount = excluded.amount,
        actual_amount = excluded.actual_amount,
        updated_at = excluded.updated_at
    `)
    .run({ ...row, actual_amount: row.actual_amount ?? null });
}

// ── MaxiFi special expenses ──────────────────────────────────────────────────

export interface MaxiFiSpecialExpenseRow {
  id?: number;
  year: number;
  name: string;
  amount: number;
  updated_at: string;
}

export function getSpecialExpenses(year?: number): MaxiFiSpecialExpenseRow[] {
  if (year !== undefined) {
    return getDb()
      .prepare('SELECT * FROM maxifi_special_expenses WHERE year = ? ORDER BY year, name')
      .all(year) as MaxiFiSpecialExpenseRow[];
  }
  return getDb()
    .prepare('SELECT * FROM maxifi_special_expenses ORDER BY year, name')
    .all() as MaxiFiSpecialExpenseRow[];
}

export function upsertSpecialExpense(row: MaxiFiSpecialExpenseRow): number {
  if (row.id) {
    getDb()
      .prepare(`
        UPDATE maxifi_special_expenses
        SET year = @year, name = @name, amount = @amount, updated_at = @updated_at
        WHERE id = @id
      `)
      .run(row);
    return row.id;
  }
  const result = getDb()
    .prepare(`
      INSERT INTO maxifi_special_expenses (year, name, amount, updated_at)
      VALUES (@year, @name, @amount, @updated_at)
    `)
    .run(row);
  return result.lastInsertRowid as number;
}

export function deleteSpecialExpense(id: number): void {
  getDb().prepare('DELETE FROM maxifi_special_expenses WHERE id = ?').run(id);
}

// ── Household members ────────────────────────────────────────────────────────

export interface HouseholdMemberRow {
  member_key: string;
  name: string;
  updated_at: string;
}

export function getHouseholdMembers(): HouseholdMemberRow[] {
  return getDb()
    .prepare('SELECT * FROM household_members ORDER BY member_key')
    .all() as HouseholdMemberRow[];
}

export function upsertHouseholdMember(row: HouseholdMemberRow): void {
  getDb()
    .prepare(`
      INSERT INTO household_members (member_key, name, updated_at)
      VALUES (@member_key, @name, @updated_at)
      ON CONFLICT(member_key) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `)
    .run(row);
}

// ── OAuth client ──────────────────────────────────────────────────────────────

export interface OAuthClientRow {
  client_id: string;
  registered_at: string;
}

export function getOAuthClient(): OAuthClientRow | undefined {
  return getDb()
    .prepare('SELECT client_id, registered_at FROM oauth_client WHERE id = 1')
    .get() as OAuthClientRow | undefined;
}

export function saveOAuthClient(clientId: string): void {
  getDb()
    .prepare(`
      INSERT INTO oauth_client (id, client_id, registered_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, registered_at = excluded.registered_at
    `)
    .run(clientId, new Date().toISOString());
}

// ── OAuth tokens ──────────────────────────────────────────────────────────────

export interface OAuthTokensRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  updated_at: string;
}

export function getOAuthTokens(): OAuthTokensRow | undefined {
  return getDb()
    .prepare('SELECT access_token, refresh_token, expires_at, updated_at FROM oauth_tokens WHERE id = 1')
    .get() as OAuthTokensRow | undefined;
}

export function saveOAuthTokens(accessToken: string, refreshToken: string | null, expiresAt: string): void {
  getDb()
    .prepare(`
      INSERT INTO oauth_tokens (id, access_token, refresh_token, expires_at, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `)
    .run(accessToken, refreshToken, expiresAt, new Date().toISOString());
}

export function clearOAuthTokens(): void {
  getDb().prepare('DELETE FROM oauth_tokens WHERE id = 1').run();
}

// ── OAuth state (PKCE code verifier ↔ state binding) ─────────────────────────

export function saveOAuthState(state: string, codeVerifier: string): void {
  const db = getDb();
  // Prune stale state entries older than 15 minutes
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM oauth_state WHERE created_at < ?').run(cutoff);
  db.prepare('INSERT OR REPLACE INTO oauth_state (state, code_verifier, created_at) VALUES (?, ?, ?)').run(
    state,
    codeVerifier,
    new Date().toISOString(),
  );
}

export function getAndDeleteOAuthState(state: string): { code_verifier: string } | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT code_verifier FROM oauth_state WHERE state = ?')
    .get(state) as { code_verifier: string } | undefined;
  if (row) db.prepare('DELETE FROM oauth_state WHERE state = ?').run(state);
  return row;
}

// ── Report cache ─────────────────────────────────────────────────────────────

export function getCacheEntry(key: string): { data: string; fetched_at: string } | undefined {
  return getDb()
    .prepare('SELECT data, fetched_at FROM report_cache WHERE cache_key = ?')
    .get(key) as { data: string; fetched_at: string } | undefined;
}

export function setCacheEntry(key: string, data: string): void {
  getDb()
    .prepare(`
      INSERT INTO report_cache (cache_key, data, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at
    `)
    .run(key, data, new Date().toISOString());
}
