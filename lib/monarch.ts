import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getValidToken } from './auth';

const MCP_URL = 'https://api.monarch.com/mcp';

async function createClient() {
  const token = await getValidToken();
  const client = new Client({ name: 'monarch-maxifi', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  return { client, transport };
}

async function callTool<T = unknown>(
  client: Client,
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  const result = await client.callTool({ name: toolName, arguments: args });
  const content = result.content;
  if (Array.isArray(content) && content[0]?.type === 'text') {
    const text = (content[0] as { type: 'text'; text: string }).text;
    return JSON.parse(text) as T;
  }
  return result as T;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface MonarchCategory {
  id: string;
  name: string;
  icon: string;
  budget_variability: 'fixed' | 'flexible' | 'non_monthly' | null;
  has_rollover: boolean;
  exclude_from_budget: boolean;
  is_disabled: boolean;
}

export interface MonarchCategoryGroup {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  budget_variability: 'fixed' | 'flexible' | 'non_monthly' | null;
  group_level_budgeting_enabled: boolean;
  categories: MonarchCategory[];
}

export interface GetCategoriesResult {
  category_groups: MonarchCategoryGroup[];
  total_groups: number;
  total_categories: number;
}

export interface CashFlowRow {
  entity_name: string;
  entity_type: string;
  entity_id: string;
  amount: number;
  formatted_amount: string;
}

export interface GetCashFlowResult {
  data: CashFlowRow[];
  total_amount: number;
  formatted_total_amount: string;
}

// ── Batched fetch: all three calls over a single MCP connection ───────────────

export interface MonarchFetchResult {
  categories: GetCategoriesResult;
  ytd: GetCashFlowResult;
  prior: GetCashFlowResult;
}

export async function fetchMonarchData(
  ytdStart: string,
  ytdEnd: string,
  priorStart: string,
  priorEnd: string
): Promise<MonarchFetchResult> {
  const { client, transport } = await createClient();
  await client.connect(transport);
  try {
    const categories = await callTool<GetCategoriesResult>(client, 'GetCategories', {});
    const cashFlowArgs = (start: string, end: string) => ({
      start_date: start,
      end_date: end,
      base_query: JSON.stringify({ group_by_entity: 'category' }),
      filters: JSON.stringify({ category_type: 'expense' }),
    });
    const ytd = await callTool<GetCashFlowResult>(client, 'GetCashFlow', cashFlowArgs(ytdStart, ytdEnd));
    const prior = await callTool<GetCashFlowResult>(client, 'GetCashFlow', cashFlowArgs(priorStart, priorEnd));
    return { categories, ytd, prior };
  } finally {
    await client.close();
  }
}
