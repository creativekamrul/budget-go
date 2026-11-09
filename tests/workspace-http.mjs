// Real Auth.js cookie, REST and official SDK checks against an isolated port3100 app.
// Never loads .env, applies migrations or writes to the application's real database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as rawRequest } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function refuse(reason) { throw Object.assign(new Error('Workspace HTTP safety gate refused.'), { code: `WORKSPACE_HTTP_GATE_${reason}` }); }
function identity(value, target = false) {
  let url; try { url = new URL(value); } catch { refuse('URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) refuse('URL');
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!name || name.includes('/')) refuse('NAME');
  if (target) {
    if (!/^budget_go_test_[a-f0-9]{16}$/.test(name) || process.env.BUDGET_GO_TEST_DATABASE_NAME !== name) refuse('TARGET_NAME');
    for (const key of url.searchParams.keys()) if (!['schema', 'sslmode', 'connect_timeout', 'connection_limit'].includes(key)) refuse('OPTIONS');
    if (url.searchParams.getAll('schema').some(schema => schema !== 'public')) refuse('SCHEMA');
  }
  return `${['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase()) ? 'loopback' : url.hostname.toLowerCase()}/${name}`;
}

const completed = [];
const report = { scope: 'Actual isolated Auth.js cookies, REST and official StreamableHTTP SDK; not external n8n acceptance', completed, failure: null };
let client, base;
const createdIds = [], mcpClients = [];
const oldURL = process.env.DATABASE_URL;
async function check(name, fn) { console.log(`RUN workspace HTTP ${name}`); await fn(); completed.push(name); console.log(`PASS workspace HTTP ${name}`); }
function status(result, expected, code) {
  if (result.status !== expected || (code && result.data?.error?.code !== code)) console.error(`HTTP status check: expected=${expected}/${code ?? 'ANY'}, actual=${result.status}/${/^[A-Z_]+$/.test(result.data?.error?.code ?? '') ? result.data.error.code : 'NONE'}`);
  assert.equal(result.status, expected); if (code) assert.equal(result.data?.error?.code, code);
}
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(new URL(path, base), { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const text = await response.text(); let data = null; try { data = JSON.parse(text); } catch { /* Status is asserted. */ }
  return { status: response.status, data, headers: response.headers };
}
class Session {
  cookies = new Map();
  async request(path, { method = 'GET', body, headers = {}, origin = true } = {}) {
    const requestHeaders = { ...headers };
    if (this.cookies.size) requestHeaders.cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (origin && method !== 'GET' && !('origin' in requestHeaders)) requestHeaders.origin = base.origin;
    let serialized;
    if (body !== undefined) {
      if (body instanceof URLSearchParams) { serialized = body.toString(); requestHeaders['content-type'] = 'application/x-www-form-urlencoded'; }
      else { serialized = JSON.stringify(body); requestHeaders['content-type'] = 'application/json'; }
    }
    const response = await fetch(new URL(path, base), { method, body: serialized, headers: requestHeaders, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'), separator = pair.indexOf('='), name = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (!value || /;\s*max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    const text = await response.text(); let data = null; try { data = JSON.parse(text); } catch { /* Status is asserted. */ }
    return { status: response.status, data, headers: response.headers };
  }
  async signIn(email, password) {
    const csrf = await this.request('/api/auth/csrf'); status(csrf, 200); assert.equal(typeof csrf.data.csrfToken, 'string');
    const result = await this.request('/api/auth/callback/credentials', { method: 'POST', headers: { 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ email, password, csrfToken: csrf.data.csrfToken, callbackUrl: base.origin }) });
    assert.ok([200, 302].includes(result.status));
    return this.request('/api/v1/me');
  }
  async hostileHost() {
    return new Promise((resolve, reject) => {
      const req = rawRequest(new URL('/api/v4/workspace', base), { headers: { host: 'hostile.example', cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') } }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > 65536) req.destroy(new Error('Response limit.')); else chunks.push(chunk); });
        response.on('end', () => { let data = null; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Status is asserted. */ } resolve({ status: response.statusCode, data }); });
        response.on('error', reject);
      });
      req.on('error', reject); req.setTimeout(20000, () => req.destroy(new Error('Host check timeout.'))); req.end();
    });
  }
}
const toolValue = value => { assert.equal(value.isError ?? false, false); return JSON.parse(value.content.find(item => item.type === 'text').text); };
async function mcp(token) {
  const sdk = new Client({ name: 'budget-go-workspace-http-acceptance', version: '1' }); mcpClients.push(sdk);
  await sdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', base), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return sdk;
}

try {
  if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1' || !oldURL || !process.env.TEST_DATABASE_URL || !process.env.TEST_APP_URL) refuse('CONFIGURATION');
  if (identity(process.env.BUDGET_GO_APP_DATABASE_URL ?? oldURL) === identity(process.env.TEST_DATABASE_URL, true)) refuse('APPLICATION_TARGET');
  base = new URL(process.env.TEST_APP_URL);
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.port !== '3100' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) refuse('APP_ORIGIN');
  if (globalThis.budgetDb) refuse('INITIALIZED_CLIENT');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { tsImport } = await import('tsx/esm/api');
  const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
  const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
  client = db();
  await client.$queryRaw`SELECT 1`;
  if (await client.user.count() !== 0) refuse('NONEMPTY_DATABASE');
  const prefix = `workspace_http_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID() + randomUUID(), passwordHash = await hashPassword(password);
  const users = [];
  for (const suffix of ['a', 'b']) {
    const id = `${prefix}_${suffix}`, email = `${id}@example.invalid`;
    await client.user.create({ data: { id, email, name: 'Disposable HTTP fixture', passwordHash } }); createdIds.push(id); users.push({ id, email });
  }
  const a = new Session(), b = new Session();
  const snapshot = async (session = a) => { const result = await session.request('/api/v4/workspace'); status(result, 200); return result.data; };
  const command = async (value, { session = a, expectedRevision, requestId = randomUUID() } = {}) => session.request('/api/v4/workspace', { method: 'POST', body: { expectedRevision: expectedRevision ?? (await snapshot(session)).revision, requestId, command: value } });
  const account = (name, amount = 0, kind = 'bank') => ({ type: 'account_create', account: { name, kind, openingDate: '2026-11-01', openingPoisha: amount } });
  let bank, cash, foreign, writeToken, readToken;

  await check('real cookie sign-in and isolated workspace snapshots', async () => {
    status(await request('/api/v4/workspace'), 401, 'UNAUTHORIZED');
    const meA = await a.signIn(users[0].email, password), meB = await b.signIn(users[1].email, password); status(meA, 200); status(meB, 200);
    assert.equal(meA.data.id, users[0].id); assert.equal(meB.data.id, users[1].id);
    const first = await a.request('/api/v4/workspace'); status(first, 200); assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.data.schemaVersion, 4); assert.equal(first.data.accounts.length, 0); assert.equal((await snapshot(b)).accounts.length, 0);
    let result = await command(account('Bank', 100000)); status(result, 200); bank = result.data.accounts[0].id;
    result = await command(account('Cash', 20000, 'cash')); status(result, 200); cash = result.data.accounts.find(item => item.name === 'Cash').id;
    result = await command(account('Other tenant'), { session: b }); status(result, 200); foreign = result.data.accounts[0].id;
    assert.equal((await snapshot()).accounts.length, 2); assert.equal((await snapshot(b)).accounts.length, 1);
  });

  await check('Host Origin bearer precedence and ownership boundaries apply to V4', async () => {
    const before = await snapshot();
    const envelope = { expectedRevision: before.revision, requestId: randomUUID(), command: account('Forbidden') };
    status(await a.request('/api/v4/workspace', { method: 'POST', origin: false, body: envelope }), 403, 'INVALID_ORIGIN');
    status(await a.request('/api/v4/workspace', { method: 'POST', headers: { origin: 'https://hostile.example' }, body: envelope }), 403, 'INVALID_ORIGIN');
    status(await a.hostileHost(), 403, 'INVALID_HOST');
    status(await a.request('/api/v4/workspace', { headers: { authorization: 'Bearer invalid' } }), 401, 'UNAUTHORIZED');
    status(await command({ type: 'account_update', id: foreign, account: { name: 'Foreign edit' } }), 404, 'NOT_FOUND');
    status(await command({ type: 'transaction_create', transaction: { accountId: foreign, description: 'Foreign reference', type: 'expense', category: 'Groceries', date: '2026-11-05', poisha: 1 } }), 404, 'NOT_FOUND');
    status(await command({ ...account('Owner injection'), userId: users[1].id }), 400, 'INVALID_REQUEST');
    status(await command(account('Bad revision'), { expectedRevision: -1 }), 400, 'INVALID_REQUEST');
    assert.deepEqual(await snapshot(), before);
  });

  await check('REST linked entry budget and replay-safe transfer persist exact values', async () => {
    let result = await command({ type: 'transaction_create', transaction: { accountId: bank, description: 'Exact poisha', type: 'expense', category: 'Groceries', date: '2026-11-05', poisha: 29 } }); status(result, 200);
    assert.equal(result.data.transactions[0].poisha, 29); assert.equal(result.data.transactions[0].accountId, bank);
    result = await command({ type: 'budget_create', budget: { month: '2026-11', category: 'Groceries', limitPoisha: 100 } }); status(result, 200);
    const revision = result.data.revision, requestId = randomUUID();
    const transfer = { type: 'transfer_create', transfer: { fromAccountId: bank, toAccountId: cash, description: 'REST transfer', date: '2026-11-06', poisha: 101 } };
    result = await command(transfer, { expectedRevision: revision, requestId }); status(result, 200);
    const replay = await command(transfer, { expectedRevision: revision, requestId }); status(replay, 200); assert.deepEqual(replay.data, result.data);
    assert.equal((await snapshot()).transfers.length, 1);
    status(await command({ ...transfer, transfer: { ...transfer.transfer, poisha: 102 } }, { expectedRevision: revision, requestId }), 409, 'IDEMPOTENCY_CONFLICT');
    status(await command(account('Stale'), { expectedRevision: revision }), 409, 'REVISION_CONFLICT');
    const legacy = await a.request('/api/v1/finance', { method: 'PUT', body: { expectedRevision: result.data.revision, data: { schemaVersion: 1, currency: 'BDT', revision: 0, transactions: [], budgets: [] } } });
    status(legacy, 409, 'VERSION_UPGRADE_REQUIRED');
  });

  await check('session-issued scoped tokens cannot administer credentials or cross tenants', async () => {
    let result = await a.request('/api/v1/tokens', { method: 'POST', body: { name: 'Disposable read', scopes: ['finance:read'], expiresInDays: 1 } }); status(result, 201); readToken = result.data;
    result = await a.request('/api/v1/tokens', { method: 'POST', body: { name: 'Disposable write', scopes: ['finance:read', 'finance:write'], expiresInDays: 1 } }); status(result, 201); writeToken = result.data;
    const auth = token => ({ authorization: `Bearer ${token}` });
    status(await request('/api/v4/workspace', { headers: auth(readToken.token) }), 200);
    status(await request('/api/v4/workspace', { method: 'POST', headers: auth(readToken.token), body: { expectedRevision: (await snapshot()).revision, requestId: randomUUID(), command: account('Scope denied') } }), 403, 'INSUFFICIENT_SCOPE');
    status(await request('/api/v1/tokens', { headers: auth(writeToken.token) }), 403, 'SESSION_REQUIRED');
    status(await b.request(`/api/v1/tokens/${writeToken.metadata.id}`, { method: 'DELETE' }), 404, 'NOT_FOUND');
    assert.equal((await request('/api/v4/workspace', { headers: auth(readToken.token) })).data.accounts.some(item => item.id === foreign), false);
  });

  await check('official SDK workspace tools share REST data mutation replay and scope rules', async () => {
    const sdk = await mcp(writeToken.token), readonly = await mcp(readToken.token);
    const listed = await sdk.listTools(); assert.equal(listed.tools.length, 22); assert.ok(listed.tools.some(tool => tool.name === 'workspace_get')); assert.ok(listed.tools.some(tool => tool.name === 'workspace_mutate')); assert.ok(listed.tools.some(tool => tool.name === 'planning_mutate'));
    assert.deepEqual(toolValue(await sdk.callTool({ name: 'workspace_get', arguments: {} })), await snapshot());
    const before = await snapshot(), requestId = randomUUID(), operation = account('MCP mobile', 50, 'mobile');
    const args = { expectedRevision: before.revision, requestId, command: operation };
    const first = toolValue(await sdk.callTool({ name: 'workspace_mutate', arguments: args }));
    const again = toolValue(await sdk.callTool({ name: 'workspace_mutate', arguments: args })); assert.deepEqual(again, first); assert.deepEqual(await snapshot(), first);
    const denied = await readonly.callTool({ name: 'workspace_mutate', arguments: { expectedRevision: first.revision, requestId: randomUUID(), command: account('Denied SDK') } });
    assert.equal(denied.isError, true); assert.equal(JSON.parse(denied.content[0].text).error.code, 'INSUFFICIENT_SCOPE');
    const foreignResult = await sdk.callTool({ name: 'workspace_mutate', arguments: { expectedRevision: first.revision, requestId: randomUUID(), command: { type: 'account_update', id: foreign, account: { name: 'Denied SDK owner' } } } });
    assert.equal(foreignResult.isError, true); assert.equal(JSON.parse(foreignResult.content[0].text).error.code, 'NOT_FOUND');
    const legacy = await sdk.callTool({ name: 'transaction_delete', arguments: { expectedRevision: first.revision, id: first.transactions[0].id } }); assert.equal(legacy.isError, true); assert.equal(JSON.parse(legacy.content[0].text).error.code, 'VERSION_UPGRADE_REQUIRED');
  });

  await check('classification REST and SDK preserve metadata; V2 refuses a lossy downgrade', async () => {
    let result = await command({ type: 'category_create', category: { name: 'Transport custom', color: '#22c55e', icon: 'car', parentId: null, kind: 'expense' } }); status(result, 200);
    const customId = result.data.categories.find(item => item.name === 'Transport custom').id;
    result = await command({ type: 'transaction_create', transaction: { accountId: bank, description: 'Classified trip', category: 'Transport custom', categoryId: customId, date: '2026-11-07', type: 'expense', poisha: 123, notes: 'Private trip note', status: 'pending', excluded: true } }); status(result, 200);
    const saved = result.data.transactions.find(item => item.description === 'Classified trip');
    assert.equal(saved.categoryId, customId); assert.equal(saved.notes, 'Private trip note'); assert.equal(saved.status, 'pending'); assert.equal(saved.excluded, true);
    const sdk = await mcp(writeToken.token);
    assert.deepEqual(toolValue(await sdk.callTool({ name: 'workspace_get', arguments: {} })), result.data);
    assert.equal((await snapshot(b)).categories.length, 0);
    const foreignRead = await command({ type: 'category_archive', id: customId, archived: true }, { session: b }); status(foreignRead, 404, 'NOT_FOUND');
    status(await a.request('/api/v2/workspace'), 409, 'VERSION_UPGRADE_REQUIRED');
    const downgrade = await a.request('/api/v2/workspace', { method: 'POST', body: { expectedRevision: result.data.revision, requestId: randomUUID(), command: account('V2 must reject') } });
    status(downgrade, 409, 'VERSION_UPGRADE_REQUIRED');
    assert.deepEqual(await snapshot(), result.data);
  });

  await check('V4 families adjustments and matched dated transfers persist through REST and MCP while V3 refuses downgrade',async()=>{
    let result=await command(account('HTTP loan',-10000,'loan'));status(result,200);const loan=result.data.accounts.find(x=>x.name==='HTTP loan').id;
    result=await command({type:'account_adjustment_set',accountId:loan,date:'2026-11-04',balancePoisha:-9000,description:'Verified statement'});status(result,200);assert.equal(result.data.adjustments[0].poisha,1000);
    const transaction=(description,type,accountId,date)=>({description,type,accountId,date,poisha:300,category:type==='income'?'Salary':'Groceries',notes:'Preserve matched metadata'});
    result=await command({type:'transaction_create',transaction:transaction('HTTP match outgoing','expense',bank,'2026-11-05')});status(result,200);const outgoing=result.data.transactions.find(x=>x.description==='HTTP match outgoing');
    result=await command({type:'transaction_create',transaction:transaction('HTTP match incoming','income',loan,'2026-11-07')});status(result,200);const incoming=result.data.transactions.find(x=>x.description==='HTTP match incoming');
    const sdk=await mcp(writeToken.token),requestId=randomUUID();const args={expectedRevision:result.data.revision,requestId,command:{type:'transfer_match',expenseId:outgoing.id,incomeId:incoming.id}};
    const matched=toolValue(await sdk.callTool({name:'workspace_mutate',arguments:args}));assert.equal(matched.matches.length,1);assert.deepEqual(matched.matches[0].outgoing,outgoing);assert.deepEqual(matched.matches[0].incoming,incoming);
    const transfer=matched.transfers.find(t=>t.id===matched.matches[0].transferId);assert.equal(transfer.date,'2026-11-05');assert.equal(transfer.toDate,'2026-11-07');assert.deepEqual(toolValue(await sdk.callTool({name:'workspace_mutate',arguments:args})),matched);
    status(await command({type:'transfer_delete',id:transfer.id}),409,'MATCHED_TRANSFER');
    status(await a.request('/api/v3/workspace'),409,'VERSION_UPGRADE_REQUIRED');status(await b.request('/api/v3/workspace'),200);
    status(await a.request('/api/v3/workspace',{method:'POST',body:{expectedRevision:matched.revision,requestId:randomUUID(),command:account('Do not create')}}),409,'VERSION_UPGRADE_REQUIRED');assert.deepEqual(await snapshot(),matched);
    result=await command({type:'transfer_unmatch',id:matched.matches[0].id});status(result,200);assert.deepEqual(result.data.transactions.find(t=>t.id===outgoing.id),outgoing);assert.deepEqual(result.data.transactions.find(t=>t.id===incoming.id),incoming);
    const before=result.data;status(await command({type:'account_adjustment_set',accountId:foreign,date:'2026-11-05',balancePoisha:0,description:'Forbidden'}),404,'NOT_FOUND');assert.deepEqual(await snapshot(),before);
  });

  await check('revocation expiry and version invalidation affect cookies and cached clients', async () => {
    const sdk = await mcp(writeToken.token);
    status(await a.request(`/api/v1/tokens/${writeToken.metadata.id}`, { method: 'DELETE' }), 200);
    status(await request('/api/v4/workspace', { headers: { authorization: `Bearer ${writeToken.token}` } }), 401, 'UNAUTHORIZED');
    await assert.rejects(() => sdk.callTool({ name: 'workspace_get', arguments: {} }));
    await client.apiToken.update({ where: { id: readToken.metadata.id }, data: { expiresAt: new Date(0) } });
    status(await request('/api/v4/workspace', { headers: { authorization: `Bearer ${readToken.token}` } }), 401, 'UNAUTHORIZED');
    await client.user.update({ where: { id: users[0].id }, data: { sessionVersion: 2 } });
    status(await a.request('/api/v4/workspace'), 401, 'UNAUTHORIZED');
    // Fixture user B remains unaffected by user A's token/session invalidation.
    status(await b.request('/api/v4/workspace'), 200);
  });
} catch (error) {
  const code = /^(?:WORKSPACE_HTTP_GATE_[A-Z_]+|P\d{4}|EPERM|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)$/.test(error?.code ?? '') ? error.code : 'REDACTED';
  report.failure = `Acceptance failed (${code}); consult the last RUN group. Raw errors and credentials withheld.`;
  console.error(report.failure); process.exitCode = 1;
} finally {
  for (const sdk of mcpClients) { try { await sdk.close(); } catch { /* No secrets printed during transport cleanup. */ } }
  try {
    if (client && createdIds.length) {
      const where = { userId: { in: createdIds } };
      await client.ruleRun.deleteMany({where});await client.financeRule.deleteMany({where});await client.statementImport.deleteMany({where});await client.balanceAdjustment.deleteMany({where});await client.matchedTransfer.deleteMany({where});
      await client.transfer.deleteMany({ where }); await client.transaction.deleteMany({ where }); await client.budget.deleteMany({ where }); await client.financialAccount.deleteMany({ where }); await client.requestReceipt.deleteMany({ where });
      await client.category.updateMany({ where, data: { parentId: null } }); await client.category.deleteMany({ where }); await client.tag.deleteMany({ where }); await client.merchant.deleteMany({ where });
      await client.user.deleteMany({ where: { id: { in: createdIds } } }); console.log('Cleanup: exact generated HTTP fixture accounts removed.');
    }
  } finally {
    if (client) await client.$disconnect(); delete globalThis.budgetDb;
    if (oldURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldURL;
    await mkdir('artifacts/mvp', { recursive: true }); await writeFile('artifacts/mvp/http-results.json', JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify({ groupsPassed: completed.length, failure: report.failure, scope: report.scope }, null, 2));
