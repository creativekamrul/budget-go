import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { automationFixture } from './automation-fixture.mjs';

const checks=[];let fixture,failure=null;
const rejects=(action,status,code)=>assert.rejects(action,error=>error?.status===status&&(!code||error.code===code));
async function check(name,action){console.log(`RUN automation service ${name}`);await action();checks.push(name);console.log(`PASS automation service ${name}`);}
try {
  fixture=await automationFixture();
  const {database,ids,a,b,get,auto,mutate,configure,automation}=fixture;
  const contract=await tsImport('../lib/automation.ts',import.meta.url);
  let workspace=await mutate({type:'account_create',account:{name:'Disposable BDT bank',kind:'bank',openingDate:'2026-11-01',openingPoisha:100000}});
  const accountId=workspace.accounts[0].id;
  const foreignAccount=(await mutate({type:'account_create',account:{name:'Other owner bank',kind:'bank',openingDate:'2026-11-01',openingPoisha:0}},b)).accounts[0].id;
  const draft={...contract.emptyAutomationDraft(),accountId,description:'Reviewed bank purchase',type:'expense',category:'Groceries',date:'2026-11-08',poisha:12550};
  const sourceFields={name:'Bank SMS',channel:'sms',providerLabel:'Manual bank alert',accountId,enabled:true};
  let source,email,event;
  await check('preferences and source configuration enforce ownership revisions and atomic validation',async()=>{
    assert.deepEqual((await auto()).preferences,contract.defaultPreferences());
    const before=await auto();
    await rejects(()=>configure({type:'source_create',source:{...sourceFields,accountId:foreignAccount}}),404);
    assert.deepEqual(await auto(),before);
    let saved=await configure({type:'source_create',source:sourceFields});source=saved.sources[0];
    await configure({type:'source_create',source:{...sourceFields,name:'Bank Email',channel:'email'}});email=(await auto()).sources.find(s=>s.channel==='email');
    await rejects(()=>configure({type:'source_update',id:source.id,source:sourceFields},b),404);
    await rejects(()=>configure({type:'source_create',source:{...sourceFields,name:'bank sms'}}),409,'NAME_EXISTS');
    saved=await configure({type:'preferences_update',preferences:{...saved.preferences,locale:'bn-BD',density:'compact',weekStart:'mon',fiscalYearStartMonth:4}});
    assert.equal(saved.preferences.locale,'bn-BD');assert.equal(saved.preferences.fiscalYearStartMonth,4);
    await rejects(()=>configure({type:'preferences_update',preferences:saved.preferences},a,randomUUID(),before.revision),409,'REVISION_CONFLICT');
  });
  await check('concurrent intake retries return one staged event and never post money',async()=>{
    const input={sourceId:source.id,externalId:'sms-message-1',rawText:'Account debited BDT 125.50 on 08/11/2026. Available balance BDT 900.00. Ref BDREF001',draft:{category:'Groceries'}};
    const before=await get();
    const results=await Promise.all([automation.ingestAlert(a,input),automation.ingestAlert(a,input)]);
    assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
    assert.equal(results[0].event.id,results[1].event.id);event=results[0].event;
    assert.equal(event.rawText,null);assert.equal(event.draft.poisha,12550);assert.equal(event.draft.date,'2026-11-08');
    assert.equal((await get()).transactions.length,before.transactions.length);
    assert.equal((await get()).revision,before.revision+1);
    await rejects(()=>automation.ingestAlert(a,{...input,rawText:input.rawText+' Changed'}),409,'IDEMPOTENCY_CONFLICT');
    await rejects(()=>automation.ingestAlert(b,input),404);
    await rejects(()=>automation.ingestAlert({...a,scopes:['finance:read']},{...input,externalId:'readonly'}),403);
    assert.equal((await auto()).events.length,1);
  });
  await check('review edits validate ownership and replay-safe acceptance posts exactly once',async()=>{
    await configure({type:'event_update',id:event.id,draft});
    const before=await auto(),requestId=randomUUID();
    const command={type:'event_accept',id:event.id,acknowledgeDuplicate:false};
    await Promise.all([automation.mutateAutomation(a,before.revision,requestId,command),automation.mutateAutomation(a,before.revision,requestId,command)]);
    const saved=await get();assert.equal(saved.transactions.length,1);assert.equal(saved.transactions[0].poisha,12550);
    assert.equal(saved.revision,before.revision+1);assert.equal((await auto()).events.find(e=>e.id===event.id).transactionId,saved.transactions[0].id);
    const accepted=await configure(command);assert.equal(accepted.revision,saved.revision);assert.equal((await get()).transactions.length,1);
    await rejects(()=>configure({type:'event_ignore',id:event.id,ignored:true}),409,'ALREADY_ACCEPTED');
    await rejects(()=>configure(command,b),404);
    await rejects(()=>automation.mutateAutomation(a,saved.revision,requestId,{...command,acknowledgeDuplicate:true}),409,'IDEMPOTENCY_CONFLICT');
  });
  await check('cross-channel bank references and possible posted duplicates require deliberate acknowledgement',async()=>{
    const received=await automation.ingestAlert(a,{sourceId:email.id,externalId:'email-message-1',reference:'bdref001',draft});
    assert.equal(received.event.duplicateOfEventId,event.id);assert.ok(received.event.duplicateTransactionIds.length);
    const before=await get();
    await rejects(()=>configure({type:'event_accept',id:received.event.id,acknowledgeDuplicate:false}),409,'DUPLICATE_REVIEW_REQUIRED');
    assert.deepEqual(await get(),before);
    await configure({type:'event_accept',id:received.event.id,acknowledgeDuplicate:true});assert.equal((await get()).transactions.length,2);
    const possible=await automation.ingestAlert(a,{sourceId:source.id,externalId:'legitimate-same-amount',draft});
    assert.ok(possible.event.duplicateTransactionIds.length>=2);
    await rejects(()=>configure({type:'event_accept',id:possible.event.id}),409,'DUPLICATE_REVIEW_REQUIRED');
    await configure({type:'event_ignore',id:possible.event.id,ignored:true});
    await rejects(()=>configure({type:'event_accept',id:possible.event.id}),409,'EVENT_IGNORED');
    assert.equal((await configure({type:'event_ignore',id:possible.event.id,ignored:false})).events.find(e=>e.id===possible.event.id).status,'needs_review','Restored duplicate candidates still require human review');
  });
  await check('raw-message retention is opt-in and security-code bypasses are rejected without writes',async()=>{
    let settings=(await auto()).preferences;
    await configure({type:'preferences_update',preferences:{...settings,storeRawMessages:true}});
    const input={sourceId:source.id,externalId:'retained-message',rawText:'Credited Tk 50.00 on 2026-11-08. Ref SAFE0001'};
    const retained=await automation.ingestAlert(a,input);assert.equal(retained.event.rawText,input.rawText);
    for(const body of [{sourceId:source.id,externalId:'otp',rawText:'OTP 123456'},{sourceId:source.id,externalId:'structured-secret',draft:{...draft,notes:'PIN: 1234'}}]) await rejects(()=>automation.ingestAlert(a,body),400);
    const before=await auto();
    await rejects(()=>configure({type:'event_update',id:retained.event.id,draft:{...draft,description:'OTP 123456'}}),400);
    assert.deepEqual(await auto(),before);
    await rejects(()=>configure({type:'event_update',id:retained.event.id,draft:{...draft,accountId:foreignAccount}}),404);
    settings=(await auto()).preferences;
    await configure({type:'preferences_update',preferences:{...settings,storeRawMessages:false}});
    assert.ok((await auto()).events.every(e=>e.rawText===null));
  });
  await check('paused intake archived accounts and revoked sessions do not bypass posting safeguards',async()=>{
    const settings=(await auto()).preferences;
    await configure({type:'preferences_update',preferences:{...settings,automationEnabled:false}});
    await rejects(()=>automation.ingestAlert(a,{sourceId:source.id,externalId:'paused',draft}),409,'AUTOMATION_PAUSED');
    await configure({type:'preferences_update',preferences:{...settings,automationEnabled:true}});
    await configure({type:'source_update',id:source.id,source:{...sourceFields,enabled:false}});
    await rejects(()=>automation.ingestAlert(a,{sourceId:source.id,externalId:'disabled',draft}),409,'SOURCE_DISABLED');
    await configure({type:'source_update',id:source.id,source:sourceFields});
    const received=await automation.ingestAlert(a,{sourceId:source.id,externalId:'archive-later',draft:{...draft,poisha:999}});
    await mutate({type:'account_archive',id:accountId,archived:true});
    assert.equal((await auto()).events.find(e=>e.id===received.event.id).status,'needs_review');
    await rejects(()=>configure({type:'event_accept',id:received.event.id}),400);
    await configure({type:'source_update',id:source.id,source:{...sourceFields,enabled:false}});
    assert.equal((await auto()).sources.find(s=>s.id===source.id).enabled,false,'An archived account binding can still be paused');
    await mutate({type:'account_archive',id:accountId,archived:false});
    await configure({type:'source_update',id:source.id,source:sourceFields});
    await database.user.update({where:{id:ids[0]},data:{active:false}});
    await rejects(()=>automation.getAutomation(a),401);
    await rejects(()=>automation.ingestAlert(a,{sourceId:source.id,externalId:'archive-later',draft:{...draft,poisha:999}}),401);
    await database.user.update({where:{id:ids[0]},data:{active:true}});
  });
  await check('financial safety-limit rejection rolls back the staged acceptance and receipt',async()=>{
    const received=await automation.ingestAlert(a,{sourceId:source.id,externalId:'unsafe-total',draft:{...draft,poisha:Number.MAX_SAFE_INTEGER}});
    const before=await get(),beforeInbox=await auto(),requestId=randomUUID();
    await rejects(()=>configure({type:'event_accept',id:received.event.id},a,requestId),400,'INVALID_REQUEST');
    assert.deepEqual(await get(),before);assert.deepEqual(await auto(),beforeInbox);
    assert.equal(await database.requestReceipt.count({where:{userId:ids[0],requestId}}),0);
  });
  await check('bounded cursor pagination exposes older events without crossing owners',async()=>{
    await database.automationEvent.createMany({data:Array.from({length:205},(_,i)=>({userId:ids[0],id:randomUUID(),sourceId:source.id,externalId:`page-${i}`,payloadHash:'fixture',reference:'',draft,status:'ready',issues:[],receivedAt:new Date(Date.UTC(2026,10,1,0,0,i))}))});
    const first=await auto();assert.equal(first.events.length,200);assert.ok(first.nextCursor);assert.ok(first.eventTotal>205);
    const second=await automation.getAutomation(a,first.nextCursor);
    assert.ok(second.events.length>0);assert.equal(second.nextCursor,null);
    assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,first.eventTotal);
    assert.equal((await auto(b)).eventTotal,0);
    await rejects(()=>automation.getAutomation(b,first.nextCursor),404);
  });
} catch(error) {failure={code:/^(P\d{4}|[A-Z_]+)$/.test(error?.code??'')?error.code:'ASSERTION_OR_SERVICE',message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,400):'Inspect the last printed group; private error details withheld.'};console.error(JSON.stringify(failure));process.exitCode=1;}
finally {
  if(fixture)await fixture.close();
  await mkdir('artifacts/automation',{recursive:true});await writeFile('artifacts/automation/service-results.json',JSON.stringify({scope:'Guarded disposable PostgreSQL automation acceptance',checks,failure},null,2));
}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));
