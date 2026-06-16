# monarch-maxifi

## Project Overview

A local web app that bridges Monarch Money and MaxiFi Planner. It pulls YTD expense data from Monarch via MCP, applies forecasting models to project full-year totals, and compares those forecasts against MaxiFi's annual budget targets — segmented into Fixed and Discretionary spending buckets.

The primary use case is answering: "Am I on track with my MaxiFi plan this year?"

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** SQLite via `better-sqlite3` (local only — settings persistence)
- **Data source:** Monarch Money official MCP (`https://api.monarch.com/mcp`)

**Cost principles:** This app runs entirely on the user's local machine. There are no hosting costs. Do not introduce paid external services (cloud databases, hosted APIs, third-party analytics, etc.) without flagging the cost to the user first. If an AI model is ever needed at runtime, use `claude-haiku-4-5` — it is the most cost-efficient Anthropic model. For v1, all forecasting logic is deterministic math; no AI model calls are needed at runtime.

---

## Monarch MCP Integration

### Connection

The app connects to Monarch's official MCP server. Authentication is handled via OAuth — no credentials are stored in the app.

**Server URL:** `https://api.monarch.com/mcp`

The MCP must be enabled in the user's Monarch account at: `https://app.monarch.com/settings/integrations`

### Key tools (from spike findings)

| Tool | Purpose |
|------|---------|
| `GetCategories` | Full category/group hierarchy with metadata. Call once at startup; cache. |
| `GetCashFlow` | Pre-aggregated expense totals by category for a date range. Primary data source. |
| `GetTransactions` | Transaction-level detail for a specific category and date range. |

### YTD expense totals call

```
GetCashFlow(
  start_date="<Jan 1 current year>",
  end_date="<today>",
  base_query={"group_by_entity": "category"},
  filters={"category_type": "expense"}
)
```

Always include `filters: {"category_type": "expense"}` — this cleanly excludes transfers (Transfer, Credit Card Payment, Balance Adjustments) without enumerating category IDs.

### Prior year call

Same parameters with `start_date="<Jan 1 prior year>"` and `end_date="<Dec 31 prior year>"`. Data shape is identical.

### Important data notes (from spike)

- `GetCashFlow` returns **pre-aggregated totals** — one row per category, summed over the date range. Amounts are negative floats for expenses.
- Categories with **zero spend** in the period are absent from `GetCashFlow` results. Merge with `GetCategories` to get the full list.
- The `categories` filter in `GetTransactions` accepts **category names** (strings), not IDs.
- `hide_from_reports: true` transactions are automatically excluded by `GetCashFlow` and `GetBudget` — do not re-implement this filter manually.
- Inflows and outflows within the same category are **netted** (e.g. Home Improvement refunds offset charges automatically).
- `GetSpendingByCategory` returns only the top 5 categories — do not use for full breakdown.

---

## Category Configuration

### Fixed / Discretionary mapping

Categories are pre-mapped as follows. This mapping is user-editable in Settings.

**Fixed categories** (non-negotiable expenses; amounts may vary):
- Mortgage
- Home Improvement
- Homeowner's Insurance
- Property Taxes
- Medical
- Taxes
- Gas & Electric
- Internet & Cable
- HOA Dues
- Home Alarm Service
- Phone

**Discretionary categories** (all remaining expense categories):
- Groceries
- Pets
- Restaurants & Bars
- Financial & Legal Services
- Electronics
- Vices
- Travel & Vacation
- Auto Maintenance
- Entertainment & Recreation
- Supplements
- Personal
- Shopping
- Clothing
- Advertising & Promotion
- Gifts
- Parking & Tolls
- Business Utilities & Communication
- Gas
- Taxi & Ride Shares
- Public Transit
- Cash & ATM
- Postage & Shipping
- Business License
- Education
- Furniture & Housewares
- Charity
- Coffee Shops
- Financial Fees
- Software Services
- Insurance (Financial group — covers non-homeowner's policies e.g. life, auto)
- Auto Insurance

**Excluded from both buckets:**
- All Transfer categories (Transfer, Credit Card Payment, Balance Adjustments) — filtered at the MCP level
- `Uncategorized` / `uncategorized` — surfaced to the user as needing attention, not included in totals

**Unrecognized categories** (categories returned by Monarch that aren't in the above lists) should be surfaced in Settings as "Needs assignment" rather than silently dropped.

---

## Forecasting Models

Each category is assigned a forecasting model. The model determines how the full-year total is projected from YTD actuals. Models are user-configurable per category in Settings.

### Model definitions

**Run Rate** (default for most categories)
```
annual_forecast = (ytd_total / days_elapsed) * 365
```
Best for: Groceries, Restaurants & Bars, Pets, Personal, and other categories with continuous spend.

**Known Monthly** (default for consistent fixed bills)
```
annual_forecast = monthly_amount * 12
```
Where `monthly_amount` is auto-detected from the trailing 3-month average if the category shows low variance month-to-month. User can override. Best for: Mortgage, Phone, Internet & Cable, Gas & Electric, HOA Dues, Home Alarm Service.

**Known Annual** (default for lump-sum / non-monthly categories)
```
annual_forecast = user_entered_amount
```
Best for: Property Taxes, Homeowner's Insurance, Taxes. User enters the expected full-year amount.

**Adjusted Run Rate**
```
annual_forecast = ((ytd_total - excluded_amount + added_amount) / days_elapsed) * 365
```
Allows the user to exclude a specific large transaction or add a known future expense before extrapolating. Best for: Home Improvement (large one-time projects), Medical (unusual one-time costs).

**One-Time / Complete**
```
annual_forecast = ytd_total
```
The category is considered done for the year. No further spend expected. User-assigned.

**No Further Spend**
```
annual_forecast = ytd_total
```
Alias for One-Time / Complete. Shown differently in UI to clarify intent.

### Auto-detection logic

On first load (before user has configured anything), use `budget_variability` from `GetCategories` as the starting point:
- `"fixed"` → attempt to detect Known Monthly (check trailing 3-month variance; if CV < 0.05, use Known Monthly; otherwise fall back to Run Rate)
- `"flexible"` → Run Rate
- `"non_monthly"` → Known Annual (prompt user to enter amount)
- `null` → Run Rate

Flag categories for user review when:
- A single transaction exceeds 50% of the YTD total (likely distorting run rate)
- Month-over-month change exceeds 20% in the most recent month
- Category has zero YTD spend (cannot compute run rate)

---

## MaxiFi Budget Integration

MaxiFi budgets are entered manually by the user. They are annual figures (not monthly). Store in SQLite.

### MaxiFi Fixed subcategories

MaxiFi breaks Fixed spending into the following subcategories (visible in the MaxiFi spending table):

| MaxiFi Subcategory | Description |
|---|---|
| Housing | Mortgage, home maintenance, utilities, HOA, insurance — all housing-related costs |
| Medicare Part B Premium | Calculated by MaxiFi; not a Monarch category |
| Life Premium | Life insurance premiums |
| Person 1's Retirement Contributions | 401k, IRA contributions |
| Person 2's Retirement Contributions | 401k, IRA contributions |
| Taxes | Federal and state income taxes |
| Other Expenses | 529 contributions, HSA contributions, Special Expenses, reserve fund, bequests, QCDs, funeral expenses |

The schema captures both the top-level bucket totals and Fixed subcategory totals to enable future subcategory-level comparison.

### MaxiFi Utilities grouping

Within MaxiFi's Housing subcategory, the following Monarch categories are grouped as "Utilities":
- Gas & Electric
- Internet & Cable
- Phone
- Home Alarm Service
- Garbage
- Water

The `category_config` table includes a `maxifi_subcategory` and `maxifi_group` field to capture these groupings.

### Special Expenses

MaxiFi allows users to define Special Expenses — large planned one-time or recurring expenses for specific year ranges (e.g. medical premiums, out-of-pocket medical costs, new car). These fall under MaxiFi's "Other Expenses" Fixed subcategory.

Special Expenses are entered in the app as named line items with a year, amount, and description. They are summed into the Other Expenses subcategory total for budget comparison purposes.

For years where Special Expenses are active (e.g. 2027 onward for medical premiums), the budget input screen should surface these so the user can verify the amounts match their MaxiFi plan.

---

## Data Model (SQLite)

```sql
-- Category configuration (user-editable)
CREATE TABLE category_config (
  category_id TEXT PRIMARY KEY,       -- Monarch category ID
  category_name TEXT NOT NULL,
  bucket TEXT CHECK(bucket IN ('fixed', 'discretionary', 'excluded')),
  maxifi_subcategory TEXT,            -- MaxiFi Fixed subcategory (e.g. 'housing', 'other_expenses')
  maxifi_group TEXT,                  -- Sub-grouping within subcategory (e.g. 'utilities', 'maintenance')
  forecast_model TEXT NOT NULL DEFAULT 'run_rate',
  forecast_override_amount REAL,      -- for known_annual and known_monthly overrides
  forecast_exclude_amount REAL,       -- for adjusted_run_rate: amount to exclude
  forecast_add_amount REAL,           -- for adjusted_run_rate: amount to add
  updated_at TEXT NOT NULL
);

-- MaxiFi annual budgets — top-level bucket totals
CREATE TABLE maxifi_budgets (
  year INTEGER NOT NULL,
  bucket TEXT NOT NULL CHECK(bucket IN ('fixed', 'discretionary')),
  amount REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (year, bucket)
);

-- MaxiFi Fixed subcategory budgets
CREATE TABLE maxifi_fixed_subcategories (
  year INTEGER NOT NULL,
  subcategory TEXT NOT NULL,  -- 'housing' | 'medicare_part_b' | 'life_premium' |
                               -- 'person1_retirement' | 'person2_retirement' | 'taxes' | 'other_expenses'
  amount REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (year, subcategory)
);

-- MaxiFi Special Expenses (named line items under Other Expenses)
CREATE TABLE maxifi_special_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,         -- e.g. "Medical Out of Pocket Costs"
  amount REAL NOT NULL,
  updated_at TEXT NOT NULL
);

-- Report cache (optional: cache last fetch to avoid re-fetching on every load)
CREATE TABLE report_cache (
  cache_key TEXT PRIMARY KEY,
  data TEXT NOT NULL,  -- JSON
  fetched_at TEXT NOT NULL
);
```

---

## App Structure

```
monarch-maxifi/
├── app/
│   ├── page.tsx              # Report view (default)
│   ├── settings/
│   │   └── page.tsx          # Settings view
│   └── api/
│       ├── monarch/
│       │   └── route.ts      # Fetches data from Monarch MCP
│       ├── config/
│       │   └── route.ts      # CRUD for category_config
│       └── budgets/
│           └── route.ts      # CRUD for maxifi_budgets
├── lib/
│   ├── db.ts                 # SQLite connection and queries
│   ├── monarch.ts            # Monarch MCP client calls
│   ├── forecast.ts           # Forecasting model logic
│   └── categories.ts         # Default category map and bucket assignments
├── components/
│   ├── ReportView.tsx        # Main report UI
│   ├── BucketSummary.tsx     # Fixed / Discretionary top-level cards
│   ├── CategoryTable.tsx     # Expandable category rows
│   └── SettingsForm.tsx      # Category and budget configuration
└── CLAUDE.md
```

---

## Report View

### Layout

The report shows the current year by default, with a date range selector. On load, it fetches fresh data from Monarch — no stale cache.

### Top-level view

Two summary cards side by side:

| | Fixed | Discretionary |
|---|---|---|
| YTD Actual | $X | $X |
| Forecasted Annual | $X | $X |
| MaxiFi Budget | $X | $X |
| Variance | +/- $X | +/- $X |

Variance = Forecasted Annual − MaxiFi Budget. Positive = over budget (red). Negative = under budget (green).

Both buckets show variance — Fixed variance is informational (you can't easily change it, but it may require updating your MaxiFi plan), Discretionary variance is actionable.

### Expanded view

Each bucket is expandable to show its constituent Monarch categories:

| Category | YTD Actual | Forecast Model | Forecasted Annual |
|----------|-----------|----------------|------------------|
| Mortgage | $X,XXX | Known Monthly | $XX,XXX |
| Home Improvement | $X,XXX | Adjusted Run Rate | $XX,XXX |
| ... | | | |

Categories flagged for review show a warning icon.

### Flags and alerts

- ⚠️ Category has no YTD spend — forecast may be incomplete
- ⚠️ Single transaction dominates YTD total — consider Adjusted Run Rate
- ⚠️ Category not assigned to a bucket — go to Settings
- ⚠️ MaxiFi budget not set for this year

---

## Settings View

A single unified table of all Monarch expense categories (from `GetCategories`). Each row shows:

- Category name and Monarch group
- Bucket assignment (Fixed / Discretionary / Excluded) — dropdown
- Forecast model — dropdown
- Override amount field (shown only when model requires it)

At the top of Settings: MaxiFi annual budget inputs organized as:
- Discretionary total (current year and next year)
- Fixed subcategory totals: Housing, Medicare Part B, Life Premium, Person 1's Retirement, Person 2's Retirement, Taxes, Other Expenses (current year and next year)
- Special Expenses: named line items under Other Expenses, with year and amount (supports multi-year entries for planned future costs)

The category table also shows a MaxiFi Subcategory column for Fixed categories, allowing the user to assign each Monarch category to the correct MaxiFi Fixed subcategory (e.g. Housing / Utilities, Housing / Maintenance).

---

## Development Notes

- Run locally only: `npm run dev` → `http://localhost:3000`
- SQLite file lives at `./data/monarch-maxifi.db` (gitignored)
- Monarch MCP auth is handled at the Claude Code level via the MCP config — the app does not manage OAuth tokens directly
- Do not commit any financial data, SQLite files, or `.env` files
- All Monarch calls are server-side (Next.js API routes) — never expose MCP credentials to the browser

---

## Known Data Quirks (from Spike)

- `GetTransactions` category filter uses **names, not IDs** — always pass the string name
- Two duplicate `uncategorized` categories exist in the Other group — treat both as excluded
- Rollover budget categories (Auto Maintenance, Home Improvement, Property Taxes, HOA Dues) have cumulative `budget_amount` values in `GetBudget` — do not use for monthly targets
- `GetCashFlow` omits zero-spend categories — always merge with `GetCategories` for the full list
- `Insurance` (Financial group) is distinct from `Homeowner's Insurance` (Housing group) — do not conflate. Insurance (Financial) is Discretionary; Homeowner's Insurance is Fixed.
