// Real Auth.js, scoped bearer REST and official MCP SDK against the guarded
// disposable database and isolated port3100 app. Never reads the real .env.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { automationFixture } from './automation-fixture.mjs';
const base='http://127.0.0.1:3100';
if(process.env.APP_URL!==base||process.env.AUTH_URL!==base)throw new Error('Refusing unsafe workbench HTTP target.');
class Session{
 cookies=new Map();
 async request(path,{method='GET',body,headers={},origin=true}={}){
  const merged={...headers};let serialized;
  if(this.cookies.size)merged.cookie=[...this.cookies].map(([key,value])=>`${key}=${value}`).join('; ');
  if(method!=='GET'&&origin)merged.origin=base;
  if(body!==undefined){merged['content-type']=body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json';serialized=body instanceof URLSearchParams?body.toString():JSON.stringify(body);}
  const response=await fetch(base+path,{method,headers:merged,body:serialized,redirect:'manual',signal:AbortSignal.timeout(30000)});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');this.cookies.set(pair.slice(0,at),pair.slice(at+1));}
  let data;try{data=await response.json();}catch{data=null;}
  return{status:response.status,data,headers:response.headers};
 }
 async signIn(email,password){const csrf=await this.request('/api/auth/csrf');assert.equal(csrf.status,200);const result=await this.request('/api/auth/callback/credentials',{method:'POST',headers:{'X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email,password,csrfToken:csrf.data.csrfToken,callbackUrl:base})});assert.ok([200,302].includes(result.status));assert.equal((await this.request('/api/v1/me')).status,200);}
}
async function bearer(path,key,body){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${key}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});let data;try{data=await response.json();}catch{data=null;}return{status:response.status,data,headers:response.headers};}
const checks=[],clients=[];let fixture,failure=null;
function status(result,expected,code){assert.equal(result.status,expected);if(code)assert.equal(result.data?.error?.code,code);}
async function check(name,action){console.log(`RUN workbench HTTP ${name}`);await action();checks.push(name);console.log(`PASS workbench HTTP ${name}`);}
function toolValue(result){assert.equal(result.isError??false,false);return JSON.parse(result.content.find(c=>c.type==='text').text);}
function toolError(result,code){assert.equal(result.isError,true);assert.equal(JSON.parse(result.content.find(c=>c.type==='text').text).error.code,code);}
try{
 fixture=await automationFixture('workbench_http');
 const {ids,password,b,get,mutate,database}=fixture;
 const session=new Session(),other=new Session(),anonymous=new Session();
 await session.signIn(`${ids[0]}@example.invalid`,password);await other.signIn(`${ids[1]}@example.invalid`,password);
 const accountId=(await mutate({type:'account_create',account:{name:'HTTP statement bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:100000}})).accounts[0].id;
 const foreignAccount=(await mutate({type:'account_create',account:{name:'Other statement bank',kind:'bank',openingDate:'2026-01-01',openingPoisha:0}},b)).accounts[0].id;
 const draft={date:'2026-11-01',description:'HTTP statement expense',type:'expense',category:'Groceries',categoryId:null,poisha:12345};
 const write=async(command,{owner=session,requestId=randomUUID(),revision}={})=>owner.request('/api/v4/workbench',{method:'POST',body:{expectedRevision:revision??(await owner.request('/api/v4/workbench')).data.revision,requestId,command}});
 let token,readToken,statement,rule,sdk,readSdk,foreignSdk,applyEnvelope;
 await check('authenticated workbench reads and cookie writes enforce origin and ownership',async()=>{
  status(await anonymous.request('/api/v4/workbench'),401);
  status(await anonymous.request('/api/v4/workbench/preview',{method:'POST',body:{ruleId:'missing'}}),401);
  const current=await session.request('/api/v4/workbench');status(current,200);assert.equal(current.headers.get('cache-control'),'no-store');assert.deepEqual(current.data.statements,[]);
  const envelope={expectedRevision:current.data.revision,requestId:randomUUID(),command:{type:'statement_create',name:'HTTP CSV',accountId,rows:[draft]}};
  status(await session.request('/api/v4/workbench',{method:'POST',body:envelope,origin:false}),403,'INVALID_ORIGIN');
  status(await write({type:'statement_create',name:'Foreign account',accountId:foreignAccount,rows:[draft]}),404,'NOT_FOUND');
  const created=await session.request('/api/v4/workbench',{method:'POST',body:envelope});status(created,200);statement=created.data.statements[0];
  assert.equal((await get()).transactions.length,0);assert.equal((await other.request('/api/v4/workbench')).data.statements.length,0);
  status(await write({type:'statement_commit',id:statement.id,rowIds:[statement.rows[0].id]},{owner:other}),404,'NOT_FOUND');
  const minted=await session.request('/api/v1/tokens',{method:'POST',body:{name:'Workbench HTTP write',scopes:['finance:read','finance:write'],expiresInDays:1}});status(minted,201);token=minted.data;
  const read=await session.request('/api/v1/tokens',{method:'POST',body:{name:'Workbench HTTP read',scopes:['finance:read'],expiresInDays:1}});status(read,201);readToken=read.data;
 });
 await check('REST imports and closing metadata replay without another financial posting',async()=>{
  const envelope={expectedRevision:(await get()).revision,requestId:randomUUID(),command:{type:'statement_commit',id:statement.id,rowIds:[statement.rows[0].id]}};
  const first=await session.request('/api/v4/workbench',{method:'POST',body:envelope});status(first,200);
  const replay=await session.request('/api/v4/workbench',{method:'POST',body:envelope});status(replay,200);assert.deepEqual(replay.data,first.data);
  assert.equal((await get()).transactions.length,1);assert.equal((await get()).transactions[0].poisha,12345);
  const closing=await write({type:'statement_reconcile',id:statement.id,date:'2026-11-01',balancePoisha:87655});status(closing,200);assert.equal(closing.data.statements[0].reconciled,true);assert.equal(closing.data.statements[0].differencePoisha,'0');
  assert.equal((await get()).adjustments.length,0);assert.equal((await get()).transactions.length,1);
 });
 await check('read-scoped bearer preview is read-only while mutations and cross-owner previews are refused',async()=>{
  const created=await write({type:'rule_create',rule:{name:'HTTP reviewed rule',active:true,priority:10,conditions:[{field:'description',operator:'contains',value:'statement'}],actions:{notes:'Reviewed over HTTP',excluded:true}}});status(created,200);rule=created.data.rules[0];
  const before=(await session.request('/api/v4/workbench')).data,finances=await get();
  status(await bearer('/api/v4/workbench',readToken.token),200);
  const preview=await bearer('/api/v4/workbench/preview',readToken.token,{ruleId:rule.id});status(preview,200);assert.equal(preview.data.matches.length,1);assert.equal(preview.data.matches[0].after.notes,'Reviewed over HTTP');
  assert.deepEqual((await session.request('/api/v4/workbench')).data,before);assert.deepEqual(await get(),finances);
  status(await session.request('/api/v4/workbench/preview',{method:'POST',origin:false,body:{ruleId:rule.id}}),403,'INVALID_ORIGIN');
  status(await other.request('/api/v4/workbench/preview',{method:'POST',body:{ruleId:rule.id}}),404,'NOT_FOUND');
  applyEnvelope={expectedRevision:preview.data.revision,requestId:randomUUID(),command:{type:'rule_apply',id:rule.id,ids:preview.data.matches.map(m=>m.id)}};
  status(await bearer('/api/v4/workbench',readToken.token,applyEnvelope),403,'INSUFFICIENT_SCOPE');
 });
 await check('official MCP SDK exposes all workbench tools and shares selected apply and replay with REST',async()=>{
  sdk=new Client({name:'workbench-http-acceptance',version:'1'});clients.push(sdk);await sdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base),{requestInit:{headers:{authorization:`Bearer ${token.token}`}}}));
  const listed=(await sdk.listTools()).tools;for(const name of ['workbench_get','workbench_preview','workbench_mutate'])assert.ok(listed.some(t=>t.name===name));
  assert.equal(listed.find(t=>t.name==='workbench_preview').annotations.readOnlyHint,true);
  const before=toolValue(await sdk.callTool({name:'workbench_get',arguments:{}}));assert.deepEqual(before,(await session.request('/api/v4/workbench')).data);
  const preview=toolValue(await sdk.callTool({name:'workbench_preview',arguments:{ruleId:rule.id}}));assert.equal(preview.matches.length,1);assert.deepEqual(toolValue(await sdk.callTool({name:'workbench_get',arguments:{}})),before);
  const applied=toolValue(await sdk.callTool({name:'workbench_mutate',arguments:applyEnvelope}));assert.equal(applied.runs.length,1);assert.equal(applied.runs[0].matchedCount,1);
  assert.deepEqual(toolValue(await sdk.callTool({name:'workbench_mutate',arguments:applyEnvelope})),applied);
  const rest=await session.request('/api/v4/workbench',{method:'POST',body:applyEnvelope});status(rest,200);assert.deepEqual(rest.data,applied);
  const entries=(await get()).transactions;assert.equal(entries.length,1);assert.equal(entries[0].notes,'Reviewed over HTTP');assert.equal(entries[0].poisha,12345);assert.equal(entries[0].accountId,accountId);
 });
 await check('read-only and foreign MCP clients cannot apply or preview another owner rule',async()=>{
  readSdk=new Client({name:'workbench-read-acceptance',version:'1'});clients.push(readSdk);await readSdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base),{requestInit:{headers:{authorization:`Bearer ${readToken.token}`}}}));
  assert.equal(toolValue(await readSdk.callTool({name:'workbench_preview',arguments:{ruleId:rule.id}})).matches.length,1);
  toolError(await readSdk.callTool({name:'workbench_mutate',arguments:applyEnvelope}),'INSUFFICIENT_SCOPE');
  const minted=await other.request('/api/v1/tokens',{method:'POST',body:{name:'Foreign workbench',scopes:['finance:read','finance:write'],expiresInDays:1}});status(minted,201);
  foreignSdk=new Client({name:'workbench-foreign-acceptance',version:'1'});clients.push(foreignSdk);await foreignSdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base),{requestInit:{headers:{authorization:`Bearer ${minted.data.token}`}}}));
  toolError(await foreignSdk.callTool({name:'workbench_preview',arguments:{ruleId:rule.id}}),'NOT_FOUND');
  toolError(await foreignSdk.callTool({name:'workbench_mutate',arguments:{...applyEnvelope,expectedRevision:(await other.request('/api/v4/workbench')).data.revision,requestId:randomUUID()}}),'NOT_FOUND');
  assert.equal((await session.request('/api/v4/workbench')).data.runs.length,1);
 });
 await check('profile security and full backups require browser sessions and trusted POST origins',async()=>{
  for(const path of ['/api/v4/profile','/api/v4/backup']){
   status(await bearer(path,token.token),403,'SESSION_REQUIRED');
   status(await anonymous.request(path),401,'UNAUTHORIZED');
  }
  for(const path of ['/api/v4/profile','/api/v4/security','/api/v4/backup/validate','/api/v4/backup/restore']){
   status(await bearer(path,token.token,{}),403,'SESSION_REQUIRED');
   status(await anonymous.request(path,{method:'POST',body:{}}),401,'UNAUTHORIZED');
   status(await session.request(path,{method:'POST',body:{},origin:false}),403,'INVALID_ORIGIN');
   status(await session.request(path,{method:'POST',body:{},origin:false,headers:{origin:'https://untrusted.example.invalid'}}),403,'INVALID_ORIGIN');
  }
 });
 await check('revocation blocks replay before request receipts can return saved workbench state',async()=>{
  status(await session.request(`/api/v1/tokens/${token.metadata.id}`,{method:'DELETE'}),200);
  status(await bearer('/api/v4/workbench',token.token),401);status(await bearer('/api/v4/workbench',token.token,applyEnvelope),401);
  assert.equal(await database.ruleRun.count({where:{userId:ids[0]}}),1);assert.equal(await database.transaction.count({where:{userId:ids[0]}}),1);
 });
}catch(error){failure={code:/^(P\d{4}|[A-Z_]+)$/.test(error?.code??'')?error.code:'ASSERTION_OR_HTTP',message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,500):'Inspect the last printed group; private HTTP/SDK details withheld.'};console.error(JSON.stringify(failure));process.exitCode=1;}
finally{for(const client of clients)await client.close().catch(()=>{});if(fixture)await fixture.close();await mkdir('artifacts/finish',{recursive:true});await writeFile('artifacts/finish/workbench-http-results.json',JSON.stringify({scope:'Actual isolated Auth.js/REST/scoped bearer/official MCP SDK workbench acceptance',checks,failure},null,2));}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));
