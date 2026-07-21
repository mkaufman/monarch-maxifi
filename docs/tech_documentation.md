# monarch-maxifi — Technical Documentation

## Overview

monarch-maxifi is a local-only web application that bridges two financial planning tools: **Monarch Money** (day-to-day transaction tracking) and **MaxiFi Planner** (long-term retirement financial modeling). It answers one operational question: *"Am I on track with my MaxiFi plan this year?"*

The app pulls year-to-date spending actuals from Monarch, applies forecasting models to project full-year totals, and compares those projections against the user's MaxiFi annual budget targets — broken down by Fixed and Discretionary spending buckets.

---

## Architecture

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | SQLite via `better-sqlite3` |
| Data source | Monarch Money MCP (Model Context Protocol) |
| Runtime | Node.js 20+ (local only) |

### Design Principles

- **Local-only.** The app runs entirely on the user's machine. No cloud hosting, no external database, no telemetry. All data stays on the user's computer.
- **No credentials stored in the app.** Monarch authentication is handled via OAuth 2.1 PKCE — the app never sees the user's Monarch password. Short-lived access tokens are stored in the local SQLite database and refreshed automatically.
- **No MaxiFi API.** MaxiFi does not expose a public API. Budget targets are entered manually by the user and stored in SQLite.
- **Server-side data fetching.** All Monarch API calls happen in Next.js API routes (server-side). No financial data is ever sent to the browser beyond what is needed to render the current view.

---

## Data Flow

```
User's Browser
     │
     │  HTTP (localhost)
     ▼
Next.js API Routes  ──────────────────────────────────────────────────────┐
     │                                                                     │
     │  OAuth 2.1 PKCE                                                     │
     ▼                                                                     │
Monarch OAuth Server                                                       │
(api.monarch.com/oauth/...)                                                │
     │                                                                     │
     │  access_token                                                       │
     ▼                                                                     │
Monarch MCP Server                 SQLite DB (local)                      │
(api.monarch.com/mcp)              ├── oauth_tokens                       │
     │                             ├── category_config                    │
     │  GetCategories              ├── maxifi_budgets                     │
     │  GetCashFlow (YTD)          ├── maxifi_fixed_subcategories         │
     │  GetCashFlow (prior year)   ├── maxifi_special_expenses            │
     ▼                             └── household_members                  │
  Raw category                           │                                │
  + spending data                        │ budget targets                 │
        │                                │ forecast config                │
        └──────────────┬─────────────────┘                                │
                       ▼                                                  │
              Forecasting Engine                                           │
              (lib/forecast.ts)                                            │
                       │                                                  │
                       │  JSON response                                   │
                       └──────────────────────────────────────────────────┘
                                         │
                                         ▼
                                   React UI (browser)
```

---

## Monarch Integration

### Authentication — OAuth 2.1 PKCE

Monarch supports open dynamic client registration (RFC 7591), meaning the app self-registers on first run with no pre-issued credentials. The flow:

1. **Registration** — `POST https://api.monarch.com/oauth/register` — returns a `client_id` which is stored in SQLite.
2. **Authorization** — The user is redirected to `app.monarch.com/login?route=/oauth/consent`. A `code_verifier` / `code_challenge` pair (PKCE) is generated and the state is temporarily stored in SQLite.
3. **Token exchange** — The authorization code is exchanged for an access token and refresh token at `https://api.monarch.com/oauth/token/`. Tokens are stored in SQLite.
4. **Silent refresh** — Before each Monarch API call, `lib/auth.ts` checks whether the access token expires within 5 minutes. If so, it refreshes automatically using the stored refresh token. The user never needs to reconnect between sessions.

Scopes requested: `mcp:read`, `mcp:write`.

### Data Fetching — MCP (Model Context Protocol)

Monarch exposes data via an MCP server at `https://api.monarch.com/mcp`. Despite the AI connotations of "MCP," no AI model is involved — MCP is simply a standardized transport protocol for exposing tools and data, and Monarch has chosen to implement their API using it. The app uses the `@modelcontextprotocol/sdk` client library to make calls exactly as it would with a conventional REST API, and receives plain JSON in return. The app calls three tools per report load:

| Tool | Purpose |
|---|---|
| `GetCategories` | Retrieves the full category/group hierarchy with metadata (`budget_variability`, `is_disabled`, etc.) |
| `GetCashFlow` (YTD) | Returns pre-aggregated expense totals by category from Jan 1 to today |
| `GetCashFlow` (prior year) | Same aggregation for the full prior calendar year — used as a fallback for forecasting |

All three calls are batched over a single MCP connection to minimize latency.

**Key implementation notes:**
- The `base_query` and `filters` parameters in `GetCashFlow` must be serialized JSON strings, not objects.
- `filters: {"category_type": "expense"}` is always applied to exclude transfers (Credit Card Payment, Balance Adjustments, etc.) cleanly without enumerating category IDs.
- Categories with zero spend in the period are absent from `GetCashFlow` results. The app merges with `GetCategories` to ensure all configured categories appear in the report.

---

## Forecasting Engine

`lib/forecast.ts` implements five models. The user configures a model per category in Settings; defaults are auto-assigned based on each category's `budget_variability` metadata from Monarch.

| Model | Formula | Default for |
|---|---|---|
| **Run Rate** | `(ytd ÷ days_elapsed) × 365` | Most variable expense categories |
| **Known Monthly** | `monthly_amount × 12` | Fixed recurring bills (mortgage, phone, utilities) |
| **Known Annual** | `user_entered_amount` | Lump-sum annual expenses (property taxes, insurance) |
| **Adjusted Run Rate** | `((ytd − exclude + add) ÷ days_elapsed) × 365` | Categories with a large one-time transaction skewing the run rate |
| **No Further Spend** | `ytd` (no extrapolation) | Categories where all spending is complete for the year |

**Prior-year fallback:** For Run Rate and Adjusted Run Rate, if fewer than 60 days have elapsed and the category has zero YTD spend, the prior year's full-year actual is used as the forecast instead of extrapolating from zero. This prevents misleading zero-forecasts early in the year.

---

## Data Model (SQLite)

All user configuration and budget data is stored in a local SQLite database at `./data/monarch-maxifi.db` (gitignored). The schema is created and migrated automatically on first run.

### Tables

**`oauth_client`** — Stores the dynamically registered OAuth `client_id`. One row max.

**`oauth_tokens`** — Stores the current access token, refresh token, and expiry. One row max. Cleared on disconnect.

**`oauth_state`** — Temporary storage for PKCE `code_verifier` during the OAuth redirect flow. Entries older than 15 minutes are pruned automatically.

**`category_config`** — One row per Monarch expense category. Stores:
- `bucket`: Fixed, Discretionary, or Excluded
- `forecast_model`: which of the five models to apply
- `maxifi_subcategory`: which MaxiFi Fixed subcategory this maps to (e.g. housing, taxes, person1_retirement)
- Override/exclude/add amounts for the Adjusted Run Rate model
- Auto-synced with Monarch on each report load: new categories are added with defaults, deleted categories are removed.

**`maxifi_budgets`** — Annual bucket-level budget targets (Fixed total, Discretionary total) entered by the user from their MaxiFi plan.

**`maxifi_fixed_subcategories`** — Annual budget amounts per Fixed subcategory (Housing, Medicare Part B, Life Premium, Person 1's Retirement, Person 2's Retirement, Taxes, HSA Contributions).

**`maxifi_special_expenses`** — Named one-time planned expenses per year (e.g. a planned car purchase or home project from the user's MaxiFi plan).

**`household_members`** — First names of the two household members, used to personalize subcategory labels (e.g. "Jane's Retirement Contributions").

**`report_cache`** — Available for caching Monarch API responses; currently unused (all loads are live fetches).

---

## API Routes

All routes are Next.js App Router route handlers with `force-dynamic` to prevent caching.

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/authorize` | GET | Initiates OAuth flow — generates PKCE pair, redirects to Monarch login |
| `/api/auth/callback` | GET | Handles Monarch redirect — exchanges code for tokens, stores in DB |
| `/api/auth/status` | GET | Returns `{ connected: boolean }` — used by the UI to gate the report view |
| `/api/auth/disconnect` | POST | Clears stored tokens from DB |
| `/api/monarch` | GET | Main data endpoint — fetches from Monarch, runs forecasts, returns full report JSON |
| `/api/budgets` | GET / PUT | CRUD for MaxiFi budget targets and special expenses |
| `/api/config` | GET / PUT | CRUD for category configuration (bucket, forecast model, subcategory mapping) |
| `/api/members` | GET / PUT | CRUD for household member names |

### Demo Mode

The `/api/monarch` and `/api/budgets` routes check for year-specific fixture files (`data/demo-monarch-{year}.json`, `data/demo-budgets-{year}.json`) at the top of each request. If found, the fixture is returned immediately instead of fetching live data. This enables screenshot-safe demo mode without a server restart.

Demo mode is activated and deactivated via:
```bash
npm run demo:on           # requires live Monarch connection — scales amounts, replaces names, writes fixtures
npm run demo:on-offline   # no Monarch connection needed — reads from data/demo-monarch.json snapshot + DB
npm run demo:off          # removes fixtures, restores real names and category names
```

`demo:on-offline` was added to support demos during the Monarch MCP outage (started 2026-06-30). It reads the monarch data snapshot captured before the outage, reads current budget values directly from SQLite (not the stale budget snapshot), applies the same scaling and anonymization as `demo:on`, and forces the fixed bucket total to exactly balance with scaled subcategories + special expenses. It also renames any `category_config` rows whose names contain real person names (e.g. "Alex's business expense" → "David's business expense"), backed up and restored by `demo:off`.

Note: `demo:on-offline` only generates fixtures for the current year — prior year data is not available without a live Monarch connection.

---

## Frontend

The UI is entirely client-rendered React (Next.js App Router with `'use client'` components). There is no server-side rendering of financial data — the page shell renders immediately and data loads via `fetch` calls to the API routes.

**Key components:**

| Component | Role |
|---|---|
| `ReportView` | Root report component — checks auth status, fetches data, orchestrates layout |
| `BucketSummary` | Fixed or Discretionary summary card — YTD actual, forecasted annual, budget, variance, and optional subcategory breakdown |
| `CategoryTable` | Expandable per-category table within each bucket — shows model, YTD, forecast, and flag badges |
| `SpecialExpensesPanel` | Lists planned special expenses from MaxiFi |
| `SettingsForm` | Budget input and category configuration UI |
| `ConnectPrompt` | Shown when not authenticated — initiates OAuth flow |
| `NavAuth` | Disconnect button in the top navigation |

---

## Local Development

```bash
npm install
npm run dev      # → http://localhost:3000
```

On first run, the SQLite database is created automatically. The user clicks "Connect with Monarch" to complete the OAuth flow. No environment variables are required.

```bash
npm run demo:on   # activate demo mode (server must be running)
npm run demo:off  # restore real data
```

The `data/` directory is gitignored — no financial data, tokens, or user configuration is ever committed to the repository.
