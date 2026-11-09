import {readFile,writeFile,mkdir,copyFile,rm,lstat} from 'node:fs/promises';
import path from 'node:path';

// This allowlist is deliberate: working notes, screenshots, environments and runtime data
// must never enter the public documentation artifact.
const guides=[
 ['docker','Docker installation','Two PostgreSQL options, backups and upgrades.'],
 ['quickstart','Automation quickstart','Take your first bank alert through a reviewed workflow.'],
 ['accounts','Accounts & net worth','Manual BDT positions, valuations and debt balances.'],
 ['transactions','Transactions','Entries, metadata, bulk changes and exact splits.'],
 ['transfers','Transfers & matching','Pair your own-account movements and preserve their dates.'],
 ['budgets','Budget planning','Monthly targets and category budgets.'],
 ['recurring','Recurring schedules','Plan regular bills and deliberately record occurrences.'],
 ['statements','Statements & reconciliation','Map, stage, review and import CSV statements.'],
 ['rules','Transaction rules','Preview and apply reusable classification changes.'],
 ['automation','Bangladesh automation','Message intake, conservative extraction and duplicate review.'],
 ['api','REST API reference','Current V4 workspace and versioned automation/planning contracts.'],
 ['mcp','MCP connection','Connect tools with scoped, expiring access tokens.'],
 ['n8n','n8n integration','Configure your own collector and starter workflow.'],
 ['backup','Full backup & restore','Supported owner-level recovery and its boundaries.'],
 ['security','Security & account controls','Sessions, access tokens, passwords and privacy.'],
 ['operations','Operations','Deployment responsibilities and database maintenance.'],
 ['parity','Feature coverage','What works in this beta and what remains open.'],
];
const cwd=process.cwd(),output=path.resolve(cwd,'_site');
if(output!==path.join(cwd,'_site'))throw new Error('Unexpected Pages artifact location.');
try{if((await lstat(output)).isSymbolicLink())throw new Error('Refusing a linked Pages artifact directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
const metadata=JSON.parse(await readFile(path.join(cwd,'package.json'),'utf8'));
const repo=process.env.PAGES_REPOSITORY??'creativekamrul/budget-go';
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('Invalid public repository name.');
const repository=`https://github.com/${repo}`;
const suppliedBase=process.env.PAGES_BASE_PATH??`/${repo.split('/')[1]}/`;
if(!/^\/?(?:[A-Za-z0-9_.-]+\/)*$/.test(suppliedBase)||suppliedBase.includes('..'))throw new Error('Invalid Pages base path.');
const base=`/${suppliedBase.split('/').filter(Boolean).join('/')}${suppliedBase.split('/').filter(Boolean).length?'/':''}`;
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const slugs=new Set(guides.map(([slug])=>slug));
function url(value){
 if(value.startsWith('#')||/^https?:\/\//i.test(value))return value;
 const match=/^(?:\.\/)?([a-z0-9-]+)\.md(#.*)?$/i.exec(value);
 if(match&&slugs.has(match[1]))return`${base}docs/${match[1]}.html${match[2]??''}`;
 const appDoc=/^\/docs\/([a-z0-9-]+)$/.exec(value);if(appDoc&&slugs.has(appDoc[1]))return`${base}docs/${appDoc[1]}.html`;
 if(value==='/docs/downloads/n8n')return`${base}downloads/budget-go-alert-inbox.json`;
 if(value==='/docs/downloads/node')return`${base}downloads/ingest-event.mjs`;
 if(/^[a-z][a-z\d+.-]*:/i.test(value)||value.startsWith('//'))return'#';
 // Relative repository references remain available without copying internal project notes.
 return`${repository}/blob/main/docs/${value.replace(/^(?:\.\.\/)+/,'')}`;
}
function inline(value){const token=/`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*/g;let result='',start=0;for(const match of value.matchAll(token)){result+=escape(value.slice(start,match.index));if(match[1]!==undefined)result+=`<code>${escape(match[1])}</code>`;else if(match[2]!==undefined)result+=`<a href="${escape(url(match[3]))}">${escape(match[2])}</a>`;else result+=`<strong>${escape(match[4])}</strong>`;start=match.index+match[0].length;}return result+escape(value.slice(start));}
const anchor=value=>value.toLowerCase().replace(/[`*_]/g,'').replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s+/g,'-');
function markdown(text){const lines=text.replaceAll('\r\n','\n').split('\n');const rendered=[];let paragraph=[],list=null;const flush=()=>{if(paragraph.length){rendered.push(`<p>${inline(paragraph.join(' '))}</p>`);paragraph=[];}if(list){rendered.push(`</${list}>`);list=null;}};
 for(let i=0;i<lines.length;i++){const line=lines[i];if(line.startsWith('```')){flush();const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);rendered.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);continue;}
 const heading=/^(#{1,6})\s+(.+)$/.exec(line);if(heading){flush();const level=heading[1].length;rendered.push(`<h${level} id="${escape(anchor(heading[2]))}">${inline(heading[2])}</h${level}>`);continue;}
 if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){flush();const cells=value=>value.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());const head=cells(line);i++;const body=[];while(i+1<lines.length&&lines[i+1].trim().startsWith('|'))body.push(cells(lines[++i]));rendered.push(`<div class="doc-table"><table><thead><tr>${head.map(v=>`<th>${inline(v)}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map(v=>`<td>${inline(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;}
 const item=/^\s*(?:([-*])|\d+\.)\s+(.+)$/.exec(line);if(item){if(paragraph.length){rendered.push(`<p>${inline(paragraph.join(' '))}</p>`);paragraph=[];}const kind=item[1]?'ul':'ol';if(list&&list!==kind){rendered.push(`</${list}>`);list=null;}if(!list){list=kind;rendered.push(`<${kind}>`);}rendered.push(`<li>${inline(item[2])}</li>`);continue;}
 if(!line.trim()){flush();continue;}if(/^>\s?/.test(line)){flush();rendered.push(`<blockquote><p>${inline(line.replace(/^>\s?/,''))}</p></blockquote>`);continue;}if(/^---+$/.test(line)){flush();rendered.push('<hr>');continue;}paragraph.push(line);
 }flush();return rendered.join('\n');
}
const sidebar=active=>`<aside class="docs-sidebar"><p>GUIDES &amp; REFERENCE</p><nav aria-label="Documentation">${guides.map(([slug,title])=>`<a href="${base}docs/${slug}.html"${active===slug?' aria-current="page"':''}>${escape(title)}</a>`).join('')}</nav><a class="docs-back" href="${base}">← Back to Budget Go</a></aside>`;
function frame(title,body,active=''){return`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(title)} — Budget Go installation and developer documentation."><meta name="theme-color" content="#0b111b"><title>${escape(title)} — Budget Go</title><link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}assets/style.css"></head><body><a class="skip" href="#main">Skip to content</a><header class="site-header docs-header wrap"><a class="brand" href="${base}"><span class="brand-mark">bg<span>.</span></span><span>Budget Go</span></a><nav aria-label="Main navigation"><a href="${base}">Home</a><a href="${base}docs/">Docs</a><a href="${repository}">GitHub ↗</a></nav></header><main id="main" class="docs-layout wrap">${sidebar(active)}<article class="doc-article"><p class="eyebrow">BUDGET GO · v${escape(metadata.version)}</p>${body}<p class="doc-note">This is public project documentation. Run the private application on your own server. <a href="${repository}">View the source</a> · <a href="${repository}/releases">Release notes</a>.</p></article></main></body></html>`;}
await rm(output,{recursive:true,force:true});
for(const directory of ['assets','docs','downloads'])await mkdir(path.join(output,directory),{recursive:true});
const home=(await readFile(path.join(cwd,'site/index.html'),'utf8')).replaceAll('{{BASE}}',base).replaceAll('{{REPO}}',repository).replaceAll('{{VERSION}}',escape(metadata.version));
await writeFile(path.join(output,'index.html'),home);
await writeFile(path.join(output,'.nojekyll'),'');
await copyFile(path.join(cwd,'site/style.css'),path.join(output,'assets/style.css'));
await copyFile(path.join(cwd,'site/favicon.svg'),path.join(output,'assets/favicon.svg'));
for(const [slug,title]of guides){const source=await readFile(path.join(cwd,`docs/developer/${slug}.md`),'utf8');await writeFile(path.join(output,`docs/${slug}.html`),frame(title,markdown(source),slug));}
const index=`<h1>Make Budget Go work for you.</h1><p class="docs-index-intro">Install the app, understand your records, and connect your own tools. These are the same guides available inside the application.</p><div class="code-downloads"><a href="${base}downloads/openapi.json">Download OpenAPI JSON</a><a href="${base}downloads/budget-go-alert-inbox.json">n8n starter workflow</a><a href="${base}downloads/ingest-event.mjs">Node.js intake helper</a></div><div class="guide-list">${guides.map(([slug,title,description])=>`<a href="${base}docs/${slug}.html"><strong>${escape(title)} →</strong><span>${escape(description)}</span></a>`).join('')}</div>`;
await writeFile(path.join(output,'docs/index.html'),frame('Documentation',index));
for(const [source,name]of [['docs/API.openapi.json','openapi.json'],['integrations/n8n/budget-go-alert-inbox.json','budget-go-alert-inbox.json'],['integrations/n8n/ingest-event.mjs','ingest-event.mjs']])await copyFile(path.join(cwd,source),path.join(output,'downloads',name));
console.log(`Built public GitHub Pages site: ${guides.length} allowlisted guides, version${metadata.version}, base${base}. No runtime data copied.`);
