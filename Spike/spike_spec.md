# Monarch MCP Spike

## Goal

Explore the Monarch Money MCP to determine what data is available and how it is structured. The output is a findings document, not a working app. Do not build any application code during this spike.

## Background

We are planning to build a web app that:
- Pulls YTD expense data by category from Monarch Money
- Applies forecasting models to estimate full-year totals
- Maps categories to Fixed / Discretionary buckets (aligned with MaxiFi's budget structure)
- Displays forecasted annual spend vs. MaxiFi budget targets

This spike validates what the MCP can actually provide before we spec the full app.

## MCP Server

Use Monarch's official MCP server, currently in beta.

**Server URL:** `https://api.monarch.com/mcp`

To connect via Claude Code, add the following to your MCP config (`.mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "monarch": {
      "url": "https://api.monarch.com/mcp"
    }
  }
}
```

Authentication is handled via Monarch's OAuth flow — no credentials need to be stored locally. You will be prompted to authorize access the first time you connect. If you have not yet enabled the MCP on your Monarch account, do so at: `https://app.monarch.com/settings/integrations`

## Spike Tasks

Work through these in order. After each task, note your findings before moving on.

### 1. Enumerate available tools

List every tool the MCP exposes. For each tool, note:
- Tool name
- What it does (one sentence)
- Key parameters (especially any date range or category filters)

### 2. Pull category list

Fetch the full list of Monarch expense categories available for this account. Note:
- The exact field names and data types returned
- Whether categories are flat or hierarchical
- Whether Monarch's category names match what appears in the Monarch UI

### 3. Pull YTD transaction totals by category

Fetch expense totals by category for Jan 1, 2026 through today. Note:
- Which tool(s) are needed to get this
- Whether the MCP returns pre-aggregated totals or raw transactions that we must aggregate ourselves
- The shape of the response (fields, types, nesting)
- Whether transfers appear and how to identify/exclude them

### 4. Pull historical data

Attempt to fetch the same category totals for Jan 1, 2025 through Dec 31, 2025. Note:
- Whether prior year data is available
- How far back history goes
- Whether the data shape differs from current year

### 5. Check transaction-level detail

For one category (e.g. Groceries), fetch individual transactions for a recent month. Note:
- Fields available per transaction (amount, date, merchant, category, notes, etc.)
- Whether individual transactions can be excluded by flag or tag
- Whether split transactions are supported

### 6. Check budget data

Fetch any budget data available. Note:
- Whether Monarch budgets are accessible via the MCP
- How budget amounts are structured (monthly? annual? per category?)
- Whether this is useful for our use case or whether MaxiFi budgets will be the source of truth

## Output

Produce a markdown findings document (`FINDINGS.md`) that summarizes:
1. Which tools are available and which are relevant to our use case
2. Answers to each question above
3. Data shapes (include example JSON snippets)
4. Any gaps, limitations, or surprises
5. Recommended approach for the full app based on what the MCP actually provides

## Constraints

- Read-only operations only — do not create, update, or delete any Monarch data
- Do not build any UI, forecasting logic, or app scaffolding
- Keep findings factual — note what the MCP does and does not support, without speculation
