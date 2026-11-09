// Pure behavior checks against actual transpiled source. No database or app server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const loaded = {};
async function source(name, replacements = {}) {
  const text = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  compiled = compiled.replace(/from ["']([^"']+)["']/g, (whole, specifier) => {
    if (replacements[specifier]) return `from ${JSON.stringify(replacements[specifier])}`;
    if (specifier.startsWith('node:')) return whole;
    if (specifier.startsWith('.')) throw new Error(`Unmapped pure import ${name}: ${specifier}`);
    return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
  });
  loaded[name] = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  return import(loaded[name]);
}
await source('lib/preview.ts');
await source('lib/finance.ts', { './preview': loaded['lib/preview.ts'] });
const workspace = await source('lib/workspace.ts', { './finance': loaded['lib/finance.ts'], './preview': loaded['lib/preview.ts'] });
const account=(id,kind,openingPoisha)=>({id,name:id,kind,currency:'BDT',openingDate:'2026-11-01',openingPoisha,archived:false});
const entry=(id,accountId,type,date)=>({id,accountId,type,date,poisha:1200,description:id,category:type==='income'?'Salary':'Groceries',categoryId:null,merchantId:null,tagIds:[],notes:'original note',status:'confirmed',excluded:false});
const base=()=>({...workspace.emptyWorkspace(),accounts:[account('bank','bank',10000),account('debt','loan',-3000)]});
const check=(name,fn)=>{fn();console.log('PASS finish finance '+name);};
check('all manual BDT account families and signed debt contribute exact net worth',()=>{
 const data=base();data.accounts.push(account('home','property',50000));workspace.validateWorkspace(data);
 assert.deepEqual(workspace.netWorthSummary(data,'2026-11-20'),{assetsPoisha:60000,liabilitiesPoisha:3000,netWorthPoisha:57000});
 for(const kind of workspace.accountKinds)assert.equal(workspace.validateCommand({type:'account_create',account:{name:kind,kind,openingDate:'2026-11-01',openingPoisha:-1}}).account.kind,kind);
});
check('dated adjustments affect balances and history without income',()=>{
 const data=base();data.adjustments=[{id:'adjust',accountId:'bank',date:'2026-11-10',poisha:-2500,balancePoisha:7500,description:'Statement correction'}];workspace.validateWorkspace(data);
 assert.equal(workspace.accountBalance(data,'bank','2026-11-09'),10000);assert.equal(workspace.accountBalance(data,'bank','2026-11-10'),7500);
 assert.equal(workspace.workspaceSummary(data,'2026-11','2026-11-20').incomePoisha,0);assert.equal(workspace.balanceHistory(data,'2026-11-01','2026-11-20').at(-1).poisha,4500);
 data.transactions.push(entry('later','bank','expense','2026-11-08'));assert.equal(workspace.accountBalance(data,'bank','2026-11-10'),6300);
});
check('separate settlement dates preserve each account and consolidated history',()=>{
 const data=base();data.transfers=[{id:'transfer',fromAccountId:'bank',toAccountId:'debt',date:'2026-11-05',toDate:'2026-11-07',poisha:1200,description:'Payment'}];workspace.validateWorkspace(data);
 assert.equal(workspace.accountBalance(data,'bank','2026-11-06'),8800);assert.equal(workspace.accountBalance(data,'debt','2026-11-06'),-3000);assert.equal(workspace.accountBalance(data,'debt','2026-11-07'),-1800);
 assert.deepEqual(workspace.balanceHistory(data,'2026-11-04','2026-11-08').map(p=>p.poisha),[7000,5800,7000,7000]);
});
check('matching removes spending and income while retaining dated positions and original fields',()=>{
 const data=base(),outgoing=entry('out','bank','expense','2026-11-05'),incoming=entry('in','debt','income','2026-11-07');data.transactions=[outgoing,incoming];
 const matched={...data,transactions:[],transfers:[{id:'transfer',fromAccountId:'bank',toAccountId:'debt',date:outgoing.date,toDate:incoming.date,poisha:1200,description:'Matched payment'}],matches:[{id:'match',transferId:'transfer',outgoing,incoming}]};workspace.validateWorkspace(matched);
 for(const date of ['2026-11-04','2026-11-05','2026-11-06','2026-11-07'])for(const a of data.accounts)assert.equal(workspace.accountBalance(data,a.id,date),workspace.accountBalance(matched,a.id,date));
 assert.equal(workspace.workspaceSummary(matched,'2026-11','2026-11-20').expensePoisha,0);assert.equal(matched.matches[0].outgoing.notes,'original note');
 assert.throws(()=>workspace.validateWorkspace({...matched,transactions:[outgoing]}),/unique/);
 assert.throws(()=>workspace.validateWorkspace({...matched,matches:[{...matched.matches[0],incoming:{...incoming,poisha:1201}}]}),/inconsistent/);
});
check('adjustments reject unknown accounts, dates before opening, duplicate date and unsafe totals',()=>{
 const data=base();const adjustment={id:'a',accountId:'bank',date:'2026-11-10',poisha:1,balancePoisha:10001,description:'Correction'};
 for(const change of [{accountId:'unknown'},{date:'2026-10-31'},{poisha:Number.MAX_SAFE_INTEGER}])assert.throws(()=>workspace.validateWorkspace({...data,adjustments:[{...adjustment,...change}]}));
 assert.throws(()=>workspace.validateWorkspace({...data,adjustments:[adjustment,{...adjustment,id:'b'}]}),/one balance adjustment/);
});
check('match audit ownership and reusable original IDs cannot be forged',()=>{
 const data=base(),outgoing=entry('out','bank','expense','2026-11-05'),incoming=entry('in','debt','income','2026-11-07');
 data.transfers=[{id:'transfer',fromAccountId:'bank',toAccountId:'debt',date:outgoing.date,toDate:incoming.date,poisha:1200,description:'Payment'}];data.matches=[{id:'match',transferId:'transfer',outgoing,incoming}];
 assert.throws(()=>workspace.validateWorkspace({...data,matches:[{...data.matches[0],outgoing:{...outgoing,accountId:'unknown'}}]}),/inconsistent/);
 assert.throws(()=>workspace.validateWorkspace({...data,matches:[{...data.matches[0],outgoing:{...outgoing,tagIds:['missing']}}]}),/unknown tag/);
 assert.throws(()=>workspace.validateWorkspace({...data,matches:[{...data.matches[0],incoming:{...incoming,id:'bank'}}]}),/unique/);
});
