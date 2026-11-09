// Disposable visual-QA data only. The fixed sign-in below is NEVER a production credential.
import { tsImport } from 'tsx/esm/api';
const target = new URL(process.env.TEST_DATABASE_URL ?? '');
const reference = new URL(process.env.BUDGET_GO_APP_DATABASE_URL ?? '');
const name = process.env.BUDGET_GO_TEST_DATABASE_NAME;
if (process.env.BUDGET_GO_ALLOW_TEST_WRITES !== '1' || !/^budget_go_test_[a-f0-9]{16}$/.test(name ?? '') || target.pathname !== `/${name}` || process.env.DATABASE_URL !== target.href || (target.hostname === reference.hostname && target.pathname === reference.pathname) || process.env.APP_URL !== 'http://127.0.0.1:3100') throw new Error('Refusing unsafe Reports fixture target.');
const { db } = await tsImport('../lib/server/db.ts', import.meta.url);
const { hashPassword } = await tsImport('../lib/server/password.ts', import.meta.url);
const { createTransaction } = await tsImport('../lib/server/finance-service.ts', import.meta.url);
const { getWorkspace, mutateWorkspace } = await tsImport('../lib/server/workspace-service.ts', import.meta.url);
const client = db();
const userId = 'reports-disposable-visual-fixture';
try {
  if (await client.user.count() !== 0) throw new Error('Test fixture database must start empty.');
  await client.user.create({ data: { id: userId, email: 'reports-fixture@example.invalid', name: 'Disposable report QA', passwordHash: await hashPassword('Reports-fixture-only-2026!') } });
  const actor = { userId, sessionVersion: 1, kind: 'session', scopes: ['finance:read', 'finance:write'] };
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const priorEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const previousDate = `${priorEnd.getFullYear()}-${String(priorEnd.getMonth()+1).padStart(2,'0')}-${String(priorEnd.getDate()).padStart(2,'0')}`;
  const openingDate = `${previousDate.slice(0,7)}-01`;
  const next = new Date(now.getFullYear(), now.getMonth()+1, 1);
  const futureDate = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`;
  await createTransaction(actor, 0, { id:'reports-legacy', description:'Unassigned report fixture', type:'expense', category:'Home', date:today, poisha:1000 });
  let sequence = 0;
  const command = async value => mutateWorkspace(actor, (await getWorkspace(actor)).revision, `reports-fixture-${sequence++}`, value);
  await command({type:'account_create', account:{name:'Reports test bank',kind:'bank',openingDate,openingPoisha:100000}});
  let state = await command({type:'account_create', account:{name:'Reports test cash',kind:'cash',openingDate,openingPoisha:25000}});
  const bank = state.accounts.find(a=>a.kind==='bank').id, cash = state.accounts.find(a=>a.kind==='cash').id;
  const entry = async (description, type, category, date, poisha) => command({type:'transaction_create',transaction:{accountId:bank,description,type,category,date,poisha}});
  await entry('Previous income fixture','income','Salary',previousDate,100000);
  await entry('Previous expense fixture','expense','Groceries',previousDate,20000);
  await entry('Current salary fixture','income','Salary',today,200000);
  await entry('Current groceries fixture','expense','Groceries',today,40000);
  await entry('Current dining fixture','expense','Dining',today,5000);
  await entry('Future expense fixture','expense','Groceries',futureDate,100000);
  await command({type:'transfer_create',transfer:{fromAccountId:bank,toAccountId:cash,description:'Internal transfer fixture',date:today,poisha:10000}});
  await command({type:'budget_create',budget:{month:today.slice(0,7),category:'Groceries',limitPoisha:50000}});
  await command({type:'budget_create',budget:{month:today.slice(0,7),category:'Dining',limitPoisha:10000}});
  await command({type:'account_archive',id:cash,archived:true});
  console.log('Disposable Reports visual fixture is ready. Production finances unchanged.');
} catch { console.error('Reports fixture creation failed; no connection details printed.'); process.exitCode=1; }
finally { await client.$disconnect(); }
