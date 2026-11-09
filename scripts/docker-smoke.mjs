// Real Linux-container acceptance only. Creates its own database/network/volume;
// never loads the workspace .env or connects to an operator database.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const image=process.env.BUDGET_GO_DOCKER_TEST_IMAGE??'budget-go:ci';
if(!/^budget-go(?:-[a-z0-9-]+)?:[a-zA-Z0-9_.-]+$/.test(image))throw new Error('Use a locally built budget-go test image; this test never pulls an app image.');
const suffix=randomBytes(6).toString('hex');
const bundled=`budget-go-smoke-${suffix}`,external=`budget-go-smoke-external-${suffix}`;
const root=process.cwd(),temporary=await mkdtemp(path.join(tmpdir(),'budget-go-docker-smoke-'));
const bundledEnv=path.join(temporary,'.env.bundled'),externalEnv=path.join(temporary,'.env.external'),override=path.join(temporary,'external-network.json');
const checks=[],secrets=[];
let failure=null,configured=false,cleaned=true;
function run(args,label,extra={}){
 return new Promise((resolve,reject)=>{
  const env={...process.env,...extra};
  // Only generated private files supply deployment configuration.
  for(const key of ['APP_URL','AUTH_URL','AUTH_SECRET','DATABASE_URL','POSTGRES_PASSWORD','BUDGET_GO_IMAGE','APP_PORT','BIND_ADDRESS','COMPOSE_FILE','COMPOSE_PROJECT_NAME','COMPOSE_PROFILES'])delete env[key];
  const child=spawn('docker',args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{if(output.length<4*1024*1024)output+=chunk.toString();});
  child.once('error',()=>reject(new Error(`${label}: Docker could not start.`)));
  child.once('close',code=>{if(code===0){resolve(output);return;}let safe=output.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,'[redacted database URL]');for(const secret of secrets)safe=safe.replaceAll(secret,'[redacted]');reject(new Error(`${label}: Docker exited ${code}. ${safe.slice(-2500)}`));});
 });
}
const compose=(mode,...args)=>run(['compose','--project-name',mode==='bundled'?bundled:external,'--env-file',mode==='bundled'?bundledEnv:externalEnv,'-f',path.join(root,mode==='bundled'?'compose.yaml':'compose.external.yaml'),...(mode==='external'?['-f',override]:[]),...args],`${mode} ${args[0]}`);
const exec=(mode,args,extra={})=>run(['compose','--project-name',mode==='bundled'?bundled:external,'--env-file',mode==='bundled'?bundledEnv:externalEnv,'-f',path.join(root,mode==='bundled'?'compose.yaml':'compose.external.yaml'),...(mode==='external'?['-f',override]:[]),'exec','-T',...Object.keys(extra).flatMap(key=>['-e',key]),'app',...args],`${mode} operator command`,extra);
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(error=>error?reject(error):resolve(port));});});
async function probe(port){const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'ok');assert.match(data.version,/^\d+\.\d+\.\d+/);assert.deepEqual(Object.keys(data).sort(),['status','version']);const login=await fetch(`http://127.0.0.1:${port}/login`,{signal:AbortSignal.timeout(10000)});assert.equal(login.status,200);assert.match(await login.text(),/Sign in/);const unauthenticated=await fetch(`http://127.0.0.1:${port}/api/v4/workspace`);assert.equal(unauthenticated.status,401);}
async function signInAndRead(port,email,password){
 const base=`http://127.0.0.1:${port}`,cookies=new Map();
 async function request(route,options={}){const response=await fetch(base+route,{...options,headers:{...options.headers,...(cookies.size?{cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{})},redirect:'manual',signal:AbortSignal.timeout(15000)});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}return response;}
 const csrf=await request('/api/auth/csrf');assert.equal(csrf.status,200);const {csrfToken}=await csrf.json();assert.equal(typeof csrfToken,'string');
 const result=await request('/api/auth/callback/credentials',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email,password,csrfToken,callbackUrl:base}).toString()});assert.ok([200,302].includes(result.status));
 const workspace=await request('/api/v4/workspace');assert.equal(workspace.status,200);const data=await workspace.json();assert.equal(data.schemaVersion,4);assert.equal(data.accounts[0].openingPoisha,100000);assert.equal(data.transactions[0].poisha,12345);
 const hostile=await request('/api/v4/profile',{method:'POST',headers:{origin:'https://hostile.example.invalid','content-type':'application/json'},body:'{}'});assert.equal(hostile.status,403);assert.equal((await hostile.json()).error.code,'INVALID_ORIGIN');
 const guide=await request('/docs/docker');assert.equal(guide.status,200);assert.match(await guide.text(),/Bundled PostgreSQL/);
}
function passed(message){checks.push(message);console.log(`PASS Docker ${message}`);}
const email=`${bundled}@example.invalid`;
const fixtureCode=`import assert from 'node:assert/strict';import {db} from './lib/server/db';(async()=>{const d=db();try{assert.equal(new URL(process.env.DATABASE_URL).hostname,'db');assert.equal(await d.user.count(),1);const u=await d.user.findUniqueOrThrow({where:{email:process.env.BUDGET_GO_SMOKE_EMAIL}});if(process.env.BUDGET_GO_SMOKE_SEED==='1'){await d.financialAccount.create({data:{userId:u.id,id:'docker-smoke-account',name:'Disposable Docker fixture',kind:'bank',openingDate:'2026-01-01',openingPoisha:100000n}});await d.transaction.create({data:{userId:u.id,id:'docker-smoke-entry',accountId:'docker-smoke-account',description:'Disposable Docker fixture',type:'expense',category:'Groceries',date:'2026-01-02',poisha:12345n}});}assert.equal(await d.transaction.count(),1);assert.equal((await d.transaction.findUniqueOrThrow({where:{userId_id:{userId:u.id,id:'docker-smoke-entry'}}})).poisha,12345n);assert.equal((await d.financialAccount.findUniqueOrThrow({where:{userId_id:{userId:u.id,id:'docker-smoke-account'}}})).openingPoisha,100000n);}finally{await d.$disconnect();}})().catch(()=>{console.error('Disposable fixture verification failed.');process.exitCode=1;});`;
try{
 const settings=JSON.parse(await run(['image','inspect',image],'inspect local test image'))[0];
 assert.equal(settings.Config.User,'node');assert.ok(settings.Config.Healthcheck?.Test.some(value=>value.includes('/api/health')));assert.ok(!settings.Config.Env.some(value=>/^(DATABASE_URL|AUTH_SECRET|POSTGRES_PASSWORD)=/.test(value)));
 const port=await freePort();let externalPort=await freePort();while(externalPort===port)externalPort=await freePort();const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');secrets.push(password,secret);
 const common=`AUTH_SECRET=${secret}\nPOSTGRES_PASSWORD=${password}\nBUDGET_GO_IMAGE=${image}\nBIND_ADDRESS=127.0.0.1\n`;
 await writeFile(bundledEnv,`${common}APP_URL=http://127.0.0.1:${port}\nAPP_PORT=${port}\n`,{mode:0o600});
 await writeFile(externalEnv,`${common}APP_URL=http://127.0.0.1:${externalPort}\nAPP_PORT=${externalPort}\nDATABASE_URL=postgresql://budget_go:${password}@db:5432/budget_go?schema=public\n`,{mode:0o600});
 await writeFile(override,JSON.stringify({networks:{default:{external:true,name:`${bundled}_default`}}}));configured=true;
 await compose('bundled','config','--quiet');await compose('external','config','--quiet');passed('both Compose configurations validate with generated private settings');
 await compose('bundled','pull','db');await compose('bundled','up','-d','--wait','--wait-timeout','120','db');
 await compose('bundled','run','--rm','--pull','never','migrate');
 await compose('bundled','up','-d','--no-build','--pull','never','--wait','--wait-timeout','120','app');await probe(port);
 await exec('bundled',['npm','run','db:check']);await exec('bundled',['node','-e',"const fs=require('node:fs');if(process.getuid()===0||fs.existsSync('.env')||fs.existsSync('artifacts')||!fs.existsSync('LICENSE'))process.exit(1)"]);
 passed('bundled PostgreSQL migrations readiness login guards and nonroot secret-free runtime');
 const adminPassword=randomBytes(32).toString('base64url');secrets.push(adminPassword);await exec('bundled',['npm','run','user:create','--','--email',email,'--name','Disposable Docker fixture'],{BUDGET_GO_ADMIN_PASSWORD:adminPassword});
 await exec('bundled',['node','node_modules/tsx/dist/cli.mjs','-e',fixtureCode],{BUDGET_GO_SMOKE_EMAIL:email,BUDGET_GO_SMOKE_SEED:'1'});
 await signInAndRead(port,email,adminPassword);passed('operator provisioning Auth.js sign-in REST financial reads hostile Origin refusal and in-app Docker guide');
 await compose('bundled','stop','app');
 await compose('bundled','exec','-T','db','pg_dump','-U','budget_go','-d','budget_go','--format=custom','--file=/tmp/budget-go-smoke.dump');
 await compose('bundled','exec','-T','db','pg_restore','--list','/tmp/budget-go-smoke.dump');passed('PostgreSQL backup archive can be generated and listed without a TTY');
 await compose('bundled','up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','120','db');
 await compose('bundled','run','--rm','--pull','never','migrate');await compose('bundled','up','-d','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','120','app');
 await probe(port);await exec('bundled',['node','node_modules/tsx/dist/cli.mjs','-e',fixtureCode],{BUDGET_GO_SMOKE_EMAIL:email});
 passed('database-volume persistence app recreation and migration replay preserve exact records');
 await compose('external','run','--rm','--pull','never','migrate');await compose('external','up','-d','--no-build','--pull','never','--wait','--wait-timeout','120','app');await probe(externalPort);await exec('external',['npm','run','db:check']);
 await exec('external',['node','node_modules/tsx/dist/cli.mjs','-e',fixtureCode],{BUDGET_GO_SMOKE_EMAIL:email});await signInAndRead(externalPort,email,adminPassword);passed('external option connects to supplied isolated PostgreSQL with Auth.js and the same preserved records');
 await compose('bundled','stop','db');const unavailable=await fetch(`http://127.0.0.1:${externalPort}/api/health`,{signal:AbortSignal.timeout(15000)});assert.equal(unavailable.status,503);const status=await unavailable.json();assert.equal(status.status,'unavailable');assert.deepEqual(Object.keys(status).sort(),['status','version']);passed('database outage makes public readiness unavailable without configuration disclosure');
}catch(error){failure=error instanceof Error?error.message:'Container acceptance failed.';console.error(failure);process.exitCode=1;}
finally{
 // Never accept a user-supplied project/volume name for destructive cleanup.
 if(!/^budget-go-smoke-[a-f0-9]{12}$/.test(bundled)||!/^budget-go-smoke-external-[a-f0-9]{12}$/.test(external))throw new Error('Refusing unsafe cleanup target.');
 if(configured)for(const [mode,args] of [['external',['down','--remove-orphans']],['bundled',['down','--volumes','--remove-orphans']]])try{await compose(mode,...args);}catch{cleaned=false;console.error(`Could not clean the generated ${mode} test project; inspect Docker privately.`);process.exitCode=1;}
 const resolved=path.resolve(temporary);if(path.dirname(resolved)!==path.resolve(tmpdir())||!/^budget-go-docker-smoke-[A-Za-z0-9]+$/.test(path.basename(resolved)))throw new Error('Refusing unsafe temporary directory cleanup.');
 await rm(resolved,{recursive:true,force:true});
 console.log(JSON.stringify({scope:'Generated disposable Docker projects only',checks,failure,cleanup:cleaned?'Exact generated project containers/networks/volume and private temporary configuration removed.':'Private temporary configuration removed; generated Docker project cleanup needs operator attention.'},null,2));
}
