import crypto from 'crypto';
import {
  getOAuthClient,
  saveOAuthClient,
  getOAuthTokens,
  saveOAuthTokens,
  clearOAuthTokens,
  saveOAuthState,
  getAndDeleteOAuthState,
} from './db';

const MONARCH_BASE = 'https://api.monarch.com';
const APP_BASE = process.env.APP_URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${APP_BASE}/api/auth/callback`;

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export async function ensureClientRegistered(): Promise<string> {
  const existing = getOAuthClient();
  if (existing) return existing.client_id;

  const res = await fetch(`${MONARCH_BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'monarch-maxifi',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'mcp:read mcp:write',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth client registration failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { client_id: string };
  saveOAuthClient(data.client_id);
  return data.client_id;
}

const MCP_RESOURCE = 'https://api.monarch.com/mcp';

export function buildAuthorizeUrl(clientId: string, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'mcp:read',
    resource: MCP_RESOURCE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${MONARCH_BASE}/oauth/authorize/?${params}`;
}

export async function startOAuthFlow(): Promise<string> {
  const clientId = await ensureClientRegistered();
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = crypto.randomBytes(16).toString('hex');
  saveOAuthState(state, verifier);
  return buildAuthorizeUrl(clientId, state, challenge);
}

export async function exchangeCodeForTokens(code: string, state: string): Promise<void> {
  const stateRow = getAndDeleteOAuthState(state);
  if (!stateRow) throw new Error('Invalid or expired OAuth state');

  const client = getOAuthClient();
  if (!client) throw new Error('No OAuth client registered');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: client.client_id,
    code_verifier: stateRow.code_verifier,
    resource: MCP_RESOURCE,
  });

  const res = await fetch(`${MONARCH_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  saveOAuthTokens(data.access_token, data.refresh_token ?? null, expiresAt);
}

export async function getValidToken(): Promise<string> {
  const tokens = getOAuthTokens();
  if (!tokens) throw new Error('Not connected to Monarch');

  const expiresAt = new Date(tokens.expires_at).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  if (Date.now() + fiveMinutes >= expiresAt) {
    if (!tokens.refresh_token) {
      clearOAuthTokens();
      throw new Error('Not connected to Monarch');
    }
    await refreshTokens(tokens.refresh_token);
    const refreshed = getOAuthTokens();
    if (!refreshed) throw new Error('Not connected to Monarch');
    return refreshed.access_token;
  }

  return tokens.access_token;
}

async function refreshTokens(refreshToken: string): Promise<void> {
  const client = getOAuthClient();
  if (!client) throw new Error('No OAuth client registered');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: client.client_id,
    resource: MCP_RESOURCE,
  });

  const res = await fetch(`${MONARCH_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    // Refresh token is invalid/expired — require re-auth
    clearOAuthTokens();
    throw new Error('Not connected to Monarch');
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  saveOAuthTokens(data.access_token, data.refresh_token ?? null, expiresAt);
}
