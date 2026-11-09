import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';
import {automationFixture} from './automation-fixture.mjs';

const checks=[];let fixture,failure;
const reject=(action,status)=>assert.rejects(action,e=>e?.status===status);
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`:JSON.stringify(value)??'null';
function resign(backup){const {checksum:unused,...body}=backup;void unused;backup.checksum=createHash('sha256').update(canonical(body)).digest('hex');return backup;}
async function check(name,run){await run();checks.push(name);console.log(`PASS platform ${name}`);}
try{
 fixture=await automationFixture('platform');
 const {database,a,b,password,get,mutate,configure,auto,automation}=fixture;
 const profile=await tsImport('../lib/server/profile-service.ts',import.meta.url);
 const backup=await tsImport('../lib/server/backup-service.ts',import.meta.url);
 const workbench=await tsImport('../lib/server/workbench-service.ts',import.meta.url);
 const planning=await tsImport('../lib/server/planning-service.ts',import.meta.url);
 const automationContract=await tsImport('../lib/automation.ts',import.meta.url);
 const userBefore=await database.user.findUniqueOrThrow({where:{id:a.userId}});
 await check('profile is session-only revisioned retry-safe and isolated',async()=>{
  const before=await profile.getProfile(a),id=randomUUID();
  const after=await profile.updateProfile(a,before.revision,id,{type:'profile_update',name:'Reviewed profile'});
  assert.equal(after.profile.name,'Reviewed profile');assert.equal(after.revision,before.revision+1);
  assert.deepEqual(await profile.updateProfile(a,before.revision,id,{type:'profile_update',name:'Reviewed profile'}),after);
  await reject(()=>profile.updateProfile(a,before.revision,randomUUID(),{type:'profile_update',name:'Stale'}),409);
  assert.equal((await profile.getProfile(b)).profile.name,'Disposable automation fixture');
  await reject(()=>profile.getProfile({...a,kind:'bearer',tokenId:'absent'}),403);
 });
 let data=await mutate({type:'account_create',account:{name:'Property',kind:'property',openingDate:'2026-01-01',openingPoisha:100000}});
 const accountId=data.accounts[0].id;
 await mutate({type:'account_adjustment_set',accountId,date:'2026-11-01',balancePoisha:120000,description:'Reviewed valuation'});
 data=await mutate({type:'account_create',account:{name:'Debt',kind:'loan',openingDate:'2026-01-01',openingPoisha:-5000}});const debtId=data.accounts.find(a=>a.name==='Debt').id;
 data=await mutate({type:'category_create',category:{name:'Recovery expenses',color:'#79e3b4',icon:'folder',parentId:null,kind:'expense'}});const categoryId=data.categories[0].id;
 data=await mutate({type:'tag_create',tag:{name:'Recovery tag',color:'#79e3b4'}});const tagId=data.tags[0].id;
 data=await mutate({type:'merchant_create',merchant:{name:'Recovery shop',color:'#79e3b4',website:'https://example.invalid'}});const merchantId=data.merchants[0].id;
 const decorated={accountId,description:'Recovery entry',type:'expense',category:'Recovery expenses',categoryId,date:'2026-11-02',poisha:500,notes:'Keep exact note',status:'confirmed',excluded:false,tagIds:[tagId],merchantId};
 data=await mutate({type:'transaction_create',transaction:decorated});const recoveryId=data.transactions.find(t=>t.description==='Recovery entry').id;
 await mutate({type:'budget_create',budget:{month:'2026-11',category:'Recovery expenses',categoryId,limitPoisha:10000}});
 await workbench.mutateWorkbench(a,(await get()).revision,randomUUID(),{type:'rule_create',rule:{name:'Recovery rule',active:true,priority:1,conditions:[{field:'description',operator:'contains',value:'Recovery'}],actions:{notes:'Reviewed'}}});
 await workbench.mutateWorkbench(a,(await get()).revision,randomUUID(),{type:'statement_create',name:'Recovery statement',accountId,rows:[{date:'2026-11-03',description:'Staged only',type:'expense',poisha:100,category:'Groceries',categoryId:null}]});
 await planning.mutatePlanning(a,(await get()).revision,randomUUID(),{type:'monthly_plan_set',month:'2026-11',incomePoisha:50000,spendingPoisha:20000});
 const rule=(await workbench.getWorkbench(a)).rules[0];
 await workbench.mutateWorkbench(a,(await get()).revision,randomUUID(),{type:'rule_apply',id:rule.id,ids:[recoveryId]});
 await mutate({type:'transaction_split',id:recoveryId,parts:[{description:'Recovery first half',category:'Recovery expenses',categoryId,poisha:300},{description:'Recovery second half',category:'Groceries',categoryId:null,poisha:200}]});
 const {date:unusedDate,...recurringTransaction}=decorated;void unusedDate;
 const recurrence=await planning.mutatePlanning(a,(await get()).revision,randomUUID(),{type:'recurring_create',schedule:{name:'Recovery recurring',transaction:{...recurringTransaction,description:'Recovery rent',poisha:100},startDate:'2026-11-01',frequency:'monthly',active:true}});
 await planning.mutatePlanning(a,(await get()).revision,randomUUID(),{type:'recurring_record',id:recurrence.recurring[0].id,date:'2026-11-01'});
 data=await mutate({type:'transaction_create',transaction:{...decorated,description:'Recovery repayment out',poisha:50,date:'2026-11-04'}});const outgoing=data.transactions.find(t=>t.description==='Recovery repayment out');
 data=await mutate({type:'transaction_create',transaction:{...decorated,accountId:debtId,type:'income',category:'Salary',categoryId:null,description:'Recovery repayment in',poisha:50,date:'2026-11-05'}});const incoming=data.transactions.find(t=>t.description==='Recovery repayment in');
 await mutate({type:'transfer_match',expenseId:outgoing.id,incomeId:incoming.id});
 await configure({type:'preferences_update',preferences:{...(await auto()).preferences,storeRawMessages:true}});
 const configured=await configure({type:'source_create',source:{name:'Recovery SMS',channel:'sms',providerLabel:'Synthetic recovery fixture',accountId,enabled:true}});
 const sourceId=configured.sources[0].id;
 const retainedRaw='Account debited BDT 1.25 on 06/11/2026. Ref RECOVERY001';
 const ingested=await automation.ingestAlert(a,{sourceId,externalId:'recovery_sms_1',rawText:retainedRaw,draft:{...automationContract.emptyAutomationDraft(),...decorated,description:'Recovery imported alert',date:'2026-11-06',poisha:125}});
 await configure({type:'event_accept',id:ingested.event.id,acknowledgeDuplicate:false});
 await mutate({type:'account_create',account:{name:'Other owner preserved bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:12345}},b);
 const tenantBefore=await get(b),tenantBackupBefore=await backup.exportFullBackup(b);
 const exported=await backup.exportFullBackup(a),original=await get(),originalWorkbench=await workbench.getWorkbench(a),originalPlanning=await planning.getPlanning(a),originalAutomation=await auto();
 const normalizedTables=tables=>Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,[...rows].sort((x,y)=>canonical(x).localeCompare(canonical(y)))]));
 await check('full export includes all model groups and excludes owner identities credentials and receipts',async()=>{
  const preview=backup.previewFullBackup(exported);assert.equal(Object.keys(preview.counts).length,20);assert.equal(preview.counts.BalanceAdjustment,1);assert.equal(preview.counts.FinanceRule,1);assert.equal(preview.counts.StatementImport,1);assert.equal(preview.counts.MonthlyPlan,1);
  for(const [model,count] of Object.entries(preview.counts))assert.ok(count>0,`${model} must have a nonempty roundtrip fixture`);
  assert.equal(preview.counts.MatchedTransfer,1);assert.equal(preview.counts.RecurringOccurrence,1);assert.equal(preview.counts.TransactionSplit,1);assert.equal(preview.counts.RuleRun,1);assert.ok(preview.counts.TransactionTag>0);
  assert.equal(exported.tables.AutomationEvent[0].rawText,retainedRaw);assert.equal(exported.tables.WorkspacePreference[0].data.storeRawMessages,true);
  assert.ok(!('User'in exported.tables));assert.ok(!('ApiToken'in exported.tables));assert.ok(!('RequestReceipt'in exported.tables));
  for(const rows of Object.values(exported.tables))for(const row of rows)assert.ok(!('userId'in row));
  const malformed=structuredClone(exported);malformed.tables.FinancialAccount[0].name='Tampered';assert.throws(()=>backup.previewFullBackup(malformed));
  await reject(()=>backup.exportFullBackup({...a,kind:'bearer',tokenId:'none'}),403);
 });
 await check('invalid reference or duplicate restore rolls back every record and revision',async()=>{
  for(const change of [file=>{file.tables.Transaction[0].accountId='missing_account';},file=>{file.tables.FinancialAccount.push({...file.tables.FinancialAccount[0]});},file=>{file.tables.FinanceRule[0].actions={categoryId:'foreign_category'};},file=>{file.tables.FinancialAccount[0].kind='invalid_kind';},file=>{file.tables.AutomationEvent[0].draft.type='income';},file=>{file.tables.WorkspacePreference[0].data.storeRawMessages=false;}]){
   const bad=structuredClone(exported);change(bad);resign(bad);
   await reject(()=>backup.restoreFullBackup(a,original.revision,randomUUID(),password,bad),400);
   assert.deepEqual(await get(),original);assert.deepEqual(await workbench.getWorkbench(a),originalWorkbench);assert.deepEqual(await planning.getPlanning(a),originalPlanning);assert.deepEqual(await auto(),originalAutomation);assert.deepEqual(normalizedTables((await backup.exportFullBackup(a)).tables),normalizedTables(exported.tables));
  }
  await reject(()=>backup.restoreFullBackup(a,original.revision,randomUUID(),'wrong-password',exported),403);assert.deepEqual(await get(),original);
 });
 await check('restore replaces complete owner data while retaining identity and idempotency tombstones',async()=>{
  await mutate({type:'account_update',id:accountId,account:{name:'Changed after export'}});
  await configure({type:'preferences_update',preferences:{...(await auto()).preferences,storeRawMessages:false}});
  const latest=await get(),id=randomUUID();
  await reject(()=>backup.restoreFullBackup(a,original.revision,randomUUID(),password,exported),409);
  const restored=await backup.restoreFullBackup(a,latest.revision,id,password,exported);
  assert.equal(restored.replayed,false);assert.deepEqual({...await get(),revision:original.revision},original);
  assert.deepEqual({...await workbench.getWorkbench(a),revision:originalWorkbench.revision},originalWorkbench);
  assert.deepEqual({...await planning.getPlanning(a),revision:originalPlanning.revision},originalPlanning);assert.deepEqual({...await auto(),revision:originalAutomation.revision},originalAutomation);
  const reexported=await backup.exportFullBackup(a);assert.deepEqual(normalizedTables(reexported.tables),normalizedTables(exported.tables));
  const replay=await backup.restoreFullBackup(a,latest.revision,id,password,exported);assert.equal(replay.replayed,true);assert.equal(replay.revision,restored.revision);
  const user=await database.user.findUniqueOrThrow({where:{id:a.userId}});assert.equal(user.email,userBefore.email);assert.equal(user.passwordHash,userBefore.passwordHash);assert.equal(user.name,'Reviewed profile');
  assert.deepEqual(await get(b),tenantBefore);assert.deepEqual((await backup.exportFullBackup(b)).tables,tenantBackupBefore.tables);
 });
 await check('security password verification rate limit and session invalidation are real',async()=>{
  const securityRevision=(await get()).revision;
  for(let i=0;i<5;i++)await reject(()=>backup.restoreFullBackup(a,securityRevision,randomUUID(),'wrong',exported),403);
  await reject(()=>profile.changeSecurity(a,{action:'sessions_revoke',currentPassword:password}),429);
  await database.loginRateLimit.deleteMany({where:{key:`security:${a.userId}`}});
  for(let i=0;i<5;i++)await reject(()=>profile.changeSecurity(a,{action:'sessions_revoke',currentPassword:'wrong'}),403);
  await reject(()=>profile.changeSecurity(a,{action:'sessions_revoke',currentPassword:password}),429);
  await database.loginRateLimit.deleteMany({where:{key:`security:${a.userId}`}});
  await profile.changeSecurity(a,{action:'password_change',currentPassword:password,newPassword:'Changed password for disposable checks 2026'});
  await reject(()=>get(),401);
  const next={...a,sessionVersion:2};assert.equal((await profile.getProfile(next)).profile.name,'Reviewed profile');
  await reject(()=>profile.changeSecurity(next,{action:'sessions_revoke',currentPassword:password}),403);
  await profile.changeSecurity(next,{action:'sessions_revoke',currentPassword:'Changed password for disposable checks 2026'});
  await reject(()=>profile.getProfile(next),401);
 });
}catch(error){failure={code:error?.code??'ASSERTION_OR_SERVICE',message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,1000):'Inspect the last group; private details withheld.'};console.error('Platform acceptance failed:',JSON.stringify(failure));process.exitCode=1;}
finally{if(fixture)await fixture.close();await mkdir('artifacts/finish',{recursive:true});await writeFile('artifacts/finish/platform-service-results.json',JSON.stringify({checks,failure},null,2));}
