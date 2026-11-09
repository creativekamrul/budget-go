import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { automationFixture } from './automation-fixture.mjs';

const base='http://127.0.0.1:3100';
if(process.env.APP_URL!==base||process.env.AUTH_URL!==base)throw new Error('Refusing unsafe core HTTP target.');
class Session {
  cookies=new Map();
  async request(path,{method='GET',body,headers={},origin=true}={}) {
    const merged={...headers};let serialized;
    if(this.cookies.size)merged.cookie=[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    if(method!=='GET'&&origin)merged.origin=base;
    if(body!==undefined){merged['content-type']=body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json';serialized=body instanceof URLSearchParams?body.toString():JSON.stringify(body);}
    const response=await fetch(base+path,{method,headers:merged,body:serialized,redirect:'manual',signal:AbortSignal.timeout(30000)});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');this.cookies.set(pair.slice(0,at),pair.slice(at+1));}
    let data;try{data=await response.json();}catch{data=null;}
    return{status:response.status,data,headers:response.headers};
  }
  async signIn(email,password){const csrf=await this.request('/api/auth/csrf');const result=await this.request('/api/auth/callback/credentials',{method:'POST',headers:{'X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email,password,csrfToken:csrf.data.csrfToken,callbackUrl:base})});assert.ok([200,302].includes(result.status));assert.equal((await this.request('/api/v1/me')).status,200);}
}
const checks=[],clients=[];let fixture,failure=null;
function status(result,expected,code){assert.equal(result.status,expected);if(code)assert.equal(result.data?.error?.code,code);}
async function check(name,action){console.log(`RUN core HTTP ${name}`);await action();checks.push(name);console.log(`PASS core HTTP ${name}`);}
function toolValue(result){assert.equal(result.isError??false,false);return JSON.parse(result.content.find(c=>c.type==='text').text);}
try{
  fixture=await automationFixture('core_http');
  const {ids,password,a,b,get,mutate,database}=fixture;
  const session=new Session(),other=new Session(),anonymous=new Session();
  await session.signIn(`${ids[0]}@example.invalid`,password);await other.signIn(`${ids[1]}@example.invalid`,password);
  const accountId=(await mutate({type:'account_create',account:{name:'HTTP core bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:100000}})).accounts[0].id;
  const foreignAccount=(await mutate({type:'account_create',account:{name:'Other HTTP bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:0}},b)).accounts[0].id;
  const entry=(description,poisha=10000,account=accountId)=>({accountId:account,description,type:'expense',category:'Shopping',categoryId:null,date:'2026-11-01',poisha,merchantId:null,tagIds:[],notes:'',status:'confirmed',excluded:false});
  const write=async(path,command,{owner=session,requestId=randomUUID(),revision}={})=>owner.request(path,{method:'POST',body:{expectedRevision:revision??(await owner.request('/api/v4/workspace')).data.revision,requestId,command}});
  let token,readToken,splitOriginal,sdk,scheduleId;
  await check('planning reads and session writes enforce authentication origin and source ownership',async()=>{
    status(await anonymous.request('/api/v3/planning'),401);
    const plans=await session.request('/api/v3/planning');status(plans,200);assert.equal(plans.headers.get('cache-control'),'no-store');assert.deepEqual(plans.data.recurring,[]);
    const rejected=await session.request('/api/v3/planning',{method:'POST',origin:false,body:{expectedRevision:plans.data.revision,requestId:randomUUID(),command:{type:'monthly_plan_set',month:'2026-11',incomePoisha:0,spendingPoisha:0}}});status(rejected,403,'INVALID_ORIGIN');
    status(await write('/api/v3/planning',{type:'monthly_plan_set',month:'2026-11',incomePoisha:500000,spendingPoisha:200000}),200);
    assert.equal((await other.request('/api/v3/planning')).data.monthlyPlans.length,0);
    const minted=await session.request('/api/v1/tokens',{method:'POST',body:{name:'Core write',scopes:['finance:read','finance:write'],expiresInDays:1}});status(minted,201);token=minted.data;
    const read=await session.request('/api/v1/tokens',{method:'POST',body:{name:'Core read',scopes:['finance:read'],expiresInDays:1}});status(read,201);readToken=read.data;
  });
  await check('REST bulk and exact-total split persist once with all-or-nothing selection',async()=>{
    status(await write('/api/v4/workspace',{type:'transaction_create',transaction:entry('Combined HTTP purchase')}),200);
    status(await write('/api/v4/workspace',{type:'transaction_create',transaction:entry('Other HTTP purchase',3000)}),200);
    const state=(await session.request('/api/v4/workspace')).data;splitOriginal=state.transactions.find(t=>t.description==='Combined HTTP purchase').id;
    const foreign=(await mutate({type:'transaction_create',transaction:entry('Foreign HTTP entry',1000,foreignAccount)},b)).transactions[0].id;
    status(await write('/api/v4/workspace',{type:'transaction_bulk_update',ids:[splitOriginal,foreign],patch:{notes:'No partial update'}}),404,'NOT_FOUND');
    assert.deepEqual((await session.request('/api/v4/workspace')).data,state);
    status(await write('/api/v4/workspace',{type:'transaction_bulk_update',ids:state.transactions.map(t=>t.id),patch:{notes:'Selected together'}}),200);
    const before=await get();const envelope={expectedRevision:before.revision,requestId:randomUUID(),command:{type:'transaction_split',id:splitOriginal,parts:[{description:'HTTP food',category:'Groceries',categoryId:null,poisha:6000},{description:'HTTP lunch',category:'Dining',categoryId:null,poisha:4000}]}};
    const first=await session.request('/api/v4/workspace',{method:'POST',body:envelope});status(first,200);
    const replay=await session.request('/api/v4/workspace',{method:'POST',body:envelope});status(replay,200);assert.deepEqual(replay.data,first.data);
    assert.equal(first.data.transactions.reduce((sum,t)=>sum+t.poisha,0),13000);
    const audit=(await session.request('/api/v3/planning')).data.splits[0];assert.equal(audit.partIds[0],splitOriginal);assert.equal(audit.original.poisha,10000);
  });
  await check('official MCP planning tools create and record one REST-visible recurring occurrence',async()=>{
    sdk=new Client({name:'core-http-acceptance',version:'1'});clients.push(sdk);
    await sdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base),{requestInit:{headers:{authorization:`Bearer ${token.token}`}}}));
    const tools=await sdk.listTools();assert.equal(tools.tools.length,22);assert.ok(tools.tools.some(t=>t.name==='planning_get'));assert.ok(tools.tools.some(t=>t.name==='planning_mutate'));
    const current=toolValue(await sdk.callTool({name:'planning_get',arguments:{}}));
    const schedule={name:'HTTP rent',transaction:{accountId,description:'HTTP monthly rent',type:'expense',category:'Home',categoryId:null,poisha:5000,merchantId:null,tagIds:[],notes:'',status:'confirmed',excluded:false},startDate:'2026-01-31',frequency:'monthly',active:true};
    const created=toolValue(await sdk.callTool({name:'planning_mutate',arguments:{expectedRevision:current.revision,requestId:randomUUID(),command:{type:'recurring_create',schedule}}}));scheduleId=created.recurring[0].id;
    const envelope={expectedRevision:created.revision,requestId:randomUUID(),command:{type:'recurring_record',id:scheduleId,date:'2026-02-28'}};
    const recorded=toolValue(await sdk.callTool({name:'planning_mutate',arguments:envelope}));const replay=toolValue(await sdk.callTool({name:'planning_mutate',arguments:envelope}));assert.deepEqual(replay,recorded);
    const fromREST=(await session.request('/api/v3/planning')).data;assert.deepEqual(fromREST,recorded);assert.equal(recorded.occurrences.length,1);
    const occurrence=recorded.occurrences[0];const finances=(await session.request('/api/v4/workspace')).data;assert.equal(finances.transactions.find(t=>t.id===occurrence.transactionId).poisha,5000);
    status(await write('/api/v3/planning',{type:'recurring_record',id:scheduleId,date:'2026-02-28'}),200);assert.equal((await session.request('/api/v3/planning')).data.occurrences.length,1);
    status(await write('/api/v3/planning',{type:'recurring_archive',id:scheduleId,archived:true},{owner:other}),404,'NOT_FOUND');
  });
  await check('read-only and revoked bearer clients cannot mutate planning or reuse previous writes',async()=>{
    const bearer=async(path,key,body)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${key}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json()};};
    status(await bearer('/api/v3/planning',readToken.token),200);
    status(await bearer('/api/v3/planning',readToken.token,{expectedRevision:(await get()).revision,requestId:randomUUID(),command:{type:'monthly_plan_set',month:'2026-12',incomePoisha:0,spendingPoisha:0}}),403,'INSUFFICIENT_SCOPE');
    status(await session.request(`/api/v1/tokens/${token.metadata.id}`,{method:'DELETE'}),200);
    status(await bearer('/api/v3/planning',token.token),401);
    const count=await database.transaction.count({where:{userId:a.userId}});assert.equal(count,4);
  });
}catch(error){failure={code:/^(P\d{4}|[A-Z_]+)$/.test(error?.code??'')?error.code:'ASSERTION_OR_HTTP',message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,500):'Inspect the last printed group; private HTTP/SDK details withheld.'};console.error(JSON.stringify(failure));process.exitCode=1;}
finally{for(const client of clients)await client.close().catch(()=>{});if(fixture)await fixture.close();await mkdir('artifacts/core',{recursive:true});await writeFile('artifacts/core/http-results.json',JSON.stringify({scope:'Actual isolated Auth.js/REST/scoped bearer/official MCP SDK core acceptance',checks,failure},null,2));}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));
