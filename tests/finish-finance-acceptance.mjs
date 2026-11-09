import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';
import {automationFixture} from './automation-fixture.mjs';
const checks=[];let fixture,failure=null;
const rejects=(fn,status,code)=>assert.rejects(fn,e=>e?.status===status&&(!code||e.code===code));
const check=async(name,fn)=>{console.log('RUN finish finance '+name);await fn();checks.push(name);console.log('PASS finish finance '+name);};
try{
 fixture=await automationFixture('finishfinance');
 const {database,ids,a,b,get,mutate}=fixture;
 const service=await tsImport('../lib/server/workspace-service.ts',import.meta.url),calc=await tsImport('../lib/workspace.ts',import.meta.url),legacy=await tsImport('../lib/server/finance-service.ts',import.meta.url);
 const create=(name,kind,openingPoisha=0,owner=a)=>mutate({type:'account_create',account:{name,kind,openingDate:'2026-01-01',openingPoisha}},owner);
 let saved=await create('Bank','bank',100000);const bank=saved.accounts.find(x=>x.name==='Bank').id;
 saved=await create('Loan','loan',-30000);const loan=saved.accounts.find(x=>x.name==='Loan').id;
 const foreign=(await create('Foreign','bank',0,b)).accounts[0].id;
 const entry=(name,type,date,accountId=bank)=>({description:name,type,date,accountId,poisha:1200,category:type==='income'?'Salary':'Groceries',categoryId:null,merchantId:null,tagIds:[],notes:'Preserve this note',status:'confirmed',excluded:false});
 await check('manual families retain signed balances and exact net worth',async()=>{
   for(const kind of calc.accountKinds.filter(x=>!['bank','loan'].includes(x)))await create(kind,kind);
   assert.equal((await get()).accounts.length,11);assert.deepEqual(calc.netWorthSummary(await get(),'2026-11-09'),{assetsPoisha:100000,liabilitiesPoisha:30000,netWorthPoisha:70000});
 });
 await check('adjustment upserts target and exact replay, later backdated posting remains real',async()=>{
   let state=await get();const requestId=randomUUID(),command={type:'account_adjustment_set',accountId:bank,date:'2026-11-07',balancePoisha:80000,description:'Statement closing balance'};
   state=await service.mutateWorkspace(a,state.revision,requestId,command);const id=state.adjustments[0].id;assert.equal(state.adjustments[0].poisha,-20000);
   assert.deepEqual(await service.mutateWorkspace(a,state.revision-1,requestId,command),state);
   state=await mutate({...command,balancePoisha:85000});assert.equal(state.adjustments[0].id,id);assert.equal(state.adjustments[0].poisha,-15000);
   state=await mutate({type:'transaction_create',transaction:entry('Backdated fee','expense','2026-11-06')});assert.equal(calc.accountBalance(state,bank,'2026-11-07'),83800);assert.equal(calc.workspaceSummary(state,'2026-11','2026-11-09').incomePoisha,0);
   state=await mutate({...command,balancePoisha:85000});assert.equal(calc.accountBalance(state,bank,'2026-11-07'),85000);assert.equal(state.adjustments[0].poisha,-13800);
 });
 await check('adjustment ownership chronology archive and unsafe deltas roll back revision and receipts',async()=>{
   const before=await get();for(const command of [
    {type:'account_adjustment_set',accountId:foreign,date:'2026-11-07',balancePoisha:1,description:'Foreign'},
    {type:'account_adjustment_set',accountId:bank,date:'2025-12-31',balancePoisha:1,description:'Too early'},
    {type:'account_adjustment_set',accountId:bank,date:'2026-11-08',balancePoisha:Number.MAX_SAFE_INTEGER,description:'Unsafe aggregate'},
   ]){const requestId=randomUUID();await assert.rejects(()=>service.mutateWorkspace(a,before.revision,requestId,command));assert.equal(await database.requestReceipt.count({where:{userId:ids[0],requestId}}),0);assert.deepEqual(await get(),before);}
   await mutate({type:'account_archive',id:bank,archived:true});await rejects(()=>mutate({type:'account_adjustment_set',accountId:bank,date:'2026-11-09',balancePoisha:1,description:'Archived'}),409,'ACCOUNT_ARCHIVED');await mutate({type:'account_archive',id:bank,archived:false});
 });
 let out,incoming,match;
 await check('matching preserves both posting dates and fields while removing income/spending, with atomic replay',async()=>{
   saved=await mutate({type:'transaction_create',transaction:entry('Repayment out','expense','2026-11-08')});out=saved.transactions.find(x=>x.description==='Repayment out');
   saved=await mutate({type:'transaction_create',transaction:entry('Repayment in','income','2026-11-09',loan)});incoming=saved.transactions.find(x=>x.description==='Repayment in');
   const before=await get(),requestId=randomUUID(),command={type:'transfer_match',expenseId:out.id,incomeId:incoming.id};
   const after=await service.mutateWorkspace(a,before.revision,requestId,command);match=after.matches[0];
   assert.deepEqual(match.outgoing,out);assert.deepEqual(match.incoming,incoming);assert.equal(after.transactions.some(x=>[out.id,incoming.id].includes(x.id)),false);
   for(const date of ['2026-11-07','2026-11-08','2026-11-09'])for(const accountId of [bank,loan])assert.equal(calc.accountBalance(before,accountId,date),calc.accountBalance(after,accountId,date));
   assert.deepEqual(await service.mutateWorkspace(a,before.revision,requestId,command),after);
   await rejects(()=>mutate({type:'transfer_delete',id:match.transferId}),409,'MATCHED_TRANSFER');assert.deepEqual(await get(),after);
 });
 await check('legacy reads and commands reject unrepresentable V4 data without data loss',async()=>{
   const before=await get();for(const fn of [()=>service.projectWorkspaceV3(before),()=>service.projectWorkspaceV2(before)])assert.throws(fn,e=>e.code==='VERSION_UPGRADE_REQUIRED');
   await rejects(()=>legacy.getFinance(a),409,'VERSION_UPGRADE_REQUIRED');
   for(const version of [true,'v3'])await rejects(()=>service.mutateWorkspace(a,before.revision,randomUUID(),{type:'account_update',id:bank,account:{name:'Must not rename'}},version),409,'VERSION_UPGRADE_REQUIRED');
   assert.deepEqual(await get(),before);
   const old=await get(b);assert.equal(service.projectWorkspaceV3(old).schemaVersion,3);assert.equal(service.projectWorkspaceV2(old).schemaVersion,2);
 });
 await check('unmatching rejects original ID collisions atomically then restores original IDs and fields',async()=>{
   const revision=(await get()).revision;
   await database.transaction.create({data:{...out,userId:ids[0],tagIds:undefined,poisha:BigInt(out.poisha)}});
   // This intentionally invalid raw collision makes any snapshot unreadable, so remove it before exercising the safe normal restore.
   await rejects(()=>service.mutateWorkspace(a,revision,randomUUID(),{type:'transfer_unmatch',id:match.id}),503,'DATA_INTEGRITY');await database.transaction.delete({where:{userId_id:{userId:ids[0],id:out.id}}});
   const restored=await mutate({type:'transfer_unmatch',id:match.id});assert.deepEqual(restored.transactions.find(x=>x.id===out.id),out);assert.deepEqual(restored.transactions.find(x=>x.id===incoming.id),incoming);assert.equal(restored.matches.length,0);assert.equal(restored.transfers.length,0);
   await rejects(()=>mutate({type:'transfer_unmatch',id:match.id}),404,'NOT_FOUND');
 });
 await check('matching rejects pending unequal foreign same-account and split-part entries without partial writes',async()=>{
   const before=await get();await rejects(()=>mutate({type:'transfer_match',expenseId:out.id,incomeId:out.id}),400);assert.deepEqual(await get(),before);
   saved=await mutate({type:'transaction_create',transaction:entry('Wrong same account','income','2026-11-09')});const same=saved.transactions.find(x=>x.description==='Wrong same account');await rejects(()=>mutate({type:'transfer_match',expenseId:out.id,incomeId:same.id}),400);
   for(const [description,extra] of [['Pending',{status:'pending'}],['Unequal',{poisha:1201}]]){
     saved=await mutate({type:'transaction_create',transaction:{...entry(description,'income','2026-11-09',loan),...extra}});const target=saved.transactions.find(t=>t.description===description);const unchanged=await get();await rejects(()=>mutate({type:'transfer_match',expenseId:out.id,incomeId:target.id}),400);assert.deepEqual(await get(),unchanged);
   }
   const foreignEntry=(await mutate({type:'transaction_create',transaction:entry('Foreign','income','2026-11-09',foreign)},b)).transactions[0];
   const unchanged=await get();await rejects(()=>mutate({type:'transfer_match',expenseId:out.id,incomeId:foreignEntry.id}),404,'NOT_FOUND');assert.deepEqual(await get(),unchanged);
   await mutate({type:'transaction_split',id:out.id,parts:[{description:'First half',category:'Groceries',categoryId:null,poisha:600},{description:'Other half',category:'Dining',categoryId:null,poisha:600}]});
   saved=await mutate({type:'transaction_create',transaction:{...entry('Split receiver','income','2026-11-09',loan),poisha:600}});const receive=saved.transactions.find(x=>x.description==='Split receiver');
   const splitBefore=await get();await rejects(()=>mutate({type:'transfer_match',expenseId:out.id,incomeId:receive.id}),409,'SPLIT_MATCH_UNSUPPORTED');assert.deepEqual(await get(),splitBefore);
   const adjustment=splitBefore.adjustments[0];const without=await mutate({type:'account_adjustment_delete',id:adjustment.id});assert.equal(without.adjustments.length,0);
 });
}catch(error){failure={code:error?.code??'ASSERTION_OR_SERVICE'};console.error('FAIL finish finance model',error?.meta?.modelName,'kind',error?.meta?.driverAdapterError?.cause?.kind);console.error('FAIL finish finance',error?.code??'ASSERTION_OR_SERVICE',error?.code==='ERR_ASSERTION'?String(error.message).slice(0,800):'Inspect last group; private details withheld.');process.exitCode=1;}finally{if(fixture)await fixture.close();await mkdir('artifacts/finish-finance',{recursive:true});await writeFile('artifacts/finish-finance/service-results.json',JSON.stringify({scope:'Guarded disposable PostgreSQL financial V4 acceptance',groupsPassed:checks.length,checks,failure},null,2));}console.log(JSON.stringify({groupsPassed:checks.length,checks,failure}));
