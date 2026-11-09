// Release packaging checks only: no database connection, container start or publication.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
function run(command,args,environment=process.env){const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,env:environment});if(result.error)throw new Error(`${command} is required for release packaging checks.`);return result;}
const packageInfo=JSON.parse(await read('package.json'));
assert.equal(packageInfo.license,'MIT');
assert.match(packageInfo.version,/^\d+\.\d+\.\d+-beta\.\d+$/);
const license=await read('LICENSE');assert.match(license,/MIT License/);assert.match(license,/Permission is hereby granted, free of charge/);assert.match(license,/THE SOFTWARE IS PROVIDED "AS IS"/);
console.log('PASS beta release metadata and MIT license are present');

for(const path of ['.env','.env.docker','.env.external','.env.test-app','artifacts/private-screenshot.png','backups/private.dump','_site/index.html','node_modules/example/index.js','.next/server.js','generated/prisma/client.ts','.npm-cache/token.log','.playwright/profile/Cookies']){
 assert.equal(run('git',['check-ignore','--no-index','--quiet',path]).status,0,`${path} must stay outside the public repository`);
}
for(const path of ['.env.example','.env.docker.example','.env.external.example'])assert.equal(run('git',['check-ignore','--no-index','--quiet',path]).status,1,`${path} must remain publishable`);
const staged=run('git',['ls-files','--cached','-z']);assert.equal(staged.status,0);
for(const path of staged.stdout.split('\0').filter(Boolean))assert.ok(!/^(?:artifacts|backups|_site|node_modules|\.next|\.npm-cache|\.playwright|generated\/prisma)\//.test(path)&&(!path.startsWith('.env')||['.env.example','.env.docker.example','.env.external.example'].includes(path)),`Private/generated content is staged: ${path}`);
console.log('PASS public Git index excludes private environments, screenshots, backups and generated state');

for(const file of ['.env.docker.example','.env.external.example']){
 const text=await read(file);assert.match(text,/^AUTH_SECRET=\s*$/m);
 if(file.includes('docker'))assert.match(text,/^POSTGRES_PASSWORD=\s*$/m);else assert.match(text,/^DATABASE_URL=\s*$/m);
}
const dockerIgnore=await read('.dockerignore');for(const path of ['.env*','artifacts','backups','.git','node_modules','.playwright','.npm-cache'])assert.ok(dockerIgnore.split(/\r?\n/).includes(path),`Docker build context must exclude ${path}`);
const dockerfile=await read('Dockerfile');assert.match(dockerfile,/^USER node\s*$/m);assert.match(dockerfile,/"--hostname",\s*"0\.0\.0\.0"/);assert.ok(!/^\s*(?:ARG|ENV)\s+(?:AUTH_SECRET|DATABASE_URL|POSTGRES_PASSWORD)\b/m.test(dockerfile),'Runtime secrets cannot be baked into the image');assert.match(dockerfile,/^COPY[^\r\n]*\/app\/LICENSE\b/m,'The application license must ship in the runtime image');
console.log('PASS container context excludes private data and runtime runs without root or baked credentials');

const synthetic={...process.env,APP_URL:'http://127.0.0.1:3999',APP_PORT:'3999',BIND_ADDRESS:'127.0.0.1',AUTH_SECRET:'release-contract-synthetic-secret-not-used',POSTGRES_PASSWORD:'synthetic-test-password',DATABASE_URL:'postgresql://synthetic:synthetic@database.invalid:5432/budget_go?schema=public'};
delete synthetic.BUDGET_GO_IMAGE;
for(const [file,envFile,bundled] of [['compose.yaml','.env.docker.example',true],['compose.external.yaml','.env.external.example',false]]){
 const result=run('docker',['compose','--env-file',envFile,'-f',file,'--profile','tools','config','--format','json'],synthetic);assert.equal(result.status,0,`${file} must resolve with synthetic configuration`);
 const config=JSON.parse(result.stdout),services=config.services;
 assert.ok(services.app&&services.migrate);assert.ok(services.migrate.profiles.includes('tools'));assert.equal(services.migrate.restart,'no');
 assert.equal(services.app.image,`ghcr.io/creativekamrul/budget-go:${packageInfo.version}`);assert.equal(services.app.environment.APP_URL,services.app.environment.AUTH_URL);assert.ok(services.app.ports.every(port=>port.host_ip==='127.0.0.1'));
 if(bundled){assert.ok(services.db);assert.ok(!services.db.ports?.length,'Bundled PostgreSQL must not publish a host port');assert.ok(services.db.volumes.some(volume=>volume.type==='volume'));assert.match(services.app.environment.DATABASE_URL,/@db:5432\/budget_go/);}
 else{assert.ok(!services.db,'External database mode must never start a bundled database');assert.deepEqual(Object.keys(services).sort(),['app','migrate']);assert.equal(services.app.environment.DATABASE_URL,synthetic.DATABASE_URL);}
}
console.log('PASS both Compose modes preserve their database boundary, explicit migrations and loopback binding');
