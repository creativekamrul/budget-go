import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { automationFixture } from './automation-fixture.mjs';

const base='http://127.0.0.1:3100';
if(process.env.APP_URL!==base||process.env.AUTH_URL!==base)throw new Error('Refusing an unsafe automation HTTP target.');
class Session {
  cookies=new Map();
  async request(path,{method='GET',body,headers={},origin=true}={}) {
    const merged={...headers};let serialized;
    if(this.cookies.size)merged.cookie=[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    if(method!=='GET'&&origin)merged.origin=base;
    if(body!==undefined){merged['content-type']=body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json';serialized=body instanceof URLSearchParams?body.toString():JSON.stringify(body);}
    const response=await fetch(base+path,{method,headers:merged,body:serialized,redirect:'manual',signal:AbortSignal.timeout(30000)});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');this.cookies.set(pair.slice(0,index),pair.slice(index+1));}
    let data;try{data=await response.json();}catch{data=null;}
    return{status:response.status,data,headers:response.headers};
  }
  async signIn(email,password){const csrf=await this.request('/api/auth/csrf');const result=await this.request('/api/auth/callback/credentials',{method:'POST',headers:{'X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email,password,csrfToken:csrf.data.csrfToken,callbackUrl:base})});assert.ok([200,302].includes(result.status));assert.equal((await this.request('/api/v1/me')).status,200);}
}
const checks=[],clients=[];let fixture,failure=null;
function status(result,code,error){assert.equal(result.status,code);if(error)assert.equal(result.data?.error?.code,error);}
async function check(name,action){console.log(`RUN automation HTTP ${name}`);await action();checks.push(name);console.log(`PASS automation HTTP ${name}`);}
const value=result=>{assert.equal(result.isError??false,false);return JSON.parse(result.content.find(c=>c.type==='text').text);};
try {
  fixture=await automationFixture('automation_http');
  const{ids,password,mutate,get,auto,database}=fixture;
  const session=new Session(),other=new Session(),anonymous=new Session();
  await session.signIn(`${ids[0]}@example.invalid`,password);await other.signIn(`${ids[1]}@example.invalid`,password);
  const accountId=(await mutate({type:'account_create',account:{name:'HTTP BDT bank',kind:'bank',openingDate:'2026-11-01',openingPoisha:100000}})).accounts[0].id;
  const command=async cmd=>session.request('/api/v3/automation',{method:'POST',body:{expectedRevision:(await auto()).revision,requestId:randomUUID(),command:cmd}});
  let source,token,readonly,event,ingestInput,sdk;
  await check('authenticated parse is read-only and unsafe cookie writes or secret alerts are rejected',async()=>{
    status(await anonymous.request('/api/v3/automation'),401);
    status(await session.request('/api/v3/automation/parse',{method:'POST',origin:false,body:{rawText:'debited BDT 100 on 2026-11-08'}}),403,'INVALID_ORIGIN');
    const before=await get();
    const preview=await session.request('/api/v3/automation/parse',{method:'POST',body:{rawText:'debited BDT ১২৫.৫০ on ০৮/১১/২০২৬'}});
    status(preview,200);assert.equal(preview.data.draft.poisha,12550);assert.deepEqual(await get(),before);assert.equal((await auto()).eventTotal,0);
    status(await session.request('/api/v3/automation/parse',{method:'POST',body:{rawText:'Your OTP 123456'}}),400);
  });
  await check('real session configures a source and scoped integration tokens',async()=>{
    const created=await command({type:'source_create',source:{name:'n8n Bank email',channel:'email',providerLabel:'Bank notification',accountId,enabled:true}});status(created,200);source=created.data.sources[0];
    const minted=await session.request('/api/v1/tokens',{method:'POST',body:{name:'Disposable n8n',scopes:['finance:read','finance:write'],expiresInDays:1}});status(minted,201);token=minted.data;
    const read=await session.request('/api/v1/tokens',{method:'POST',body:{name:'Disposable read',scopes:['finance:read'],expiresInDays:1}});status(read,201);readonly=read.data;
    const denied=await other.request('/api/v3/automation',{method:'POST',body:{expectedRevision:(await auto(fixture.b)).revision,requestId:randomUUID(),command:{type:'source_update',id:source.id,source:{...source,id:undefined}}}});
    status(denied,404,'NOT_FOUND');
    assert.equal((await other.request('/api/v3/automation')).data.sources.length,0);
  });
  const bearer=async(path,body,key=token.token)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${key}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,data:await response.json(),headers:response.headers};};
  await check('n8n-style bearer intake stages once and rejects changed external-ID replay',async()=>{
    ingestInput={sourceId:source.id,externalId:'mail-provider-message-001',rawText:'Account debited BDT 125.50 on 2026-11-08. Ref HTTP001',draft:{category:'Groceries'}};
    const created=await bearer('/api/v3/ingest',ingestInput);status(created,200);event=created.data.event;
    assert.equal(event.rawText,null);assert.equal(created.headers.get('cache-control'),'no-store');assert.equal((await get()).transactions.length,0);
    const replay=await bearer('/api/v3/ingest',ingestInput);status(replay,200);assert.equal(replay.data.event.id,event.id);assert.equal(replay.data.replayed,true);
    status(await bearer('/api/v3/ingest',{...ingestInput,externalId:'readonly'},readonly.token),403,'INSUFFICIENT_SCOPE');
    status(await bearer('/api/v3/ingest',{...ingestInput,reference:'CHANGED'}),409,'IDEMPOTENCY_CONFLICT');
    status(await bearer('/api/v3/ingest',{...ingestInput,draft:{accountId:'foreign-account'}}),409,'IDEMPOTENCY_CONFLICT');
  });
  await check('official MCP SDK reads parses ingests and accepts the same REST-visible event exactly once',async()=>{
    sdk=new Client({name:'automation-acceptance',version:'1'});clients.push(sdk);
    await sdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base),{requestInit:{headers:{authorization:`Bearer ${token.token}`}}}));
    const tools=await sdk.listTools();assert.equal(tools.tools.length,22);
    assert.equal(value(await sdk.callTool({name:'alert_parse',arguments:{rawText:'credited Tk 50 on 2026-11-08'}})).draft.poisha,5000);
    assert.equal(value(await sdk.callTool({name:'alert_ingest',arguments:ingestInput})).event.id,event.id);
    const current=value(await sdk.callTool({name:'automation_get',arguments:{}}));
    const envelope={expectedRevision:current.revision,requestId:randomUUID(),command:{type:'event_accept',id:event.id,acknowledgeDuplicate:false}};
    const accepted=value(await sdk.callTool({name:'automation_mutate',arguments:envelope}));assert.equal(accepted.events.find(e=>e.id===event.id).status,'accepted');
    const replay=value(await sdk.callTool({name:'automation_mutate',arguments:envelope}));assert.equal(replay.revision,accepted.revision);
    const finances=await bearer('/api/v4/workspace');status(finances,200);assert.equal(finances.data.transactions.length,1);assert.equal(finances.data.transactions[0].poisha,12550);
    assert.equal(finances.data.transactions[0].id,accepted.events.find(e=>e.id===event.id).transactionId);
  });
  await check('revoked integration credentials cannot reuse a staged intake or MCP operation',async()=>{
    status(await session.request(`/api/v1/tokens/${token.metadata.id}`,{method:'DELETE'}),200);
    status(await bearer('/api/v3/ingest',ingestInput),401);
    status(await bearer('/api/v3/automation'),401);
    assert.equal(await database.transaction.count({where:{userId:ids[0]}}),1);
  });
} catch(error){failure={code:/^(P\d{4}|[A-Z_]+)$/.test(error?.code??'')?error.code:'ASSERTION_OR_HTTP',message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,400):'Inspect the last printed group; private transport errors withheld.'};console.error(JSON.stringify(failure));process.exitCode=1;}
finally{for(const client of clients)await client.close().catch(()=>{});if(fixture)await fixture.close();await mkdir('artifacts/automation',{recursive:true});await writeFile('artifacts/automation/http-results.json',JSON.stringify({scope:'Actual isolated HTTP/Auth.js/scoped bearer and official MCP SDK; not external n8n runtime',checks,failure},null,2));}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));
