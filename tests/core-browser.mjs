import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
import { tsImport } from 'tsx/esm/api';
import { automationFixture } from './automation-fixture.mjs';

const base='http://127.0.0.1:3100';
if(process.env.APP_URL!==base||process.env.AUTH_URL!==base)throw new Error('Refusing unsafe core browser target.');
let fixture,context,page,failure=null;const checks=[],geometry=[],errors=[];
async function check(name,action){console.log(`RUN core browser ${name}`);await action();checks.push(name);console.log(`PASS core browser ${name}`);}
async function capture(name,fullPage=true){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`artifacts/core/${name}.png`,fullPage});}
try {
  fixture=await automationFixture('core_browser');
  const {ids,password,mutate,get}=fixture;
  const planningService=await tsImport('../lib/server/planning-service.ts',import.meta.url);
  const presentation=await tsImport('../lib/presentation.ts',import.meta.url);
  const calculations=await tsImport('../lib/workspace.ts',import.meta.url);
  const plan=()=>planningService.getPlanning(fixture.a);
  const today=presentation.todayInDhaka(),month=today.slice(0,7);
  const priorMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-2,1)).toISOString().slice(0,7);
  const accountId=(await mutate({type:'account_create',account:{name:'Core finance bank',kind:'bank',openingDate:'2020-01-01',openingPoisha:100000}})).accounts[0].id;
  const entry=(description,poisha,category)=>({accountId,description,poisha,category,date:today,type:'expense',notes:'Original receipt',status:'confirmed',excluded:false});
  await mutate({type:'transaction_create',transaction:entry('Mixed purchase',30000,'Groceries')});
  await mutate({type:'transaction_create',transaction:entry('Dining outing',25000,'Dining')});
  await mutate({type:'budget_create',budget:{month:priorMonth,category:'Home',categoryId:null,limitPoisha:20000}});
  const originalId=(await get()).transactions.find(t=>t.description==='Mixed purchase').id;
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message.slice(0,160)));
  await mkdir('artifacts/core',{recursive:true});
  await page.goto(base,{waitUntil:'networkidle'});await page.getByLabel('Email',{exact:true}).fill(`${ids[0]}@example.invalid`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Home',exact:true}).waitFor();
  const dialog=()=>page.getByRole('dialog');
  await check('split validation retains drafts and lost-response replay preserves exact financial totals',async()=>{
    await page.goto(`${base}/?view=transactions`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Split Mixed purchase',exact:true}).click();
    await dialog().getByLabel('Part 1 description',{exact:true}).fill('Grocery part');await dialog().getByLabel('Part 1 amount (BDT)',{exact:true}).fill('160.00');
    await dialog().getByLabel('Part 2 description',{exact:true}).fill('Home part');await dialog().getByLabel('Part 2 category',{exact:true}).selectOption({label:'Home'});await dialog().getByLabel('Part 2 amount (BDT)',{exact:true}).fill('100.00');
    await dialog().getByRole('button',{name:'Save split',exact:true}).click();await expect(dialog().getByRole('alert')).toContainText('exactly');assert.equal((await get()).transactions.length,2);
    await dialog().getByLabel('Part 2 amount (BDT)',{exact:true}).fill('140.00');
    await capture('split-dialog-1440');
    let lost=false;const drop=async route=>{const body=route.request().postDataJSON();if(!lost&&body?.command?.type==='transaction_split'){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();};
    await page.route('**/api/v3/workspace',drop);await dialog().getByRole('button',{name:'Save split',exact:true}).click();await expect(dialog().getByRole('button',{name:'Retry same save safely',exact:true})).toBeVisible();
    assert.equal((await get()).transactions.length,3);await dialog().getByRole('button',{name:'Retry same save safely',exact:true}).click();await expect(dialog()).toHaveCount(0);await page.unroute('**/api/v3/workspace',drop);
    const saved=await get();assert.equal(saved.transactions.find(t=>t.id===originalId).description,'Grocery part');assert.equal(calculations.accountBalance(saved,accountId,today),45000);assert.equal(calculations.workspaceSummary(saved,month,today).expensePoisha,55000);
    assert.equal((await plan()).splits.length,1);assert.equal(saved.transactions.length,3);await expect(page.getByText('Split · 2 parts',{exact:true})).toHaveCount(2);
  });
  await check('selected bulk edits preserve amounts and confirmed bulk deletion changes only selected entries',async()=>{
    await page.getByRole('checkbox',{name:'Select Grocery part',exact:true}).check();await page.getByRole('checkbox',{name:'Select Dining outing',exact:true}).check();await page.getByRole('button',{name:'Edit selected',exact:true}).click();
    await dialog().getByLabel('Field to change',{exact:true}).selectOption('notes');await dialog().getByLabel('New value',{exact:true}).fill('Reviewed together');await dialog().getByRole('button',{name:'Apply to selected',exact:true}).click();await expect(dialog()).toHaveCount(0);
    let saved=await get();assert.equal(saved.transactions.find(t=>t.description==='Grocery part').notes,'Reviewed together');assert.equal(saved.transactions.find(t=>t.description==='Dining outing').notes,'Reviewed together');assert.equal(saved.transactions.find(t=>t.description==='Home part').notes,'Original receipt');assert.equal(calculations.accountBalance(saved,accountId,today),45000);
    if(await page.getByRole('button',{name:'Clear selection',exact:true}).count())await page.getByRole('button',{name:'Clear selection',exact:true}).click();
    await page.getByRole('checkbox',{name:'Select Dining outing',exact:true}).check();await page.getByRole('button',{name:'Delete selected',exact:true}).click();await expect(dialog()).toContainText('cannot be undone');assert.equal((await get()).transactions.length,3);
    await dialog().getByRole('button',{name:'Delete selected',exact:true}).click();await expect(dialog()).toHaveCount(0);saved=await get();assert.equal(saved.transactions.length,2);assert.equal(calculations.accountBalance(saved,accountId,today),70000);
  });
  await check('monthly income and spending targets persist and previous category budgets copy without clobbering',async()=>{
    await page.goto(`${base}/?view=budgets`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Set monthly targets',exact:true}).click();
    await dialog().getByLabel('Expected income (BDT)',{exact:true}).fill('1000.00');await dialog().getByLabel('Planned spending (BDT)',{exact:true}).fill('600.00');await dialog().getByRole('button',{name:'Save monthly targets',exact:true}).click();await expect(dialog()).toHaveCount(0);
    assert.deepEqual((await plan()).monthlyPlans.find(p=>p.month===month),{month,incomePoisha:100000,spendingPoisha:60000});
    await page.getByRole('button',{name:'Copy previous month',exact:true}).click();await dialog().getByRole('button',{name:'Copy category budgets',exact:true}).click();await expect(dialog()).toHaveCount(0);
    let saved=await get();assert.equal(saved.budgets.filter(b=>b.month===month).length,1);assert.equal(saved.budgets.find(b=>b.month===month).limitPoisha,20000);
    await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('button',{name:'Edit monthly targets',exact:true})).toBeVisible();
    const copy=page.getByRole('button',{name:'Copy previous month',exact:true});if(await copy.isEnabled()){await copy.click();await dialog().getByRole('button',{name:'Copy category budgets',exact:true}).click();await expect(dialog().getByRole('alert')).toContainText('target month');await dialog().getByRole('button',{name:'Cancel',exact:true}).click();}
    saved=await get();assert.equal(saved.budgets.filter(b=>b.month===month).length,1);await capture('monthly-plan-1440');
  });
  let scheduleId;
  await check('recurring schedule creation forecasts only and deliberately records one due occurrence',async()=>{
    await page.goto(`${base}/recurring`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'New schedule',exact:true}).click();
    const form=page.getByRole('form',{name:'New recurring schedule',exact:true});await form.getByLabel('Schedule name',{exact:true}).fill('Monthly rent');await form.getByLabel('Entry description',{exact:true}).fill('Rent occurrence');await form.getByLabel('Amount (BDT)',{exact:true}).fill('100.00');await form.getByLabel('Financial account',{exact:true}).selectOption(accountId);await form.getByLabel('Category',{exact:true}).selectOption({label:'Home'});await form.getByLabel('First due date',{exact:true}).fill(today);await form.getByLabel('Frequency',{exact:true}).selectOption('monthly');await form.getByRole('button',{name:'Create schedule',exact:true}).click();await expect(form).toHaveCount(0);
    scheduleId=(await plan()).recurring[0].id;assert.equal((await get()).transactions.length,2);assert.equal(calculations.accountBalance(await get(),accountId,today),70000);
    await page.getByRole('button',{name:'Record Monthly rent',exact:true}).click();const region=page.getByRole('region',{name:'Record recurring occurrence',exact:true});assert.equal((await get()).transactions.length,2);await region.getByRole('button',{name:'Record occurrence',exact:true}).click();await expect(region).toHaveCount(0);
    const saved=await get();assert.equal(saved.transactions.length,3);assert.equal(saved.transactions.find(t=>t.description==='Rent occurrence').poisha,10000);assert.equal(calculations.accountBalance(saved,accountId,today),60000);assert.equal((await plan()).occurrences.length,1);
    await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('button',{name:'Record Monthly rent',exact:true})).toBeDisabled();await capture('recurring-1440');
  });
  await check('editing future recurring amounts and pause archive restore preserve recorded history',async()=>{
    await page.getByRole('button',{name:'Edit Monthly rent',exact:true}).click();const form=page.getByRole('form',{name:'Edit recurring schedule',exact:true});await expect(form.getByLabel('First due date',{exact:true})).toBeDisabled();await form.getByLabel('Amount (BDT)',{exact:true}).fill('120.00');await form.getByRole('button',{name:'Save schedule',exact:true}).click();await expect(form).toHaveCount(0);
    assert.equal((await plan()).recurring.find(s=>s.id===scheduleId).transaction.poisha,12000);assert.equal((await get()).transactions.find(t=>t.description==='Rent occurrence').poisha,10000);
    await page.getByRole('button',{name:'Pause Monthly rent',exact:true}).click();await page.getByRole('button',{name:'Paused',exact:true}).click();await expect(page.getByRole('button',{name:'Record Monthly rent',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Resume Monthly rent',exact:true}).click();await page.getByRole('button',{name:'Active',exact:true}).click();await page.getByRole('button',{name:'Archive Monthly rent',exact:true}).click();await page.getByRole('button',{name:'Archived',exact:true}).click();await page.getByRole('button',{name:'Restore Monthly rent',exact:true}).click();await page.getByRole('button',{name:'Active',exact:true}).click();assert.equal((await get()).transactions.length,3);
  });
  await check('new core pages and dialogs reflow and retain usable controls on phone tablet and desktop',async()=>{
    for(const width of [1440,768,360]){await page.setViewportSize({width,height:1100});for(const[name,path]of[['transactions','/?view=transactions'],['budgets','/?view=budgets'],['recurring','/recurring'],['core-guide','/docs/transactions']]){await page.goto(base+path,{waitUntil:'networkidle'});const bounds=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(bounds.content<=bounds.width,`${name} overflows at${width}`);geometry.push({name,...bounds});const small=await page.locator('button,input,select,summary,textarea').evaluateAll(nodes=>nodes.flatMap(el=>{const target=el.matches('input[type=checkbox],input[type=radio]')?(el.labels?.[0]??el):el;const b=target.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(el).visibility!=='hidden'&&(b.width<43.9||b.height<43.9)?[{tag:el.tagName,text:(el.textContent??'').trim().slice(0,45),width:b.width,height:b.height}]:[];}));assert.deepEqual(small,[],`${name} small targets at${width}`);await capture(`${name}-${width}`);if(width===360)await capture(`${name}-viewport-360`,false);}}
    await page.goto(`${base}/?view=transactions`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Split Rent occurrence',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await dialog().getByLabel('Part 1 description',{exact:true}).fill('Rent principal');await dialog().getByLabel('Part 1 amount (BDT)',{exact:true}).fill('80.00');await dialog().getByLabel('Part 2 description',{exact:true}).fill('Service fee');await dialog().getByLabel('Part 2 category',{exact:true}).selectOption({label:'Shopping'});await dialog().getByLabel('Part 2 amount (BDT)',{exact:true}).fill('20.00');
    await dialog().getByRole('button',{name:'Save split',exact:true}).scrollIntoViewIfNeeded();await expect(dialog().getByRole('button',{name:'Save split',exact:true})).toBeVisible();await capture('split-dialog-360');
    await dialog().getByRole('button',{name:'Save split',exact:true}).click();await expect(dialog()).toHaveCount(0);assert.equal(calculations.accountBalance(await get(),accountId,today),60000);assert.equal((await plan()).splits.length,2);assert.deepEqual(errors,[]);
  });
  await check('legacy category limits roll up current descendants without duplicate allocation in budgets or reports',async()=>{
    let saved=await mutate({type:'category_create',category:{name:'Household',kind:'expense',parentId:null,color:'#79e3b4',icon:'folder'}});const parent=saved.categories.find(c=>c.name==='Household').id;
    saved=await mutate({type:'category_create',category:{name:'Groceries',kind:'expense',parentId:parent,color:'#79e3b4',icon:'basket'}});const child=saved.categories.find(c=>c.name==='Groceries').id;
    saved=await mutate({type:'category_create',category:{name:'Produce',kind:'expense',parentId:child,color:'#79e3b4',icon:'basket'}});const produce=saved.categories.find(c=>c.name==='Produce').id;
    await mutate({type:'budget_create',budget:{month,category:'Household',categoryId:parent,limitPoisha:40000}});
    await mutate({type:'budget_create',budget:{month,category:'Groceries',categoryId:null,limitPoisha:10000}});
    saved=await mutate({type:'transaction_create',transaction:{...entry('Fresh produce',1000,'Produce'),categoryId:produce}});
    assert.equal(calculations.workspaceSummary(saved,month,today).budgets.find(b=>b.category==='Groceries').spentPoisha,17000);
    await page.goto(`${base}/?view=budgets`,{waitUntil:'networkidle'});
    await expect(page.getByText('Category allocation',{exact:true}).locator('..').locator('strong')).toHaveText(presentation.formatMoney(60000));
    await expect(page.getByText('Still to allocate',{exact:true}).locator('..').locator('strong')).toHaveText(presentation.formatMoney(0));
    await page.goto(`${base}/reports`,{waitUntil:'networkidle'});
    await expect(page.getByRole('heading',{name:'Budget performance',exact:true}).locator('..').locator(':scope > strong')).toHaveText('65.0%');
    assert.deepEqual(errors,[]);
  });
}catch(error){failure={message:String(error.message).slice(0,1400)};console.error(JSON.stringify(failure));process.exitCode=1;if(page)await capture('browser-failure').catch(()=>{});}
finally{await context?.close().catch(()=>{});if(fixture)await fixture.close();await mkdir('artifacts/core',{recursive:true});await writeFile('artifacts/core/browser-results.json',JSON.stringify({scope:'Authenticated core finance UI in guarded disposable database',checks,geometry,errors,failure},null,2));}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));process.exit(failure?1:0);
