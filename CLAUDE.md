# monarch-maxifi — CLAUDE.md

## Repository & privacy — READ FIRST

**This GitHub repo is PUBLIC.** Never commit the user's personal or financial data.
Real data lives only in the gitignored SQLite DB (`/data/`) and transaction exports
(`Transactions_*.csv`) — keep it there.

- **Gitignored / private:** `/data/`, `/notes/`, `Transactions_*.csv`, `.env*`.
- **NOT ignored (PUBLIC if committed):** `/docs/`, `Context/`, `Spec/`, source code, this file.
- Put any planning/handoff/analysis doc that contains real amounts, household names,
  account details, or tokens in **`/notes/`**, never `/docs/`.
- Never hardcode personal financial data, names, or secrets into tracked source.
- Before any `git push`, scan the diff for names/amounts/tokens.

## What this app does

Local Next.js app bridging Monarch Money actuals with MaxiFi annual budget targets.
Primary question: "Am I on track with my MaxiFi plan this year?"

## Running locally

```bash
npm run dev   # → http://localhost:3000
```

No `.env.local` required. On first run, click "Connect with Monarch" to complete the
OAuth 2.1 PKCE flow. Tokens are stored in the local SQLite DB and refreshed automatically.

SQLite DB is auto-created at `./data/monarch-maxifi.db` on first request.

## Key files

| File | Purpose |
|---|---|
| `lib/auth.ts` | OAuth 2.1 PKCE flow — client registration, token exchange, refresh |
| `lib/monarch.ts` | Monarch MCP client (GetCategories, GetCashFlow) |
| `lib/db.ts` | SQLite schema + all queries (incl. oauth_client, oauth_tokens, oauth_state) |
| `lib/forecast.ts` | Forecasting model logic |
| `lib/categories.ts` | Default bucket + model assignments per category name |
| `app/api/auth/authorize/route.ts` | Starts OAuth flow → redirects to Monarch login |
| `app/api/auth/callback/route.ts` | Handles Monarch redirect, exchanges code for tokens |
| `app/api/auth/status/route.ts` | Returns `{ connected: boolean }` |
| `app/api/auth/disconnect/route.ts` | Clears stored tokens |
| `app/api/monarch/route.ts` | Main data endpoint — fetches from Monarch, runs forecasts |
| `app/api/config/route.ts` | Category config CRUD |
| `app/api/budgets/route.ts` | MaxiFi budget CRUD |
| `components/ReportView.tsx` | Main report UI (checks auth, shows ConnectPrompt if not connected) |
| `components/ConnectPrompt.tsx` | "Connect with Monarch" screen |
| `components/NavAuth.tsx` | Disconnect button in nav |
| `components/SettingsForm.tsx` | Budget + category config UI |

## Monarch OAuth

- Monarch supports OAuth 2.1 PKCE with open dynamic client registration (RFC 7591)
- Discovery: `https://api.monarch.com/.well-known/oauth-authorization-server`
- Registration: POST `https://api.monarch.com/oauth/register` — no auth required, returns `client_id`
- Authorize: `https://api.monarch.com/oauth/authorize/` → redirects to `app.monarch.com/login?route=/oauth/consent`
- Token: `https://api.monarch.com/oauth/token/` — exchange code+verifier or refresh token
- Scopes: `mcp:read`, `mcp:write`
- Tokens stored server-side in SQLite; access token refreshed automatically when < 5 min from expiry

## Monarch MCP

- Server: `https://api.monarch.com/mcp`
- Auth: `Authorization: Bearer <access_token>` — token obtained via OAuth, managed by `lib/auth.ts`
- Key tools: `GetCashFlow` (pre-aggregated expense totals), `GetCategories` (full hierarchy)
- `base_query` and `filters` must be **JSON strings**, not objects: `JSON.stringify({ group_by_entity: 'category' })` — the MCP tool schema expects serialized JSON for these params
- Always use `filters: JSON.stringify({ category_type: "expense" })` to exclude transfers
- `GetCashFlow` omits zero-spend categories — merged with `GetCategories` for full list

## Important data quirks

- `GetTransactions` category filter uses names (strings), not IDs
- Zero-spend categories absent from `GetCashFlow` — always merge with `GetCategories`
- Home Improvement credits (refunds) net against expenses automatically
- `Insurance` (Financial group) ≠ `Homeowner's Insurance` (Housing group)
- Two duplicate `uncategorized` categories in the Other group — both excluded

## Branding

Colors defined in `app/globals.css` `@theme` block:
- Navy `#0F2D5E` — nav, headers
- Blue `#2D6BB5` — links, secondary actions
- Orange `#C4401F` — CTAs only (never decorative)
- Success `#157A55` — under-budget values
- Warning `#F59E0B` — flags, over-budget values

Font: Inter (loaded via Google Fonts import in globals.css).
