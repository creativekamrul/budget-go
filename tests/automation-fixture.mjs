import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { tsImport } from 'tsx/esm/api';

export async function automationFixture(prefix='automation') {
  const target=new URL(process.env.TEST_DATABASE_URL??'');
  const original=new URL(process.env.BUDGET_GO_APP_DATABASE_URL??'');
  const databaseName=process.env.BUDGET_GO_TEST_DATABASE_NAME;
  if (process.env.BUDGET_GO_ALLOW_TEST_WRITES!=='1' || !/^budget_go_test_[a-f0-9]{16}$/.test(databaseName??'') || target.pathname!==`/${databaseName}` || (target.hostname===original.hostname && target.pathname===original.pathname) || process.env.DATABASE_URL!==target.href || target.searchParams.getAll('schema').some(s=>s!=='public') || [...target.searchParams.keys()].some(k=>!['schema','sslmode','connect_timeout','connection_limit'].includes(k))) throw new Error('Refusing unsafe automation fixture target.');
  const {db}=await tsImport('../lib/server/db.ts',import.meta.url);
  const {hashPassword}=await tsImport('../lib/server/password.ts',import.meta.url);
  const workspace=await tsImport('../lib/server/workspace-service.ts',import.meta.url);
  const automation=await tsImport('../lib/server/automation-service.ts',import.meta.url);
  const database=db();
  assert.equal(await database.user.count(),0,'Disposable database must contain no existing users.');
  const password=randomBytes(30).toString('base64url');
  const ids=[];
  try {
    for(const suffix of ['a','b']) {
      const id=`${prefix}_${randomUUID().replaceAll('-','')}_${suffix}`;
      await database.user.create({data:{id,email:`${id}@example.invalid`,name:'Disposable automation fixture',passwordHash:await hashPassword(password)}});
      ids.push(id);
    }
  } catch(error) { await database.user.deleteMany({where:{id:{in:ids}}}); await database.$disconnect(); throw error; }
  const actor=userId=>({kind:'session',userId,sessionVersion:1,scopes:['finance:read','finance:write']});
  const a=actor(ids[0]),b=actor(ids[1]);
  const get=(owner=a)=>workspace.getWorkspace(owner);
  const auto=(owner=a)=>automation.getAutomation(owner);
  const mutate=async(command,owner=a)=>workspace.mutateWorkspace(owner,(await get(owner)).revision,randomUUID(),command);
  const configure=async(command,owner=a,requestId=randomUUID(),revision)=>automation.mutateAutomation(owner,revision??(await auto(owner)).revision,requestId,command);
  async function close() {
    const where={userId:{in:ids}};
    try {
      await database.ruleRun.deleteMany({where});
      await database.financeRule.deleteMany({where});
      await database.statementImport.deleteMany({where});
      await database.balanceAdjustment.deleteMany({where});
      await database.matchedTransfer.deleteMany({where});
      await database.recurringOccurrence.deleteMany({where});
      await database.recurringSchedule.deleteMany({where});
      await database.transactionSplit.deleteMany({where});
      await database.monthlyPlan.deleteMany({where});
      await database.automationEvent.deleteMany({where});
      await database.automationSource.deleteMany({where});
      await database.workspacePreference.deleteMany({where});
      await database.transactionTag.deleteMany({where});
      await database.transaction.deleteMany({where});
      await database.budget.deleteMany({where});
      await database.transfer.deleteMany({where});
      await database.financialAccount.deleteMany({where});
      await database.category.updateMany({where,data:{parentId:null}});
      await database.category.deleteMany({where});
      await database.merchant.deleteMany({where});
      await database.tag.deleteMany({where});
      await database.user.deleteMany({where:{id:{in:ids}}});
      console.log('Cleanup: exact generated automation fixture users and dependent rows removed.');
    } finally {await database.$disconnect();}
  }
  return {database,ids,password,a,b,get,auto,mutate,configure,automation,close};
}
