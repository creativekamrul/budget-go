// Explicitly authorized disposable-database lifecycle; never prints connection strings.
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const servicePath = resolve(root, '.env.test-service');
const appPath = resolve(root, '.env.test-app');
if (resolve(process.cwd()) !== resolve(root)) throw new Error('Run from the project root.');

const action = process.argv[2];
let pool;
try {
  if (!process.env.DATABASE_URL || !['create', 'drop'].includes(action)) throw new Error('configuration');
  const app = new URL(process.env.DATABASE_URL);
  pool = new Pool({ connectionString: app.href, connectionTimeoutMillis: 10000, query_timeout: 20000, max: 1 });
  if (action === 'create') {
    const suffix = randomBytes(8).toString('hex');
    const name = `budget_go_test_${suffix}`;
    const test = new URL(app.href); test.pathname = `/${name}`;
    // Exclusive configuration creation prevents overwriting another ongoing test run.
    const service = `TEST_DATABASE_URL=${JSON.stringify(test.href)}\nBUDGET_GO_ALLOW_TEST_WRITES=1\nBUDGET_GO_TEST_DATABASE_NAME=${name}\n`;
    const appConfig = `DATABASE_URL=${JSON.stringify(test.href)}\nTEST_DATABASE_URL=${JSON.stringify(test.href)}\nBUDGET_GO_APP_DATABASE_URL=${JSON.stringify(app.href)}\nBUDGET_GO_ALLOW_TEST_WRITES=1\nBUDGET_GO_TEST_DATABASE_NAME=${name}\nAPP_URL=http://127.0.0.1:3100\nAUTH_URL=http://127.0.0.1:3100\nAUTH_SECRET=${randomBytes(48).toString('base64url')}\nBUDGET_GO_TEST_EMAIL_A=test-${suffix}-a@example.invalid\nBUDGET_GO_TEST_EMAIL_B=test-${suffix}-b@example.invalid\nBUDGET_GO_TEST_PASSWORD=${randomBytes(32).toString('base64url')}\n`;
    await writeFile(servicePath, service, { flag: 'wx', mode: 0o600 });
    try { await writeFile(appPath, appConfig, { flag: 'wx', mode: 0o600 }); }
    catch (error) { await unlink(servicePath); throw error; }
    try { await pool.query(`CREATE DATABASE "${name}" TEMPLATE template0`); }
    catch (error) { await unlink(servicePath); await unlink(appPath); throw error; }
    console.log('Separate uniquely named disposable PostgreSQL database created. Private test environment files created; no app records changed.');
  } else {
    const name = process.env.BUDGET_GO_TEST_DATABASE_NAME;
    const test = new URL(process.env.TEST_DATABASE_URL || '');
    if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1' || !/^budget_go_test_[a-f0-9]{16}$/.test(name || '') || test.pathname !== `/${name}` || app.pathname === test.pathname || app.hostname !== test.hostname || app.port !== test.port) throw new Error('unsafe cleanup target');
    await pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log('Authorized disposable database removed. Application database unchanged.');
  }
} catch (error) {
  const codes = ['42501', '42P04', '3D000', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EEXIST'];
  console.error(`Disposable database ${action === 'drop' ? 'cleanup' : 'creation'} failed${codes.includes(error.code) ? ` (${error.code})` : ''}. No credentials printed.`);
  process.exitCode = 1;
} finally { await pool?.end(); }
