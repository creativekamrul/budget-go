// Reviewer-owned V2 checks. No DB connections, fixtures or application server required.
// Real source is transpiled in memory; DB/auth entrypoints deliberately throw sentinels.
// This is pure/helper + real SDK protocol evidence, NOT database/tenant/session acceptance.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

if (process.argv.slice(2).some(arg => !['--pure', '--database'].includes(arg)) || (process.argv.includes('--pure') && process.argv.includes('--database'))) throw new Error('Choose --pure or --database. Database mode requires explicit authorization and dedicated configuration.');
if (process.argv.includes('--database')) {
  try { await runDatabaseAcceptance(); }
  catch (error) { const code = /^(?:REVIEW_GATE_[A-Z_]+|P\d{4}|EPERM|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ERR_INVALID_URL)$/.test(error?.code ?? '') ? error.code : 'REDACTED'; console.error(`FAIL dedicated PostgreSQL acceptance (${code}). Connection/error details withheld to protect credentials. No integration success is claimed; inspect the last printed group and dedicated database configuration.`); process.exitCode = 1; }
  // Do not fall through to the sentinel-backed pure runner.
} else {

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const modules = {};
const forbiddenDB = url('export function db(){ throw new Error("REVIEW_NO_DATABASE_ACCESS"); }');
const forbiddenAuth = url('export async function auth(){ throw new Error("REVIEW_NO_AUTH_SESSION"); }');
async function load(name, replacements = {}) {
  const source = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  compiled = compiled.replace(/from ["']([^"']+)["']/g, (whole, specifier) => {
    if (replacements[specifier]) return `from ${JSON.stringify(replacements[specifier])}`;
    if (specifier.startsWith('node:')) return whole;
    if (specifier.startsWith('.')) throw new Error(`Unmapped source import ${name}: ${specifier}`);
    return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
  });
  const moduleURL = url(compiled); modules[name] = moduleURL; return import(moduleURL);
}
const preview = await load('lib/preview.ts');
const finance = await load('lib/finance.ts', { './preview': modules['lib/preview.ts'] });
const errors = await load('lib/server/errors.ts');
const serviceMap = { '../finance': modules['lib/finance.ts'], '../preview': modules['lib/preview.ts'], './errors': modules['lib/server/errors.ts'], './db': forbiddenDB };
const service = await load('lib/server/finance-service.ts', serviceMap);
const workspace = await load('lib/workspace.ts', { './finance': modules['lib/finance.ts'], './preview': modules['lib/preview.ts'] });
await load('lib/planning.ts', { './preview': modules['lib/preview.ts'], './finance': modules['lib/finance.ts'], './workspace': modules['lib/workspace.ts'] });
await load('lib/workspace-v2.ts', { './finance': modules['lib/finance.ts'], './preview': modules['lib/preview.ts'] });
await load('lib/workspace-v3.ts', { './finance': modules['lib/finance.ts'], './preview': modules['lib/preview.ts'] });
const workspaceService = await load('lib/server/workspace-service.ts', { '../finance': modules['lib/finance.ts'], '../workspace': modules['lib/workspace.ts'], '../workspace-v2': modules['lib/workspace-v2.ts'], '../workspace-v3': modules['lib/workspace-v3.ts'], '../preview': modules['lib/preview.ts'], './db': forbiddenDB, './errors': modules['lib/server/errors.ts'], './finance-service': modules['lib/server/finance-service.ts'] });
await load('lib/automation.ts', { './preview': modules['lib/preview.ts'] });
await load('lib/server/automation-service.ts', { '../automation': modules['lib/automation.ts'], '../preview': modules['lib/preview.ts'], '../workspace': modules['lib/workspace.ts'], './db': forbiddenDB, './finance-service': modules['lib/server/finance-service.ts'], './errors': modules['lib/server/errors.ts'], './workspace-service': modules['lib/server/workspace-service.ts'] });
await load('lib/server/planning-service.ts', { '../planning': modules['lib/planning.ts'], '../preview': modules['lib/preview.ts'], '../workspace': modules['lib/workspace.ts'], './db': forbiddenDB, './finance-service': modules['lib/server/finance-service.ts'], './errors': modules['lib/server/errors.ts'], './workspace-service': modules['lib/server/workspace-service.ts'] });
await load('lib/workbench.ts',{'./preview':modules['lib/preview.ts'],'./automation':modules['lib/automation.ts']});
await load('lib/server/workbench-service.ts',{'../workbench':modules['lib/workbench.ts'],'../workspace':modules['lib/workspace.ts'],'./db':forbiddenDB,'./finance-service':modules['lib/server/finance-service.ts'],'./errors':modules['lib/server/errors.ts'],'./workspace-service':modules['lib/server/workspace-service.ts']});
const tokens = await load('lib/server/token-service.ts', { './finance-service': modules['lib/server/finance-service.ts'], './errors': modules['lib/server/errors.ts'], './db': forbiddenDB });
const password = await load('lib/server/password.ts');
const http = await load('lib/server/http.ts', { '../../auth': forbiddenAuth, '../finance': modules['lib/finance.ts'], './errors': modules['lib/server/errors.ts'], './finance-service': modules['lib/server/finance-service.ts'], './token-service': modules['lib/server/token-service.ts'], './db': forbiddenDB });
const mcp = await load('lib/server/mcp.ts', { '../workbench':modules['lib/workbench.ts'],'./workbench-service':modules['lib/server/workbench-service.ts'], '../finance': modules['lib/finance.ts'], '../workspace': modules['lib/workspace.ts'], '../automation': modules['lib/automation.ts'], '../planning': modules['lib/planning.ts'], './planning-service': modules['lib/server/planning-service.ts'], './automation-service': modules['lib/server/automation-service.ts'], './workspace-service': modules['lib/server/workspace-service.ts'], './errors': modules['lib/server/errors.ts'], './finance-service': modules['lib/server/finance-service.ts'] });
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const fails = (fn, status, code) => assert.throws(fn, error => error instanceof errors.ApiError && error.status === status && error.code === code);
const rejects = (fn, status, code) => assert.rejects(fn, error => error instanceof errors.ApiError && error.status === status && error.code === code);
await check('V2 projection keeps the old shape and refuses custom classification metadata', () => {
  const empty = workspace.emptyWorkspace();
  assert.deepEqual(workspaceService.projectWorkspaceV2(empty), { schemaVersion: 2, currency: 'BDT', revision: 0, accounts: [], transactions: [], transfers: [], budgets: [] });
  for (const category of [
    { name: 'Both salary', kind: 'both' },
    { name: 'Salary', kind: 'both' },
    { name: 'Custom expense', kind: 'expense' },
  ]) fails(() => workspaceService.projectWorkspaceV2({ ...empty, categories: [{ id: 'custom', color: '#a6bcff', icon: 'folder', parentId: null, archived: false, ...category }] }), 409, 'VERSION_UPGRADE_REQUIRED');
});
await check('V3 preserves old shape and rejects financial V4 fields before downgrade',()=>{
 const empty=workspace.emptyWorkspace();const old=workspaceService.projectWorkspaceV3(empty);
 assert.equal(old.schemaVersion,3);assert.equal('adjustments' in old,false);assert.equal('matches' in old,false);
 const account={id:'a',name:'Account',kind:'bank',currency:'BDT',openingDate:'2026-01-01',openingPoisha:0,archived:false};
 const transfer={id:'transfer',fromAccountId:'a',toAccountId:'b',date:'2026-11-01',toDate:'2026-11-01',poisha:100,description:'Move'};
 assert.equal('toDate' in workspaceService.projectWorkspaceV3({...empty,transfers:[transfer]}).transfers[0],false);
 for(const data of [
  {...empty,accounts:[{...account,kind:'loan'}]},
  {...empty,adjustments:[{id:'adjust'}]},
  {...empty,matches:[{id:'match'}]},
  {...empty,transfers:[{...transfer,toDate:'2026-11-02'}]},
 ])for(const project of [workspaceService.projectWorkspaceV3,workspaceService.projectWorkspaceV2])fails(()=>project(data),409,'VERSION_UPGRADE_REQUIRED');
});
await check('database identity safety is target-specific and rejects schema/option bypass', () => {
  assert.equal(databaseIdentity('postgresql://private:unused@localhost:5432/postgres?schema=any&options=reference-only', false), 'loopback/postgres');
  assert.equal(databaseIdentity('postgresql://private:unused@127.0.0.1:5433/budget_go_test_unique?schema=public', true), 'loopback/budget_go_test_unique');
  assert.equal(databaseIdentity('postgresql://a:b@localhost:5432/shared?schema=public', true), databaseIdentity('postgresql://c:d@127.0.0.1:5433/shared?schema=other', false));
  for (const suffix of ['?schema=private', '?schema=public&schema=private', '?options=-csearch_path%3Dprivate', '?search_path=private', '?unexpected=true']) assert.throws(() => databaseIdentity(`postgresql://a:b@localhost/budget_go_test_unique${suffix}`, true), error => /^REVIEW_GATE_TEST_/.test(error.code));
  for (const name of ['postgres', 'template0', 'template1']) assert.throws(() => databaseIdentity(`postgresql://a:b@localhost/${name}`, true), error => error.code === 'REVIEW_GATE_TEST_MAINTENANCE_DATABASE');
});
await check('safe revisions and strict ownership-field rejection', () => {
  for (const v of [-1, 0.1, '1', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) fails(() => service.expectedRevision(v), 400, 'INVALID_REQUEST');
  for (const v of [0, 1, Number.MAX_SAFE_INTEGER]) assert.equal(service.expectedRevision(v), v);
  for (const v of [null, [], {}, { description: 'x', userId: 'other' }, { description: 'x', ownerId: 'other' }]) fails(() => service.inputObject(v, ['description']), 400, 'INVALID_REQUEST');
  assert.deepEqual(service.inputObject({ description: 'x' }, ['description']), { description: 'x' });
});
await check('pure money/date limits remain exact', () => {
  assert.equal(preview.parseAmount('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  assert.equal(preview.decimalAmount(Number.MAX_SAFE_INTEGER), '90071992547409.91');
  assert.equal(preview.parseAmount('90071992547409.92'), null);
  for (const amount of ['1e3', '-1', '0', '0.001']) assert.equal(preview.parseAmount(amount), null);
  assert.equal(preview.validDate('2024-02-29'), true); assert.equal(preview.validDate('2026-02-29'), false);
  assert.throws(() => finance.validateFinance({ ...finance.emptyFinance(), userId: 'other' }));
});
await check('password hash salt, verification and malformed hash rejection', async () => {
  const text = 'review-only-not-a-user-password';
  const a = await password.hashPassword(text), b = await password.hashPassword(text);
  assert.notEqual(a, b); assert.ok(!a.includes(text)); assert.match(a, /^scrypt-v1\$[a-f0-9]{48}\$[a-f0-9]{128}$/);
  assert.equal(await password.verifyPassword(text, a), true); assert.equal(await password.verifyPassword(`${text}!`, a), false);
  assert.equal(await password.verifyPassword(text, 'bad'), false); assert.equal(await password.verifyPassword('x'.repeat(257), a), false);
  await assert.rejects(() => password.hashPassword('short'));
});
await check('tokens hashed; bearer cannot list/mint/revoke credentials before any DB access', async () => {
  assert.match(tokens.hashToken('review-only'), /^[a-f0-9]{64}$/);
  const actor = { kind: 'bearer', userId: 'review', tokenId: 'review', sessionVersion: 1, scopes: ['finance:read', 'finance:write'] };
  await rejects(() => tokens.listTokens(actor), 403, 'SESSION_REQUIRED');
  await rejects(() => tokens.mintToken(actor, {}), 403, 'SESSION_REQUIRED');
  await rejects(() => tokens.revokeToken(actor, 'other'), 403, 'SESSION_REQUIRED');
  for (const raw of ['', 'bg_short', 'Bearer abc', `bg_${'a'.repeat(44)}`]) await rejects(() => tokens.bearerActor(raw), 401, 'UNAUTHORIZED');
});
const originalOrigin = process.env.APP_URL; process.env.APP_URL = 'https://budget.example';
try {
  const req = (headers = {}, method = 'GET', body) => new Request('https://budget.example/api/v1/finance', { method, headers: { host: 'budget.example', ...headers }, body });
  await check('trusted host/origin guard, cookie write origin required, bearer no cookie fallback', async () => {
    http.guardRequest(req(), false); http.guardRequest(req({ origin: process.env.APP_URL }), true);
    for (const origin of ['', 'null', 'https://evil.example', 'https://budget.example.evil']) fails(() => http.guardRequest(req(origin ? { origin } : {}), true), 403, 'INVALID_ORIGIN');
    fails(() => http.guardRequest(req({ host: 'evil.example' }), false), 403, 'INVALID_HOST');
    for (const authorization of ['', 'Basic abc', 'Bearer', 'Bearer one two', 'Bearer bad']) await rejects(() => http.requestActor(req({ authorization })), 401, 'UNAUTHORIZED');
    await rejects(() => http.requestActor(req({ authorization: 'Bearer invalid' }), true, true), 403, 'SESSION_REQUIRED');
    for (const invalid of ['https://user:pass@budget.example', 'https://budget.example/path', 'javascript:alert(1)']) { process.env.APP_URL = invalid; fails(() => http.configuredOrigin(), 503, 'APP_URL_INVALID'); }
    delete process.env.APP_URL; fails(() => http.configuredOrigin(), 503, 'APP_URL_NOT_CONFIGURED'); process.env.APP_URL = 'https://budget.example';
  });
  await check('NextRequest loopback canonicalization is narrowly allowed; raw Host remains mandatory', async () => {
    const { NextRequest } = await import('next/server.js');
    try {
      process.env.APP_URL = 'http://127.0.0.1:3000';
      const next = new NextRequest('http://127.0.0.1:3000/api/v1/finance', { headers: { host: '127.0.0.1:3000', origin: process.env.APP_URL } });
      assert.equal(new URL(next.url).hostname, 'localhost');
      http.guardRequest(next, true);
      const loop = (url, headers = { host: '127.0.0.1:3000' }) => new Request(url, { headers });
      http.guardRequest(loop('http://127.0.0.1:3000/api/v1/finance'), false);
      http.guardRequest(loop('http://localhost:3000/api/v1/finance'), false);
      for (const headers of [{}, { host: 'evil.example' }, { host: 'localhost:3000' }, { host: '127.0.0.1:3001' }]) fails(() => http.guardRequest(loop('http://localhost:3000/api/v1/finance', headers), false), 403, 'INVALID_HOST');
      for (const url of ['http://evil.example:3000/api/v1/finance', 'http://localhost:3001/api/v1/finance', 'https://localhost:3000/api/v1/finance']) fails(() => http.guardRequest(loop(url), false), 403, 'INVALID_HOST');
      for (const origin of ['http://evil.example', 'http://localhost:3000', 'null']) fails(() => http.guardRequest(loop('http://localhost:3000/api/v1/finance', { host: '127.0.0.1:3000', origin }), true), 403, 'INVALID_ORIGIN');
      for (const configured of ['http://[::1]:3000', 'http://localhost:3000']) {
        process.env.APP_URL = configured;
        http.guardRequest(new NextRequest(`${configured}/api/v1/finance`, { headers: { host: new URL(configured).host, origin: configured } }), true);
      }
      process.env.APP_URL = 'https://budget.example';
      fails(() => http.guardRequest(new Request('https://localhost/api/v1/finance', { headers: { host: 'budget.example' } }), false), 403, 'INVALID_HOST');
      fails(() => http.guardRequest(new Request('https://budget.example/api/v1/finance'), false), 403, 'INVALID_HOST');
    } finally { process.env.APP_URL = 'https://budget.example'; }
  });
  await check('mapped Docker ports and HTTPS proxies retain exact public Host and cookie Origin boundaries', async () => {
    const oldPort=process.env.PORT;process.env.PORT='3000';
    try {
      for(const configured of ['http://127.0.0.1:49123','https://budget.example']) {
        process.env.APP_URL=configured;const host=new URL(configured).host;
        for(const listener of ['http://localhost:3000','http://127.0.0.1:3000','http://0.0.0.0:3000','http://[::1]:3000']) {
          http.guardRequest(new Request(`${listener}/api/v4/workspace`,{headers:{host,origin:configured}}),true);
          fails(()=>http.guardRequest(new Request(`${listener}/api/v4/workspace`,{headers:{host:'evil.example',origin:configured}}),true),403,'INVALID_HOST');
          fails(()=>http.guardRequest(new Request(`${listener}/api/v4/workspace`,{headers:{host,origin:'https://evil.example'}}),true),403,'INVALID_ORIGIN');
          fails(()=>http.guardRequest(new Request(`${listener}/api/v4/workspace`,{headers:{host}}),true),403,'INVALID_ORIGIN');
        }
        for(const listener of ['http://evil.example:3000','http://localhost:3001'])fails(()=>http.guardRequest(new Request(`${listener}/api/v4/workspace`,{headers:{host,origin:configured,'x-forwarded-host':host}}),true),403,'INVALID_HOST');
      }
    } finally {process.env.APP_URL='https://budget.example';if(oldPort===undefined)delete process.env.PORT;else process.env.PORT=oldPort;}
  });
  await check('bounded JSON body validates declared and actual size', async () => {
    assert.deepEqual(await http.readJson(req({ 'content-type': 'application/json' }, 'POST', '{"a":1}')), { a: 1 });
    await rejects(() => http.readJson(req({ 'content-type': 'text/plain' }, 'POST', '{}')), 415, 'JSON_REQUIRED');
    await rejects(() => http.readJson(req({ 'content-type': 'application/jsonp' }, 'POST', '{}')), 415, 'JSON_REQUIRED');
    await rejects(() => http.readJson(req({ 'content-type': 'application/json' }, 'POST', '{')), 400, 'INVALID_JSON');
    await rejects(() => http.readJson(req({ 'content-type': 'application/json', 'content-length': '99999999999999999999999' }, 'POST', '{}')), 413, 'BODY_TOO_LARGE');
    await rejects(() => http.readJson(req({ 'content-type': 'application/json' }, 'POST', ' '.repeat(finance.MAX_BACKUP_BYTES + 16385))), 413, 'BODY_TOO_LARGE');
  });
} finally { if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin; }
await check('unexpected errors redact driver credentials and disable caching', async () => {
  const response = errors.errorResponse(new Error('postgres://secret:password@db/private'));
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.ok(!(await response.text()).includes('secret'));
  const known = errors.errorResponse(new errors.ApiError(409, 'REVISION_CONFLICT', 'Reload saved data'));
  assert.equal(known.status, 409); assert.equal((await known.json()).error.code, 'REVISION_CONFLICT');
});
await check('real SDK stateless StreamableHTTP initialize/tools-list/input-errors (no DB)', async () => {
  const actor = { kind: 'bearer', userId: 'review', tokenId: 'review', sessionVersion: 1, scopes: ['finance:read'] };
  const rpc = async (method, params, id = 1) => mcp.handleMcp(new Request('https://budget.example/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-03-26' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }), actor);
  const initialized = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'independent-reviewer', version: '1' } });
  assert.equal(initialized.status, 200); assert.equal(initialized.headers.get('cache-control'), 'no-store'); assert.equal((await initialized.json()).result.serverInfo.name, 'budget-go');
  const notified = await mcp.handleMcp(new Request('https://budget.example/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), actor);
  assert.equal(notified.status, 202);
  const unacceptable = await mcp.handleMcp(new Request('https://budget.example/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }), actor);
  assert.equal(unacceptable.status, 406);
  const list = await rpc('tools/list', {}); assert.equal(list.status, 200); const tools = (await list.json()).result.tools;
  assert.equal(tools.length, 22); assert.ok(tools.some(t => t.name === 'finance_replace')); assert.ok(tools.some(t => t.name === 'workspace_get')); assert.ok(tools.some(t => t.name === 'workspace_mutate')); assert.ok(tools.some(t => t.name === 'automation_get')); assert.ok(tools.some(t => t.name === 'alert_ingest')); assert.ok(tools.some(t => t.name === 'planning_get')); assert.ok(tools.some(t => t.name === 'planning_mutate'));assert.ok(tools.some(t=>t.name==='workbench_get'));assert.ok(tools.some(t=>t.name==='workbench_mutate'));assert.ok(tools.some(t=>t.name==='workbench_preview')); assert.ok(!tools.some(t => /token|user|credential/.test(t.name)));
  const invalid = await rpc('tools/call', { name: 'transaction_create', arguments: { expectedRevision: 0, transaction: { userId: 'other' } } });
  const invalidBody = await invalid.json(); assert.ok(invalidBody.error || invalidBody.result?.isError);
  const unavailable = await rpc('tools/call', { name: 'finance_get', arguments: {} }); const unavailableBody = await unavailable.json();
  assert.equal(unavailableBody.result.isError, true); assert.ok(!JSON.stringify(unavailableBody).includes('REVIEW_NO_DATABASE_ACCESS'));
});
console.log(JSON.stringify({ mode: 'pure-and-sdk-no-database', checks, databaseAcceptance: 'NOT RUN', sessionAcceptance: 'NOT RUN', tenantIsolationAcceptance: 'NOT RUN', liveN8nAcceptance: 'NOT RUN' }, null, 2));
}

function gateFailure(reason) { throw Object.assign(new Error('Database safety preflight refused.'), { code: `REVIEW_GATE_${reason}` }); }
function databaseIdentity(value, testTarget) {
  const role = testTarget ? 'TEST' : 'REFERENCE';
  let parsed; try { parsed = new URL(value); } catch { gateFailure(`${role}_URL_PARSE`); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) gateFailure(`${role}_URL_SHAPE`);
  // Only the test target executes. The application reference may legitimately use /postgres
  // or provider options; compare its host/database without applying target-only restrictions.
  if (testTarget) {
    for (const key of parsed.searchParams.keys()) if (!['sslmode', 'connect_timeout', 'connection_limit', 'schema'].includes(key)) gateFailure('TEST_URL_OPTIONS');
    if (parsed.searchParams.getAll('schema').some(schema => schema !== 'public')) gateFailure('TEST_NONPUBLIC_SCHEMA');
  }
  const host = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname.toLowerCase()) ? 'loopback' : parsed.hostname.toLowerCase();
  let database; try { database = decodeURIComponent(parsed.pathname.slice(1)); } catch { gateFailure(`${role}_DATABASE_ENCODING`); }
  if (!database || database.includes('/')) gateFailure(`${role}_DATABASE_NAME`);
  if (testTarget && ['postgres', 'template0', 'template1'].includes(database.toLowerCase())) gateFailure('TEST_MAINTENANCE_DATABASE');
  return `${host}/${database}`;
}
async function runDatabaseAcceptance() {
  // Authoring this path is not authorization to execute it. Run only after Lead/operator approval.
  // No migrations, schema resets, sample imports or production fixture writes occur here.
  console.log('RUN PostgreSQL safety preflight');
  const testURL = process.env.TEST_DATABASE_URL;
  if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1') gateFailure('WRITE_OPT_IN_MISSING');
  if (!testURL) gateFailure('TEST_URL_MISSING');
  if (!process.env.DATABASE_URL) gateFailure('APPLICATION_REFERENCE_MISSING');
  const target = databaseIdentity(testURL, true);
  if (databaseIdentity(process.env.DATABASE_URL, false) === target) gateFailure('SAME_APPLICATION_DATABASE');
  // Separate process required; never reuse an already initialized application's client.
  if (globalThis.budgetDb) gateFailure('CLIENT_ALREADY_INITIALIZED');
  const previousURL = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testURL;
  let client; const createdIds = []; let passed = 0;
  const check = async (name, action) => { console.log(`RUN PostgreSQL ${name}`); await action(); passed++; console.log(`PASS PostgreSQL ${name}`); };
  try {
    console.log('RUN PostgreSQL actual TypeScript module imports');
    const { tsImport } = await import('tsx/esm/api');
    const { randomUUID } = await import('node:crypto');
    const service = await tsImport('../lib/server/finance-service.ts', import.meta.url);
    const tokens = await tsImport('../lib/server/token-service.ts', import.meta.url);
    const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
    const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
    client = db();
    // A fresh database must already be migrated by an explicitly authorized operator.
    await client.$queryRaw`SELECT 1`;
    if (await client.user.count() !== 0) throw new Error('Dedicated reviewer database must contain no existing accounts; refusing fixture writes.');
    const prefix = `review_${randomUUID().replaceAll('-', '')}`;
    const passwordHash = await hashPassword(randomUUID() + randomUUID());
    for (const suffix of ['a', 'b']) {
      const id = `${prefix}_${suffix}`;
      await client.user.create({ data: { id, email: `${id}@review.invalid`, name: 'Isolated reviewer fixture', passwordHash } });
      createdIds.push(id); // Only successful creates are eligible for exact-ID cleanup.
    }
    const [aId, bId] = createdIds;
    const actor = userId => ({ kind: 'session', userId, sessionVersion: 1, scopes: ['finance:read', 'finance:write'] });
    const a = actor(aId), b = actor(bId);
    const isError = (status, code) => error => error?.status === status && (!code || error.code === code);
    const rejected = (fn, status, code) => assert.rejects(async () => await fn(), isError(status, code));
    const tx = (id, poisha = 29, date = '2024-02-29') => ({ id, description: 'Review-only transaction', type: 'expense', category: 'Groceries', date, poisha });
    const budget = id => ({ id, month: '2024-02', category: 'Groceries', limitPoisha: 100 });
    const empty = revision => ({ schemaVersion: 1, currency: 'BDT', revision, transactions: [], budgets: [] });
    await check('empty accounts and tenant ID isolation', async () => {
      assert.deepEqual(await service.getFinance(a), empty(0)); assert.deepEqual(await service.getFinance(b), empty(0));
      await service.createTransaction(b, 0, tx('b_only'));
      await service.createBudget(b, 1, budget('b_budget'));
      const beforeB = await service.getFinance(b);
      await rejected(() => service.updateTransaction(a, 0, 'b_only', { ...tx('unused'), id: undefined }), 400);
      const fields = tx('unused'); delete fields.id;
      await rejected(() => service.updateTransaction(a, 0, 'b_only', fields), 404, 'NOT_FOUND');
      await rejected(() => service.deleteTransaction(a, 0, 'b_only'), 404, 'NOT_FOUND');
      await rejected(() => service.deleteBudget(a, 0, 'b_budget'), 404, 'NOT_FOUND');
      assert.deepEqual(await service.getFinance(a), empty(0)); assert.deepEqual(await service.getFinance(b), beforeB);
      // Equal per-record IDs in distinct tenants must be permitted and isolated.
      await service.createTransaction(a, 0, tx('b_only', 1));
      assert.equal((await service.getFinance(a)).transactions[0].poisha, 1);
      assert.equal((await service.getFinance(b)).transactions[0].poisha, 29);
    });
    await check('CRUD, month summary, budgets and import/export isolation', async () => {
      let state = await service.getFinance(a);
      const { id, ...fields } = tx('b_only', 29);
      state = await service.updateTransaction(a, state.revision, id, fields);
      state = await service.createBudget(a, state.revision, budget('a_budget'));
      const summary = await service.getSummary(a, '2024-02');
      assert.equal(summary.expensePoisha, 29); assert.equal(summary.balancePoisha, -29); assert.equal(summary.budgets[0].spentPoisha, 29);
      assert.equal((await service.getSummary(a, '2024-03')).expensePoisha, 0);
      const beforeB = await service.getFinance(b);
      const backup = JSON.parse(JSON.stringify(state));
      state = await service.replaceFinance(a, state.revision, empty(0)); assert.equal(state.transactions.length, 0);
      state = await service.replaceFinance(a, state.revision, backup); assert.equal(state.transactions[0].poisha, 29);
      assert.deepEqual(await service.getFinance(b), beforeB);
      const { id: budgetId, ...budgetFields } = budget('a_budget');
      state = await service.updateBudget(a, state.revision, budgetId, { ...budgetFields, limitPoisha: 200 });
      state = await service.deleteBudget(a, state.revision, budgetId); assert.equal(state.transactions.length, 1);
      state = await service.deleteTransaction(a, state.revision, id); assert.equal(state.transactions.length, 0);
    });
    await check('same-revision concurrency yields one success and one 409', async () => {
      const before = await service.getFinance(a);
      const outcomes = await Promise.allSettled([service.createTransaction(a, before.revision, tx('race_one')), service.createTransaction(a, before.revision, tx('race_two'))]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      const failed = outcomes.find(result => result.status === 'rejected'); assert.ok(isError(409, 'REVISION_CONFLICT')(failed.reason));
      const after = await service.getFinance(a); assert.equal(after.revision, before.revision + 1); assert.equal(after.transactions.length, 1);
    });
    await check('unsafe aggregate and invalid import leave rows/revision unchanged', async () => {
      const before = await service.getFinance(a);
      await rejected(() => service.createTransaction(a, before.revision, tx('overflow', Number.MAX_SAFE_INTEGER)), 400);
      assert.deepEqual(await service.getFinance(a), before);
      await rejected(() => service.replaceFinance(a, before.revision, { ...empty(0), userId: bId }), 400);
      assert.deepEqual(await service.getFinance(a), before);
      await rejected(() => service.createTransaction(a, before.revision, tx('invalid_date', 1, '2026-02-29')), 400);
      assert.deepEqual(await service.getFinance(a), before);
    });
    await check('real SQL failure after deletes rolls back finance and revision', async () => {
      const before = await service.getFinance(a);
      const originalTransaction = client.$transaction;
      let injected = false;
      // Test-only interception of the callback boundary: every read/delete is real SQL.
      // At the first createMany AFTER service deletes, PostgreSQL itself raises division-by-zero.
      // No fake successful database result, trigger, schema mutation or user fixture is used.
      client.$transaction = (callback, options) => originalTransaction.call(client, async transaction => {
        const delegate = new Proxy(transaction.transaction, { get(target, key) {
          if (key === 'createMany') return async () => { injected = true; await transaction.$queryRaw`SELECT 1 / 0`; throw new Error('SQL failure was not raised'); };
          return Reflect.get(target, key);
        } });
        const wrapped = new Proxy(transaction, { get(target, key) { return key === 'transaction' ? delegate : Reflect.get(target, key); } });
        return callback(wrapped);
      }, options);
      try { await assert.rejects(async () => await service.createTransaction(a, before.revision, tx('sql_rollback'))); }
      finally { client.$transaction = originalTransaction; }
      assert.equal(injected, true); assert.deepEqual(await service.getFinance(a), before);
    });
    await check('token hashes, metadata, read-only scope, ownership, revoke and expiry', async () => {
      const minted = await tokens.mintToken(a, { name: 'review read', scopes: ['finance:read'], expiresInDays: 1 });
      const raw = await client.apiToken.findUnique({ where: { id: minted.metadata.id } });
      assert.equal(raw.tokenHash, tokens.hashToken(minted.token)); assert.notEqual(raw.tokenHash, minted.token);
      const listed = await tokens.listTokens(a); assert.equal(listed.length, 1); assert.ok(!('tokenHash' in listed[0]) && !('token' in listed[0]));
      assert.deepEqual(await tokens.listTokens(b), []);
      await rejected(() => tokens.revokeToken(b, minted.metadata.id), 404, 'NOT_FOUND');
      const bearer = await tokens.bearerActor(minted.token); const before = await service.getFinance(a);
      await service.getFinance(bearer);
      await rejected(() => service.createTransaction(bearer, before.revision, tx('scope_denied')), 403);
      assert.deepEqual(await service.getFinance(a), before);
      await rejected(() => tokens.mintToken(bearer, { name: 'denied', scopes: ['finance:read'], expiresInDays: 1 }), 403, 'SESSION_REQUIRED');
      await tokens.revokeToken(a, minted.metadata.id);
      await rejected(() => tokens.bearerActor(minted.token), 401, 'UNAUTHORIZED');
      await rejected(() => service.getFinance(bearer), 401, 'UNAUTHORIZED');
      const expired = await tokens.mintToken(a, { name: 'review expired', scopes: ['finance:read'], expiresInDays: 1 });
      await client.apiToken.update({ where: { id: expired.metadata.id }, data: { expiresAt: new Date(0) } });
      await rejected(() => tokens.bearerActor(expired.token), 401, 'UNAUTHORIZED');
    });
    await check('active/version recheck rejects cached actors and tokens', async () => {
      const minted = await tokens.mintToken(a, { name: 'review version', scopes: ['finance:read', 'finance:write'], expiresInDays: 1 });
      const cached = await tokens.bearerActor(minted.token);
      await client.user.update({ where: { id: aId }, data: { sessionVersion: 2 } });
      await rejected(() => tokens.bearerActor(minted.token), 401, 'UNAUTHORIZED');
      await rejected(() => service.getFinance(cached), 401, 'UNAUTHORIZED');
      await rejected(() => service.getFinance(a), 401, 'UNAUTHORIZED');
      const current = { ...a, sessionVersion: 2 };
      const currentToken = await tokens.mintToken(current, { name: 'review disabled', scopes: ['finance:read'], expiresInDays: 1 });
      const cachedCurrent = await tokens.bearerActor(currentToken.token);
      await client.user.update({ where: { id: aId }, data: { active: false } });
      await rejected(() => service.getFinance(current), 401, 'UNAUTHORIZED');
      await rejected(() => service.getFinance(cachedCurrent), 401, 'UNAUTHORIZED');
      await rejected(() => tokens.bearerActor(currentToken.token), 401, 'UNAUTHORIZED');
    });
    console.log(JSON.stringify({ mode: 'actual-PostgreSQL-services', groupsPassed: passed, authJsHttpBrowser: 'NOT RUN', deployedMcpN8n: 'NOT RUN' }, null, 2));
  } finally {
    try {
      if (client && createdIds.length) {
        // Exact IDs created successfully in THIS run only. FK cascades remove only their fixtures.
        const removed = await client.user.deleteMany({ where: { id: { in: createdIds } } });
        assert.equal(removed.count, createdIds.length); console.log('Cleanup: exact generated test accounts removed.');
      }
    } finally {
      if (client) await client.$disconnect();
      delete globalThis.budgetDb;
      if (previousURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousURL;
    }
  }
}
