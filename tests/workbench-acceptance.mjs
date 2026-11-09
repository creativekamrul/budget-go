import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tsImport } from 'tsx/esm/api';
import { automationFixture } from './automation-fixture.mjs';
const checks=[];let fixture;
const rejects=(action,status,code)=>assert.rejects(action,error=>error?.status===status&&(!code||error.code===code));
async function check(name,action){console.log(`RUN workbench ${name}`);await action();checks.push(name);console.log(`PASS workbench ${name}`);}
try{
 fixture=await automationFixture('workbench');
 const {database,ids,a,b,get,mutate}=fixture;
 const service=await tsImport('../lib/server/workbench-service.ts',import.meta.url);
 const read=(owner=a)=>service.getWorkbench(owner);
 const save=async(command,owner=a,requestId=randomUUID(),revision)=>service.mutateWorkbench(owner,revision??(await read(owner)).revision,requestId,command);
 const bank=(await mutate({type:'account_create',account:{name:'Statement bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:100000}})).accounts[0].id;
 const foreign=(await mutate({type:'account_create',account:{name:'Foreign bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:0}},b)).accounts[0].id;
 const draft={date:'2026-11-01',description:'Statement purchase',type:'expense',poisha:12345,category:'Groceries',categoryId:null};
 let statement,entry,rule;
 await check('staging never posts money and validates account ownership and draft categories',async()=>{
  const before=await get();await rejects(()=>save({type:'statement_create',name:'Foreign',accountId:foreign,rows:[draft]}),404);
  await rejects(()=>save({type:'statement_create',name:'Bad category',accountId:bank,rows:[{...draft,category:'Salary'}]}),400);
  let state=await save({type:'statement_create',name:'Bank statement',accountId:bank,rows:[draft,{...draft,description:'Another expense',poisha:1000}]});
  statement=state.statements[0];assert.equal(statement.rows.length,2);assert.equal(statement.rows[0].status,'pending');
  assert.deepEqual((await get()).transactions,before.transactions);assert.equal((await read(b)).statements.length,0);
 });
 await check('explicit commit is atomic, replay safe and does not recreate a deliberately deleted row',async()=>{
  const command={type:'statement_commit',id:statement.id,rowIds:[statement.rows[0].id]},requestId=randomUUID(),revision=(await read()).revision;
  const [one,two]=await Promise.all([save(command,a,requestId,revision),save(command,a,requestId,revision)]);assert.deepEqual(one,two);
  entry=(await get()).transactions[0];assert.equal(entry.poisha,12345);assert.equal(one.statements[0].rows[0].transactionId,entry.id);
  await save(command);assert.equal((await get()).transactions.length,1);
  await rejects(()=>save({...command,rowIds:[statement.rows[1].id]},a,requestId),409,'IDEMPOTENCY_CONFLICT');
  await mutate({type:'transaction_bulk_delete',ids:[entry.id]});await save(command);assert.equal((await get()).transactions.length,0);
 });
 await check('duplicate rows default to refusal and selected duplicate IDs allow a deliberate separate entry',async()=>{
  await mutate({type:'transaction_create',transaction:{...draft,accountId:bank,status:'confirmed',excluded:false}});
  const state=await save({type:'statement_create',name:'Duplicate statement',accountId:bank,rows:[draft,draft]});statement=state.statements.find(s=>s.name==='Duplicate statement');
  assert.equal(statement.rows[0].duplicateIds.length,1);assert.equal(statement.rows[1].duplicateRowIds.length,1);
  const before=await get();await rejects(()=>save({type:'statement_commit',id:statement.id,rowIds:statement.rows.map(r=>r.id)}),409,'DUPLICATE_REVIEW_REQUIRED');assert.deepEqual(await get(),before);
  await rejects(()=>save({type:'statement_commit',id:statement.id,rowIds:[statement.rows[0].id],includeDuplicateRowIds:[statement.rows[1].id]}),400);
  await save({type:'statement_commit',id:statement.id,rowIds:[statement.rows[1].id],includeDuplicateRowIds:[statement.rows[1].id]});assert.equal((await get()).transactions.length,2);
 });
 await check('linking validates exact financial fields and creates no transaction',async()=>{
  const used=(await read()).statements.find(s=>s.id===statement.id).rows.map(r=>r.transactionId);const existing=(await get()).transactions.find(t=>!used.includes(t.id));const before=(await get()).transactions.length;
  await save({type:'statement_commit',id:statement.id,rowIds:[statement.rows[0].id],links:[{rowId:statement.rows[0].id,transactionId:existing.id}]});
  const saved=(await read()).statements.find(s=>s.id===statement.id);assert.equal(saved.rows[0].status,'linked');assert.equal((await get()).transactions.length,before);
  const wrong=(await save({type:'statement_create',name:'Wrong link',accountId:bank,rows:[{...draft,poisha:1}]})).statements.find(s=>s.name==='Wrong link');
  await rejects(()=>save({type:'statement_commit',id:wrong.id,rowIds:[wrong.rows[0].id],links:[{rowId:wrong.rows[0].id,transactionId:existing.id}]}),400);
 });
 await check('closing reconciliation is metadata only and changes live when the ledger changes',async()=>{
  let state=await save({type:'statement_reconcile',id:statement.id,date:'2026-11-01',balancePoisha:75310});let detail=state.statements.find(s=>s.id===statement.id);
  assert.equal(detail.reconciled,true);assert.equal(detail.differencePoisha,'0');assert.equal((await get()).transactions.length,2);
  await mutate({type:'transaction_create',transaction:{...draft,description:'Later correction',poisha:1,accountId:bank,status:'confirmed',excluded:false}});
  detail=(await read()).statements.find(s=>s.id===statement.id);assert.equal(detail.reconciled,false);assert.equal(detail.differencePoisha,'-1');
 });
 await check('rules preview read-only and applying changes metadata while preserving financial fields',async()=>{
  const state=await save({type:'rule_create',rule:{name:'Statement rule',active:true,priority:10,conditions:[{field:'description',operator:'contains',value:'statement'}],actions:{notes:'Reviewed by manual rule',excluded:true}}});rule=state.rules[0];
  const before=await get(),beforeWorkbench=await read();const preview=await service.previewRule(a,{ruleId:rule.id});assert.equal(preview.matches.length,2);assert.deepEqual(await get(),before);assert.deepEqual(await read(),beforeWorkbench);
  const selected=preview.matches.map(m=>m.id);await save({type:'rule_apply',id:rule.id,ids:selected},a,randomUUID(),preview.revision);
  const after=await get();for(const id of selected){const old=before.transactions.find(t=>t.id===id),updated=after.transactions.find(t=>t.id===id);assert.equal(updated.notes,'Reviewed by manual rule');assert.equal(updated.excluded,true);assert.deepEqual([updated.poisha,updated.accountId,updated.date,updated.type],[old.poisha,old.accountId,old.date,old.type]);}
  assert.equal((await read()).runs[0].matchedCount,2);
 });
 await check('stale preview, paused rules and foreign selections fail without partial changes',async()=>{
  const preview=await service.previewRule(a,{ruleId:rule.id});await mutate({type:'transaction_bulk_update',ids:[preview.matches[0].id],patch:{notes:'Concurrent edit'}});
  await rejects(()=>save({type:'rule_apply',id:rule.id,ids:preview.matches.map(m=>m.id)},a,randomUUID(),preview.revision),409,'REVISION_CONFLICT');
  await save({type:'rule_update',id:rule.id,rule:{name:rule.name,active:false,priority:rule.priority,conditions:rule.conditions,actions:rule.actions}});
  await rejects(()=>save({type:'rule_apply',id:rule.id,ids:[preview.matches[0].id]}),409,'RULE_PAUSED');
  await rejects(()=>service.previewRule(b,{ruleId:rule.id}),404);await rejects(()=>save({type:'rule_update',id:rule.id,rule:{name:'Foreign',active:true,priority:1,conditions:rule.conditions,actions:rule.actions}},b),404);
 });
 await check('stored JSON corruption and foreign owner references fail closed on snapshots',async()=>{
  const where={userId_id:{userId:ids[0],id:rule.id}};const original=await database.financeRule.findUnique({where});
  await database.financeRule.update({where,data:{actions:{poisha:1}}});await rejects(()=>read(),503,'DATA_INTEGRITY');await database.financeRule.update({where,data:{actions:original.actions}});
  await database.financeRule.update({where,data:{conditions:[{field:'accountId',operator:'equals',value:foreign}]}});await rejects(()=>read(),404,'NOT_FOUND');await database.financeRule.update({where,data:{conditions:original.conditions}});
  const statementWhere={userId_id:{userId:ids[0],id:statement.id}},saved=await database.statementImport.findUnique({where:statementWhere});
  await database.statementImport.update({where:statementWhere,data:{rows:saved.rows.map((row,i)=>i===0?{...row,status:'pending'}:row)}});await rejects(()=>read(),503,'DATA_INTEGRITY');await database.statementImport.update({where:statementWhere,data:{rows:saved.rows}});
 });
}catch(error){console.error('FAIL workbench',error?.code??'ASSERTION_OR_SERVICE',error?.code==='ERR_ASSERTION'?String(error.message).slice(0,800):'Inspect last group; private details withheld.');process.exitCode=1;}finally{if(fixture)await fixture.close();}
console.log(JSON.stringify({groupsPassed:checks.length,checks}));
