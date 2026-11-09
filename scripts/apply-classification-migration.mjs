// Explicit operator action: deploy reviewed additive migrations and verify original finance fields.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

if (process.env.TEST_DATABASE_URL || !process.env.DATABASE_URL) throw new Error('Use the app environment, without test configuration.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const queries = [
  'SELECT "id","revision","sessionVersion","active" FROM "User" ORDER BY "id"',
  'SELECT "userId","id","description","type","category","date","poisha","accountId" FROM "Transaction" ORDER BY "userId","id"',
  'SELECT "userId","id","month","category","limitPoisha" FROM "Budget" ORDER BY "userId","id"',
  'SELECT * FROM "FinancialAccount" ORDER BY "userId","id"',
  'SELECT "userId","id","fromAccountId","toAccountId","description","date","poisha" FROM "Transfer" ORDER BY "userId","id"',
];
async function fingerprint() {
  const results = [];
  for (const query of queries) results.push((await client.query(query)).rows);
  return createHash('sha256').update(JSON.stringify(results)).digest('hex');
}
try {
  await client.connect();
  const before = await fingerprint();
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Migration did not complete; inspect privately with the operator migration command.');
  if (before !== await fingerprint()) throw new Error('Original financial fields changed; operator investigation required.');
  console.log('Reviewed additive migrations deployed. Original financial records, account links, revisions and session state verified unchanged.');
} catch {
  console.error('Migration or preservation verification failed. No credentials or financial records were logged.');
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
