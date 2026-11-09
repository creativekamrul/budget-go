import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { automationFixture } from './automation-fixture.mjs';

const checks=[];let fixture,failure=null;
const rejects=(action,status,code)=>assert.rejects(action,error=>error?.status===status&&(!code||error.code===code));
async function check(name,action){console.log(`RUN core service ${name}`);await action();checks.push(name);console.log(`PASS core service ${name}`);}
try {
  fixture=await automationFixture('core');
  const {database,ids,a,b,get,mutate}=fixture;
  const service=await tsImport('../lib/server/planning-service.ts',import.meta.url);
  const calculations=await tsImport('../lib/workspace.ts',import.meta.url);
  const planning=await tsImport('../lib/planning.ts',import.meta.url);
  const read=(owner=a)=>service.getPlanning(owner);
  const plan=async(command,owner=a,requestId=randomUUID(),revision)=>service.mutatePlanning(owner,revision??(await read(owner)).revision,requestId,command);
  const bank=(await mutate({type:'account_create',account:{name:'Core BDT bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:100000}})).accounts[0].id;
  const foreignBank=(await mutate({type:'account_create',account:{name:'Other bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:0}},b)).accounts[0].id;
  const entry=(description,poisha=1000,extra={})=>({accountId:bank,description,type:'expense',category:'Groceries',categoryId:null,date:'2026-11-01',poisha,merchantId:null,tagIds:[],notes:'Keep this note',status:'confirmed',excluded:false,...extra});
  let saved=await mutate({type:'tag_create',tag:{name:'Core tag',color:'#79e3b4'}});const tag=saved.tags[0].id;
  saved=await mutate({type:'merchant_create',merchant:{name:'Core shop',color:'#79e3b4',website:''}});const merchant=saved.merchants[0].id;
  await mutate({type:'transaction_create',transaction:entry('First bulk',1000,{tagIds:[tag],merchantId:merchant})});
  await mutate({type:'transaction_create',transaction:entry('Second bulk',2000,{category:'Shopping'})});
  const foreignTx=(await mutate({type:'transaction_create',transaction:{...entry('Foreign entry'),accountId:foreignBank}},b)).transactions[0].id;
  const selected=(await get()).transactions.map(t=>t.id);
  await check('bulk changes are selected atomic ownership-scoped and preserve unselected monetary fields',async()=>{
    const before=await get();
    await rejects(()=>mutate({type:'transaction_bulk_update',ids:[selected[0],foreignTx],patch:{notes:'Should roll back'}}),404);
    assert.deepEqual(await get(),before);
    const after=await mutate({type:'transaction_bulk_update',ids:selected,patch:{notes:'Reviewed together',status:'pending'}});
    assert.deepEqual(after.transactions.map(t=>[t.id,t.poisha,t.accountId,t.type]).sort(),before.transactions.map(t=>[t.id,t.poisha,t.accountId,t.type]).sort());
    assert.ok(after.transactions.every(t=>t.notes==='Reviewed together'&&t.status==='pending'));
    const first=after.transactions.find(t=>t.description==='First bulk');assert.deepEqual(first.tagIds,[tag]);assert.equal(first.merchantId,merchant);
    await mutate({type:'transaction_bulk_update',ids:selected,patch:{status:'confirmed'}});
    const unchanged=await get();
    await rejects(()=>mutate({type:'transaction_bulk_update',ids:selected,patch:{date:'2025-12-31'}}),400);
    assert.deepEqual(await get(),unchanged);
    await mutate({type:'tag_archive',id:tag,archived:true});
    await mutate({type:'transaction_bulk_update',ids:selected,patch:{notes:'Archived metadata remains assigned'}});
    assert.deepEqual((await get()).transactions.find(t=>t.description==='First bulk').tagIds,[tag]);
    await mutate({type:'tag_archive',id:tag,archived:false});
  });
  let originalId,partIds;
  await check('splits conserve exact posted money allocate categories and retain first ID and metadata',async()=>{
    const full=entry('Combined purchase',10000,{category:'Shopping',tagIds:[tag],merchantId:merchant,notes:'Original bank metadata'});
    saved=await mutate({type:'transaction_create',transaction:full});originalId=saved.transactions.find(t=>t.description==='Combined purchase').id;
    const before=await get(),beforeBalance=calculations.accountBalance(before,bank,'2026-11-09');
    const parts=[{description:'Food',category:'Groceries',categoryId:null,poisha:6000},{description:'Lunch',category:'Dining',categoryId:null,poisha:4000}];
    await rejects(()=>mutate({type:'transaction_split',id:originalId,parts:[parts[0],{...parts[1],poisha:3999}]}),400);
    assert.deepEqual(await get(),before);assert.equal((await read()).splits.length,0);
    const after=await mutate({type:'transaction_split',id:originalId,parts});
    const group=(await read()).splits[0];partIds=group.partIds;
    assert.equal(group.originalTransactionId,originalId);assert.equal(group.original.poisha,10000);assert.equal(partIds[0],originalId);
    assert.equal(calculations.accountBalance(after,bank,'2026-11-09'),beforeBalance);
    assert.equal(calculations.workspaceSummary(after,'2026-11','2026-11-09').expensePoisha,calculations.workspaceSummary(before,'2026-11','2026-11-09').expensePoisha);
    const resulting=after.transactions.filter(t=>partIds.includes(t.id));assert.equal(resulting.reduce((sum,t)=>sum+t.poisha,0),10000);
    for(const t of resulting){assert.equal(t.accountId,bank);assert.equal(t.date,full.date);assert.equal(t.type,full.type);assert.equal(t.status,full.status);assert.equal(t.notes,full.notes);assert.equal(t.merchantId,merchant);assert.deepEqual(t.tagIds,[tag]);}
    await rejects(()=>mutate({type:'transaction_split',id:partIds[1],parts:[{...parts[0],poisha:2000},{...parts[1],poisha:2000}]}),409,'ALREADY_SPLIT');
    assert.equal((await read(b)).splits.length,0);
  });
  await check('safe month copying preserves target budgets and monthly plans do not post money',async()=>{
    await mutate({type:'budget_create',budget:{month:'2026-10',category:'Groceries',categoryId:null,limitPoisha:5000}});
    await mutate({type:'budget_create',budget:{month:'2026-10',category:'Dining',categoryId:null,limitPoisha:2000}});
    const before=await get();
    saved=await mutate({type:'budget_copy',fromMonth:'2026-10',toMonth:'2026-11'});
    assert.deepEqual(saved.budgets.filter(b=>b.month==='2026-11').map(b=>[b.category,b.limitPoisha]).sort(),before.budgets.filter(b=>b.month==='2026-10').map(b=>[b.category,b.limitPoisha]).sort());
    const copied=await get();await rejects(()=>mutate({type:'budget_copy',fromMonth:'2026-10',toMonth:'2026-11'}),409,'TARGET_HAS_BUDGETS');assert.deepEqual(await get(),copied);
    const financialBefore=await get();const result=await plan({type:'monthly_plan_set',month:'2026-11',incomePoisha:500000,spendingPoisha:200000});
    assert.deepEqual(result.monthlyPlans,[{month:'2026-11',incomePoisha:500000,spendingPoisha:200000}]);assert.deepEqual((await get()).transactions,financialBefore.transactions);
    assert.equal((await read(b)).monthlyPlans.length,0);
  });
  const template={accountId:bank,description:'Recurring rent',type:'expense',category:'Home',categoryId:null,poisha:5000,merchantId:null,tagIds:[],notes:'Recurring note',status:'confirmed',excluded:false};
  const scheduleInput={name:'Monthly rent',transaction:template,startDate:'2026-01-31',frequency:'monthly',active:true};
  let schedule;
  await check('recurring definitions validate ownership chronology and forecasts never post transactions',async()=>{
    const before=await get();
    await rejects(()=>plan({type:'recurring_create',schedule:{...scheduleInput,transaction:{...template,accountId:foreignBank}}}),404);
    await rejects(()=>plan({type:'recurring_create',schedule:{...scheduleInput,startDate:'2025-12-31'}}),400);
    const created=await plan({type:'recurring_create',schedule:scheduleInput});schedule=created.recurring[0];
    assert.deepEqual((await get()).transactions,before.transactions);assert.equal(created.occurrences.length,0);
    assert.deepEqual(planning.upcomingOccurrences(schedule,'2026-01-01','2026-03-31'),['2026-01-31','2026-02-28','2026-03-31']);
    await rejects(()=>plan({type:'recurring_record',id:schedule.id,date:'2026-02-27'}),400);
    await rejects(()=>plan({type:'recurring_record',id:schedule.id,date:'9999-12-31'}),400);
    assert.deepEqual((await get()).transactions,before.transactions);
  });
  await check('concurrent recurring recording and later retries create one entry even after deliberate deletion',async()=>{
    const before=await read(),requestId=randomUUID(),command={type:'recurring_record',id:schedule.id,date:'2026-01-31'};
    await Promise.all([service.mutatePlanning(a,before.revision,requestId,command),service.mutatePlanning(a,before.revision,requestId,command)]);
    const state=await read(),occurrence=state.occurrences.find(o=>o.scheduleId===schedule.id&&o.date==='2026-01-31');assert.ok(occurrence);
    assert.equal(state.occurrences.length,1);assert.equal(state.revision,before.revision+1);
    assert.equal((await get()).transactions.filter(t=>t.id===occurrence.transactionId).length,1);
    try{await plan(command);}catch(error){assert.equal(error.status,409);}
    assert.equal((await read()).occurrences.length,1);
    await mutate({type:'transaction_delete',id:occurrence.transactionId});
    try{await plan(command);}catch(error){assert.equal(error.status,409);}
    assert.equal((await read()).occurrences.length,1);assert.equal((await get()).transactions.filter(t=>t.id===occurrence.transactionId).length,0);
  });
  await check('schedule edits affect only future occurrences while pause archive scope and anchor rules hold',async()=>{
    await plan({type:'recurring_record',id:schedule.id,date:'2026-02-28'});
    const recordedBefore=(await get()).transactions.find(t=>t.description==='Recurring rent');assert.ok(recordedBefore);
    const updated={...scheduleInput,name:'Rent updated',transaction:{...template,poisha:7500},active:false};
    await plan({type:'recurring_update',id:schedule.id,schedule:updated});assert.deepEqual((await get()).transactions.find(t=>t.id===recordedBefore.id),recordedBefore);
    await rejects(()=>plan({type:'recurring_record',id:schedule.id,date:'2026-03-31'}),409);
    await rejects(()=>plan({type:'recurring_update',id:schedule.id,schedule:{...updated,frequency:'weekly'}}),409);
    await plan({type:'recurring_update',id:schedule.id,schedule:{...updated,active:true}});
    await plan({type:'recurring_archive',id:schedule.id,archived:true});await rejects(()=>plan({type:'recurring_record',id:schedule.id,date:'2026-03-31'}),409);
    await rejects(()=>plan({type:'recurring_archive',id:schedule.id,archived:false},b),404);
    await plan({type:'recurring_archive',id:schedule.id,archived:false});
    await plan({type:'recurring_record',id:schedule.id,date:'2026-03-31'});assert.equal((await get()).transactions.find(t=>t.description==='Recurring rent'&&t.date==='2026-03-31').poisha,7500);
    await rejects(()=>plan({type:'recurring_record',id:schedule.id,date:'2026-04-30'},{...a,scopes:['finance:read']}),403);
  });
  await check('planning and finance share revisions receipts and aggregate rollback',async()=>{
    const before=await read(),requestId=randomUUID();
    await plan({type:'monthly_plan_set',month:'2026-12',incomePoisha:0,spendingPoisha:0},a,requestId,before.revision);
    await rejects(()=>service.mutatePlanning(a,before.revision,randomUUID(),{type:'monthly_plan_set',month:'2026-12',incomePoisha:1,spendingPoisha:1}),409,'REVISION_CONFLICT');
    const serviceWorkspace=await tsImport('../lib/server/workspace-service.ts',import.meta.url);
    await rejects(async()=>serviceWorkspace.mutateWorkspace(a,(await get()).revision,requestId,{type:'transaction_bulk_delete',ids:[selected[0]]}),409,'IDEMPOTENCY_CONFLICT');
    const unsafe={...scheduleInput,name:'Safety limit',transaction:{...template,poisha:Number.MAX_SAFE_INTEGER}};
    const created=await plan({type:'recurring_create',schedule:unsafe});const unsafeId=created.recurring.find(s=>s.name==='Safety limit').id;
    const financeBefore=await get(),planningBefore=await read(),failedId=randomUUID();
    await rejects(()=>plan({type:'recurring_record',id:unsafeId,date:'2026-01-31'},a,failedId),400);
    assert.deepEqual(await get(),financeBefore);assert.deepEqual(await read(),planningBefore);assert.equal(await database.requestReceipt.count({where:{userId:ids[0],requestId:failedId}}),0);
    await database.user.update({where:{id:ids[0]},data:{active:false}});await rejects(()=>service.getPlanning(a),401);await database.user.update({where:{id:ids[0]},data:{active:true}});
  });
  await check('bulk deletion removes only selected posting parts while historical split audit remains',async()=>{
    const before=await get(),audit=await read();
    await rejects(()=>mutate({type:'transaction_bulk_delete',ids:[partIds[0],foreignTx]}),404);assert.deepEqual(await get(),before);
    await mutate({type:'transaction_bulk_delete',ids:partIds});assert.ok((await get()).transactions.every(t=>!partIds.includes(t.id)));assert.deepEqual((await read()).splits,audit.splits);
  });
  await check('a split cannot exceed retained planning capacity or make planning unreadable',async()=>{
    saved=await mutate({type:'transaction_create',transaction:entry('Planning capacity target',10000,{notes:'n'.repeat(2000)})});
    const target=saved.transactions.find(t=>t.description==='Planning capacity target');
    const [recurring,occurrences,splits,monthlyPlans]=await Promise.all([database.recurringSchedule.findMany({where:{userId:ids[0]}}),database.recurringOccurrence.findMany({where:{userId:ids[0]}}),database.transactionSplit.findMany({where:{userId:ids[0]}}),database.monthlyPlan.findMany({where:{userId:ids[0]}})]);
    const raw={revision:Number.MAX_SAFE_INTEGER,recurring,occurrences,splits:[...splits],monthlyPlans};
    const size=()=>Buffer.byteLength(JSON.stringify(raw,(_,v)=>typeof v==='bigint'?v.toString():v));
    const rows=[],limit=2*1024*1024-500;
    while(raw.splits.length<999){
      const id=randomUUID(),originalId=randomUUID(),row={userId:ids[0],id,originalTransactionId:originalId,original:{...target,id:originalId,notes:'n'.repeat(2000)},partIds:[originalId,randomUUID()],createdAt:new Date('2026-01-01T00:00:00Z')};
      raw.splits.push(row);
      const excess=size()-limit;
      if(excess>0){if(excess<=row.original.notes.length){row.original.notes=row.original.notes.slice(0,row.original.notes.length-excess);rows.push(row);}else raw.splits.pop();break;}
      rows.push(row);
    }
    assert.ok(rows.length>0&&size()<=limit);
    await database.transactionSplit.createMany({data:rows});
    const before=await get(),beforePlanning=await read(),requestId=randomUUID();
    const work=await tsImport('../lib/server/workspace-service.ts',import.meta.url);
    await rejects(()=>work.mutateWorkspace(a,before.revision,requestId,{type:'transaction_split',id:target.id,parts:[{description:'Capacity first',category:'Groceries',categoryId:null,poisha:5000},{description:'Capacity second',category:'Dining',categoryId:null,poisha:5000}]}),400);
    assert.deepEqual(await get(),before);assert.deepEqual(await read(),beforePlanning);
    assert.equal(await database.requestReceipt.count({where:{userId:ids[0],requestId}}),0);
  });
}catch(error){failure={code:/^(P\d{4}|[A-Z_]+)$/.test(error?.code??'')?error.code:'ASSERTION_OR_SERVICE',message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,500):'Inspect the last printed group; private service details withheld.'};console.error(JSON.stringify(failure));process.exitCode=1;}
finally{if(fixture)await fixture.close();await mkdir('artifacts/core',{recursive:true});await writeFile('artifacts/core/service-results.json',JSON.stringify({scope:'Actual guarded disposable PostgreSQL core finance acceptance',checks,failure},null,2));}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));
