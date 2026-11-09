// Real Auth.js + PostgreSQL + REST + official MCP SDK acceptance.
// Requires an explicitly authorized, migrated disposable database and a separate app on port 3100.
// Never loads .env, prints credentials, migrates a database or writes fixtures to the application DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { request as rawHttpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const testURL = process.env.TEST_DATABASE_URL;
const productionURL = process.env.DATABASE_URL;
const base = process.env.TEST_APP_URL;
function databaseIdentity(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('PostgreSQL URLs required.');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes('/') || ['postgres', 'template0', 'template1'].includes(database.toLowerCase())) throw new Error('Dedicated application test database required.');
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ? 'loopback' : url.hostname.toLowerCase();
  // Ignore credentials, ports and query parameters conservatively: changing them cannot prove isolation.
  return `${host}/${database}`;
}
if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1' || !testURL || !productionURL || !base) throw new Error('Explicit test-write opt-in, TEST_DATABASE_URL, application DATABASE_URL reference and TEST_APP_URL are required.');
if (databaseIdentity(testURL) === databaseIdentity(productionURL)) throw new Error('Refusing matching application and test databases.');
const target = new URL(base);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.protocol !== 'http:' || target.port !== '3100' || target.pathname !== '/' || target.search || target.hash || target.username || target.password) throw new Error('TEST_APP_URL must be a dedicated loopback HTTP origin on port 3100, never the application port 3000.');
if (globalThis.budgetDb) throw new Error('Use a fresh isolated test process.');
const previousURL = process.env.DATABASE_URL;
process.env.DATABASE_URL = testURL;
let database;
const createdIds = [];
const clients = [];
let checks = 0;
let cleaned = false;
const prefix = `http_${randomUUID().replaceAll('-', '')}`;
const check = async (name, action) => { console.log(`RUN HTTP ${name}`); await action(); checks++; console.log(`PASS HTTP ${name}`); };
class CookieSession {
  cookies = new Map();
  async request(path, { method = 'GET', body, headers = {}, origin = true } = {}) {
    const requestHeaders = { ...headers };
    if (this.cookies.size) requestHeaders.cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (origin && method !== 'GET') requestHeaders.origin = target.origin;
    let serialized;
    if (body !== undefined) {
      if (body instanceof URLSearchParams) { requestHeaders['content-type'] = 'application/x-www-form-urlencoded'; serialized = body.toString(); }
      else { requestHeaders['content-type'] = 'application/json'; serialized = JSON.stringify(body); }
    }
    const response = await fetch(new URL(path, target), { method, headers: requestHeaders, body: serialized, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(';'); const separator = pair.indexOf('='); const name = pair.slice(0, separator), value = pair.slice(separator + 1); if (/;\s*max-age=0(?:;|$)/i.test(cookie) || !value) this.cookies.delete(name); else this.cookies.set(name, value); }
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: response.status, data, headers: response.headers };
  }
  async requestWithRawHost(path, host) {
    // Undici fetch normalizes/ignores a user-supplied Host. Use Node HTTP so this negative
    // test actually transmits the hostile authority while retaining this fixture's cookies.
    return new Promise((resolve, reject) => {
      const request = rawHttpRequest(new URL(path, target), { method: 'GET', headers: { host, cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') } }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > 65_536) request.destroy(new Error('Raw Host test response exceeded its safety limit.')); else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => { let data = null; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Status is still asserted. */ } resolve({ status: response.statusCode, data }); });
      });
      request.setTimeout(20_000, () => request.destroy(new Error('Raw Host test timed out.')));
      request.on('error', reject); request.end();
    });
  }
  async signIn(email, password) {
    const csrf = await this.request('/api/auth/csrf'); assert.equal(csrf.status, 200); assert.equal(typeof csrf.data.csrfToken, 'string');
    const result = await this.request('/api/auth/callback/credentials', { method: 'POST', body: new URLSearchParams({ email, password, csrfToken: csrf.data.csrfToken, callbackUrl: `${target.origin}/` }), headers: { 'X-Auth-Return-Redirect': '1' } });
    assert.ok([200, 302].includes(result.status), 'Auth.js credentials callback must complete.');
    return this.request('/api/v1/me');
  }
}
async function bearer(path, token, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(new URL(path, target), { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  let data = null; try { data = await response.json(); } catch { /* Empty/unsupported responses are asserted by callers. */ }
  return { status: response.status, data, headers: response.headers };
}
const empty = revision => ({ schemaVersion: 1, currency: 'BDT', revision, transactions: [], budgets: [] });
const transaction = (id, poisha = 29) => ({ id, description: 'Disposable HTTP acceptance fixture', type: 'expense', category: 'Groceries', date: '2024-02-29', poisha });
const fields = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id'));
const errorCode = (result, status, code) => {
  if (result.status !== status || (code && result.data?.error?.code !== code)) {
    const caller = new Error().stack?.split('\n').slice(2).map(line => line.match(/tests[\\/](?:auth-http|auth-browser)\.mjs:\d+:\d+/)?.[0]).find(Boolean) || 'unknown-callsite';
    const actualCode = typeof result.data?.error?.code === 'string' && /^[A-Z_]{1,64}$/.test(result.data.error.code) ? result.data.error.code : 'NONE_OR_REDACTED';
    console.error(`HTTP assertion at ${caller}: expectedStatus=${status}; actualStatus=${Number.isInteger(result.status) ? result.status : 'NONE'}; expectedCode=${code || 'ANY'}; actualCode=${actualCode}`);
  }
  assert.equal(result.status, status); if (code) assert.equal(result.data?.error?.code, code);
};
const toolValue = result => { assert.ok(!result.isError, 'MCP tool unexpectedly failed.'); return JSON.parse(result.content.find(item => item.type === 'text').text); };
async function connectMcp(token) {
  const client = new Client({ name: 'budget-go-isolated-http-acceptance', version: '1' });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', target), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}
async function resetThroughAdminCLI(email, password) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/user-admin.ts', 'reset', '--email', email], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testURL, BUDGET_GO_ADMIN_PASSWORD: password }, stdio: 'ignore', windowsHide: true });
    child.on('error', () => reject(new Error('Isolated admin reset process could not start.')));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Isolated admin reset did not succeed.')));
  });
}
try {
  const { tsImport } = await import('tsx/esm/api');
  const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
  const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
  database = db();
  await database.$queryRaw`SELECT 1`;
  const passwords = [randomUUID() + randomUUID(), randomUUID() + randomUUID()];
  const accounts = [];
  for (const [index, suffix] of ['a', 'b'].entries()) {
    const id = `${prefix}_${suffix}`, email = `${id}@http-test.invalid`;
    await database.user.create({ data: { id, email, name: 'Disposable HTTP test account', passwordHash: await hashPassword(passwords[index]) } });
    createdIds.push(id); accounts.push({ id, email, password: passwords[index] });
  }
  const a = new CookieSession(), b = new CookieSession();
  await check('real Auth.js cookies, two accounts and isolated app identity', async () => {
    errorCode(await new CookieSession().request('/api/v1/finance'), 401, 'UNAUTHORIZED');
    for (const [index, session] of [a, b].entries()) {
      const result = await session.signIn(accounts[index].email, accounts[index].password);
      assert.equal(result.status, 200); assert.equal(result.data.id, accounts[index].id, 'Test app must authenticate the exact isolated-database fixture before any HTTP write.');
      assert.deepEqual((await session.request('/api/v1/finance')).data, empty(0));
    }
    const rejected = new CookieSession(); errorCode(await rejected.signIn(accounts[0].email, randomUUID()), 401);
    const sessionResponse = await a.request('/api/auth/session'); assert.equal(sessionResponse.status, 200); assert.equal(sessionResponse.data.user.id, accounts[0].id);
  });
  let stateA, stateB;
  await check('cookie Origin/Host protections and invalid bearer never falls back', async () => {
    errorCode(await a.request('/api/v1/finance', { method: 'PUT', body: { expectedRevision: 0, data: empty(0) }, origin: false }), 403, 'INVALID_ORIGIN');
    errorCode(await a.request('/api/v1/finance', { method: 'PUT', body: { expectedRevision: 0, data: empty(0) }, headers: { origin: 'https://evil.invalid' }, origin: false }), 403, 'INVALID_ORIGIN');
    errorCode(await a.request('/api/v1/finance', { headers: { authorization: 'Bearer invalid' } }), 401);
    errorCode(await a.requestWithRawHost('/api/v1/finance', 'evil.invalid'), 403, 'INVALID_HOST');
    errorCode(await a.request('/api/v1/tokens', { method: 'POST', body: { name: 'x', scopes: ['finance:read'], expiresInDays: 1 }, origin: false }), 403);
    errorCode(await a.request('/api/v1/finance', { method: 'PUT', body: { expectedRevision: 0, data: { ...empty(0), userId: accounts[1].id } } }), 400);
    assert.deepEqual((await a.request('/api/v1/finance')).data, empty(0));
  });
  await check('REST tenant CRUD, filters, budgets and safe integer money', async () => {
    let result = await b.request('/api/v1/transactions', { method: 'POST', body: { expectedRevision: 0, transaction: transaction('shared_id', 41) } }); assert.equal(result.status, 201); stateB = result.data;
    result = await a.request('/api/v1/transactions', { method: 'POST', body: { expectedRevision: 0, transaction: transaction('shared_id') } }); assert.equal(result.status, 201); stateA = result.data;
    assert.equal(stateA.transactions[0].poisha, 29); assert.equal((await b.request('/api/v1/finance')).data.transactions[0].poisha, 41);
    errorCode(await b.request('/api/v1/budgets', { method: 'POST', body: { expectedRevision: stateB.revision, budget: { id: 'foreign_budget', month: '2024-02', category: 'Groceries', limitPoisha: 100 } } }), 201);
    stateB = (await b.request('/api/v1/finance')).data;
    errorCode(await a.request('/api/v1/budgets/foreign_budget', { method: 'DELETE', body: { expectedRevision: stateA.revision } }), 404, 'NOT_FOUND');
    result = await a.request('/api/v1/transactions/shared_id', { method: 'PUT', body: { expectedRevision: stateA.revision, transaction: fields(transaction('shared_id', 80)) } }); assert.equal(result.status, 200); stateA = result.data;
    result = await a.request('/api/v1/budgets', { method: 'POST', body: { expectedRevision: stateA.revision, budget: { id: 'own_budget', month: '2024-02', category: 'Groceries', limitPoisha: 100 } } }); assert.equal(result.status, 201); stateA = result.data;
    let summary = await a.request('/api/v1/summary?month=2024-02'); assert.equal(summary.data.expensePoisha, 80); assert.equal(summary.data.budgets[0].status, 'Near limit');
    assert.equal((await a.request('/api/v1/transactions?month=2024-03&type=expense')).data.transactions.length, 0);
    assert.equal((await a.request('/api/v1/budgets?month=2024-02')).data.budgets.length, 1);
    result = await a.request('/api/v1/budgets/own_budget', { method: 'PUT', body: { expectedRevision: stateA.revision, budget: { month: '2024-02', category: 'Groceries', limitPoisha: 80 } } }); assert.equal(result.status, 200); stateA = result.data;
    summary = await a.request('/api/v1/summary?month=2024-02'); assert.equal(summary.data.budgets[0].status, 'Limit reached');
    const snapshot = structuredClone(stateA);
    errorCode(await a.request('/api/v1/transactions', { method: 'POST', body: { expectedRevision: stateA.revision, transaction: transaction('overflow', Number.MAX_SAFE_INTEGER) } }), 400);
    assert.deepEqual((await a.request('/api/v1/finance')).data, snapshot);
    assert.deepEqual((await b.request('/api/v1/finance')).data, stateB);
  });
  await check('REST optimistic concurrent writes and whole-tenant backup replacement', async () => {
    const outcomes = await Promise.all(['race_a', 'race_b'].map(id => a.request('/api/v1/transactions', { method: 'POST', body: { expectedRevision: stateA.revision, transaction: transaction(id, 1) } })));
    assert.deepEqual(outcomes.map(item => item.status).sort(), [201, 409]); stateA = (await a.request('/api/v1/finance')).data;
    const backup = structuredClone(stateA);
    let result = await a.request('/api/v1/finance', { method: 'PUT', body: { expectedRevision: stateA.revision, data: empty(999) } }); assert.equal(result.status, 200); stateA = result.data; assert.equal(stateA.transactions.length, 0);
    result = await a.request('/api/v1/finance', { method: 'PUT', body: { expectedRevision: stateA.revision, data: backup } }); assert.equal(result.status, 200); stateA = result.data; assert.equal(stateA.transactions.length, backup.transactions.length);
    assert.deepEqual((await b.request('/api/v1/finance')).data, stateB);
  });
  let readToken, writeToken;
  await check('cookie-only token mint/list, hashed storage, scopes and no-store secrecy', async () => {
    for (const write of [false, true]) {
      const minted = await a.request('/api/v1/tokens', { method: 'POST', body: { name: `${prefix}_${write ? 'write' : 'read'}`, scopes: write ? ['finance:read', 'finance:write'] : ['finance:read'], expiresInDays: 1 } });
      assert.equal(minted.status, 201); assert.equal(minted.headers.get('cache-control'), 'no-store'); assert.match(minted.data.token, /^bg_[A-Za-z0-9_-]{43}$/);
      const saved = await database.apiToken.findUnique({ where: { id: minted.data.metadata.id } }); assert.notEqual(saved.tokenHash, minted.data.token); assert.equal(saved.tokenHash.length, 64);
      if (write) writeToken = minted.data; else readToken = minted.data;
    }
    const listed = await a.request('/api/v1/tokens'); assert.equal(listed.status, 200); assert.equal(listed.data.length, 2); assert.ok(!JSON.stringify(listed.data).includes(readToken.token)); assert.ok(!JSON.stringify(listed.data).includes('tokenHash'));
    assert.equal((await bearer('/api/v1/finance', readToken.token)).status, 200);
    errorCode(await bearer('/api/v1/transactions', readToken.token, { method: 'POST', body: { expectedRevision: stateA.revision, transaction: transaction('forbidden') } }), 403, 'INSUFFICIENT_SCOPE');
    errorCode(await bearer('/api/v1/tokens', writeToken.token), 403, 'SESSION_REQUIRED');
    errorCode(await bearer('/api/v1/tokens', writeToken.token, { method: 'POST', body: { name: 'forbidden', scopes: ['finance:read'], expiresInDays: 1 } }), 403, 'SESSION_REQUIRED');
    errorCode(await bearer(`/api/v1/tokens/${readToken.metadata.id}`, writeToken.token, { method: 'DELETE' }), 403, 'SESSION_REQUIRED');
    errorCode(await b.request(`/api/v1/tokens/${readToken.metadata.id}`, { method: 'DELETE' }), 404, 'NOT_FOUND');
    errorCode(await bearer('/api/v1/finance', writeToken.token, { headers: { origin: 'https://evil.invalid' } }), 403, 'INVALID_ORIGIN');
    let changed = await bearer('/api/v1/transactions', writeToken.token, { method: 'POST', body: { expectedRevision: stateA.revision, transaction: transaction('rest_bearer_write', 1) } }); assert.equal(changed.status, 201); stateA = changed.data;
    changed = await bearer('/api/v1/transactions/rest_bearer_write', writeToken.token, { method: 'DELETE', body: { expectedRevision: stateA.revision } }); assert.equal(changed.status, 200); stateA = changed.data;
    errorCode(await a.request('/api/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'isolated-test', version: '1' } } }, headers: { accept: 'application/json, text/event-stream' } }), 401);
  });
  if (process.env.AUTH_HTTP_BROWSER === '1') await check('real browser credentials, responsive authenticated screens and persisted CRUD', async () => {
    const { runAuthenticatedBrowser } = await import('./auth-browser.mjs');
    const before = structuredClone(stateA);
    stateA = await runAuthenticatedBrowser({ base: target.origin, account: accounts[0] });
    assert.deepEqual(stateA.transactions, before.transactions); assert.deepEqual(stateA.budgets, before.budgets); assert.ok(stateA.revision > before.revision);
  });
  await check('official SDK StreamableHTTP initializes/lists all 11 tools and enforces scopes', async () => {
    const reader = await connectMcp(readToken.token), writer = await connectMcp(writeToken.token);
    const list = await writer.listTools(); assert.equal(list.tools.length, 11); assert.ok(list.tools.find(tool => tool.name === 'finance_replace').annotations.destructiveHint);
    const readState = toolValue(await reader.callTool({ name: 'finance_get', arguments: {} })); assert.equal(readState.revision, stateA.revision);
    const forbidden = await reader.callTool({ name: 'transaction_create', arguments: { expectedRevision: stateA.revision, transaction: transaction('mcp_forbidden') } }); assert.equal(forbidden.isError, true); assert.equal(JSON.parse(forbidden.content[0].text).error.code, 'INSUFFICIENT_SCOPE');
    stateA = toolValue(await writer.callTool({ name: 'transaction_create', arguments: { expectedRevision: stateA.revision, transaction: transaction('mcp_entry', 3) } }));
    stateA = toolValue(await writer.callTool({ name: 'transaction_update', arguments: { expectedRevision: stateA.revision, id: 'mcp_entry', transaction: fields(transaction('mcp_entry', 4)) } }));
    stateA = toolValue(await writer.callTool({ name: 'budget_create', arguments: { expectedRevision: stateA.revision, budget: { id: 'mcp_budget', month: '2024-03', category: 'Dining', limitPoisha: 100 } } }));
    stateA = toolValue(await writer.callTool({ name: 'budget_update', arguments: { expectedRevision: stateA.revision, id: 'mcp_budget', budget: { month: '2024-03', category: 'Dining', limitPoisha: 200 } } }));
    assert.ok(toolValue(await writer.callTool({ name: 'transactions_list', arguments: { month: '2024-02', type: 'expense', category: 'Groceries' } })).transactions.some(item => item.id === 'mcp_entry'));
    assert.equal(toolValue(await writer.callTool({ name: 'budgets_list', arguments: { month: '2024-03' } })).budgets[0].limitPoisha, 200);
    assert.equal(toolValue(await writer.callTool({ name: 'summary_get', arguments: { month: '2024-03' } })).expensePoisha, 0);
    const stale = await writer.callTool({ name: 'transaction_delete', arguments: { expectedRevision: stateA.revision - 1, id: 'mcp_entry' } }); assert.equal(stale.isError, true); assert.equal(JSON.parse(stale.content[0].text).error.code, 'REVISION_CONFLICT');
    const invalid = await writer.callTool({ name: 'transaction_create', arguments: { expectedRevision: stateA.revision, transaction: { ...transaction('bad'), userId: accounts[1].id } } }); assert.equal(invalid.isError, true);
    stateA = toolValue(await writer.callTool({ name: 'budget_delete', arguments: { expectedRevision: stateA.revision, id: 'mcp_budget' } }));
    stateA = toolValue(await writer.callTool({ name: 'transaction_delete', arguments: { expectedRevision: stateA.revision, id: 'mcp_entry' } }));
    stateA = toolValue(await writer.callTool({ name: 'finance_replace', arguments: { expectedRevision: stateA.revision, data: { ...stateA, revision: 0 } } }));
    assert.deepEqual((await b.request('/api/v1/finance')).data, stateB);
  });
  await check('token revocation, expiry and active-account enforcement on actual HTTP', async () => {
    errorCode(await a.request(`/api/v1/tokens/${readToken.metadata.id}`, { method: 'DELETE' }), 200);
    errorCode(await bearer('/api/v1/finance', readToken.token), 401);
    await database.apiToken.update({ where: { id: writeToken.metadata.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    errorCode(await bearer('/api/v1/finance', writeToken.token), 401);
    await database.user.update({ where: { id: accounts[1].id }, data: { active: false } });
    errorCode(await b.request('/api/v1/finance'), 401);
    await database.user.update({ where: { id: accounts[1].id }, data: { active: true } });
  });
  await check('admin CLI password reset invalidates existing real cookie and bearer sessions', async () => {
    const minted = await a.request('/api/v1/tokens', { method: 'POST', body: { name: `${prefix}_reset`, scopes: ['finance:read'], expiresInDays: 1 } }); assert.equal(minted.status, 201);
    const newPassword = randomUUID() + randomUUID(); await resetThroughAdminCLI(accounts[0].email, newPassword);
    errorCode(await a.request('/api/v1/finance'), 401); errorCode(await bearer('/api/v1/finance', minted.data.token), 401);
    const fresh = new CookieSession(); assert.equal((await fresh.signIn(accounts[0].email, newPassword)).data.id, accounts[0].id);
    const old = new CookieSession(); errorCode(await old.signIn(accounts[0].email, accounts[0].password), 401);
    assert.deepEqual((await fresh.request('/api/v1/finance')).data, stateA);
  });
} catch (error) {
  // Assertions and driver exceptions can include cookies, tokens, SQL or connection strings.
  const location = typeof error?.stack === 'string' ? error.stack.match(/tests[\\/](?:auth-http|auth-browser)\.mjs:\d+:\d+/)?.[0] : undefined;
  console.error(`FAIL isolated Auth.js/REST/MCP HTTP acceptance${location ? ` at ${location}` : ''}. No credentials or raw errors have been printed. See the last RUN group for localization.`);
  process.exitCode = 1;
} finally {
  for (const client of clients) { try { await client.close(); } catch { process.exitCode = 1; } }
  try {
    if (database) {
      if (createdIds.length) await database.user.deleteMany({ where: { id: { in: createdIds } } });
      const remaining = createdIds.length ? await database.user.count({ where: { id: { in: createdIds } } }) : 0;
      assert.equal(remaining, 0); cleaned = true;
      await database.$disconnect();
    }
  } catch { console.error('Exact-ID fixture cleanup could not be confirmed; ask the lead to remove this test run’s prefixed fixtures before dropping the disposable database.'); process.exitCode = 1; }
  process.env.DATABASE_URL = previousURL;
}
if (!process.exitCode) console.log(JSON.stringify({ mode: 'real-auth-rest-official-sdk-mcp-isolated-postgresql', checks, fixtureCleanupConfirmed: cleaned, productionDatabaseTouched: false, browserAcceptance: process.env.AUTH_HTTP_BROWSER === '1' ? 'RUN' : 'NOT RUN', liveN8nAcceptance: 'NOT RUN' }, null, 2));
process.exit(process.exitCode || 0);
