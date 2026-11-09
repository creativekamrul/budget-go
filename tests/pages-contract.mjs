import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const built=spawnSync(process.execPath,['scripts/build-pages.mjs'],{encoding:'utf8',windowsHide:true});
assert.equal(built.status,0,built.stderr);
const root=path.resolve('_site'),metadata=JSON.parse(await readFile('package.json','utf8'));
const guideSlugs=['docker','quickstart','accounts','transactions','transfers','budgets','recurring','statements','rules','automation','api','mcp','n8n','backup','security','operations','parity'];
async function files(directory){const result=[];for(const item of await readdir(directory,{withFileTypes:true})){assert.equal(item.isSymbolicLink(),false);const name=path.join(directory,item.name);if(item.isDirectory())result.push(...await files(name));else result.push(name);}return result;}
const output=await files(root),relative=output.map(name=>path.relative(root,name).replaceAll('\\','/')).sort();
assert.deepEqual(relative,['.nojekyll','index.html','assets/favicon.svg','assets/style.css','downloads/openapi.json','downloads/budget-go-alert-inbox.json','downloads/ingest-event.mjs','docs/index.html',...guideSlugs.map(slug=>`docs/${slug}.html`)].sort());
console.log('PASS Pages artifact contains only allowlisted public sources and downloads');
const home=await readFile(path.join(root,'index.html'),'utf8');
const base=/href="([^\"]+)assets\/style\.css"/.exec(home)?.[1];assert.ok(base);
let checked=0;
for(const file of output.filter(name=>name.endsWith('.html'))){const html=await readFile(file,'utf8');assert.match(html,/<h1(?:\s[^>]*)?>/);assert.equal((html.match(/<h1(?:\s[^>]*)?>/g)||[]).length,1);for(const match of html.matchAll(/(?:href|src)="([^\"]+)"/g)){const href=match[1].replaceAll('&amp;','&');if(!href.startsWith(base)&&!href.startsWith('#'))continue;const [pathname,anchor]=href.split('#');let target=pathname?path.resolve(root,`.${pathname.slice(base.length-1)}`):file;assert.ok(target===root||target.startsWith(root+path.sep));if((await stat(target)).isDirectory())target=path.join(target,'index.html');if(anchor){const document=await readFile(target,'utf8');assert.ok(document.includes(`id="${anchor}"`),`Missing anchor ${href}`);}checked++;}}
console.log(`PASS Pages local links/assets/anchors resolve (${checked} references)`);
for(const file of output.filter(name=>name.endsWith('.html'))){const html=await readFile(file,'utf8');assert.doesNotMatch(html,/<(?:script|form|iframe)[\s>]/i);assert.doesNotMatch(html,/192\.168\.|WALTON|budget_go_test_|K:\\/);}
console.log('PASS public HTML has no private runtime markers or interactive application/authentication forms');
assert.ok(home.includes(`v${metadata.version}`));assert.ok(home.includes(`ghcr.io/creativekamrul/budget-go:${metadata.version}`));assert.match(home,/private finance application runs on your own server/);const hub=await readFile(path.join(root,'docs/index.html'),'utf8');assert.equal((hub.match(/<a href="[^\"]+docs\/[^\"]+\.html"><strong>/g)||[]).length,17);JSON.parse(await readFile(path.join(root,'downloads/openapi.json'),'utf8'));
console.log('PASS beta version, two install options,17 guides and machine-readable contract are consistent');
