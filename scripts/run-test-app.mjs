// Local disposable app runner; never infer a test target from the production URL.
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
loadEnvFile('.env.test-app');
const test = new URL(process.env.TEST_DATABASE_URL ?? '');
const actual = new URL(process.env.DATABASE_URL ?? '');
const reference = new URL(process.env.BUDGET_GO_APP_DATABASE_URL ?? '');
const name = process.env.BUDGET_GO_TEST_DATABASE_NAME;
if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1' || !/^budget_go_test_[a-f0-9]{16}$/.test(name ?? '') || test.pathname !== `/${name}` || actual.href !== test.href || (test.hostname === reference.hostname && test.pathname === reference.pathname) || process.env.APP_URL !== 'http://127.0.0.1:3100' || process.env.AUTH_URL !== 'http://127.0.0.1:3100') throw new Error('Refusing unsafe disposable app configuration.');
const mode = process.argv[2] ?? 'start';
if (!['start', 'dev'].includes(mode)) throw new Error('Choose start or dev.');
// Loading the file in-process avoids forwarding --env-file in NODE_OPTIONS to Next workers.
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', mode, '--hostname', '127.0.0.1', '--port', '3100'], { env: process.env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
