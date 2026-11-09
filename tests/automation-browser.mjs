import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
import { automationFixture } from './automation-fixture.mjs';

const base='http://127.0.0.1:3100';
if(process.env.APP_URL!==base||process.env.AUTH_URL!==base)throw new Error('Refusing unsafe automation browser target.');
const checks=[],errors=[],geometry=[];let fixture,context,page,failure=null;
async function check(name,action){console.log(`RUN automation browser ${name}`);await action();checks.push(name);console.log(`PASS automation browser ${name}`);}
async function capture(options){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot(options);}
try {
  fixture=await automationFixture('automation_browser');
  const {ids,password,get,auto,mutate}=fixture;
  const accountId=(await mutate({type:'account_create',account:{name:'Bangladesh alert bank',kind:'bank',openingDate:'2026-11-01',openingPoisha:100000}})).accounts[0].id;
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
  context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',acceptDownloads:true});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message.slice(0,160)));
  await mkdir('artifacts/automation',{recursive:true});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByLabel('Email',{exact:true}).fill(`${ids[0]}@example.invalid`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Home',exact:true}).waitFor();
  let sms,email,eventId;
  await check('real source settings create owned SMS and email feeds',async()=>{
    for(const [name,channel] of [['Bank SMS','sms'],['Bank email','email']]){
      await page.goto(`${base}/settings/sources`,{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'New source',exact:true}).click();
      const form=page.getByRole('form',{name:'New source',exact:true});
      await form.getByLabel('Source name',{exact:true}).fill(name);await form.getByLabel('Channel',{exact:true}).selectOption(channel);
      await form.getByLabel('Bank or provider label',{exact:true}).fill('BD bank');await form.getByLabel('Suggested account',{exact:true}).selectOption(accountId);
      await form.getByRole('button',{name:'Create source',exact:true}).click();await expect(form).toHaveCount(0);
    }
    const saved=await auto();sms=saved.sources.find(s=>s.channel==='sms');email=saved.sources.find(s=>s.channel==='email');
    assert.equal(sms.accountId,accountId);assert.equal(email.accountId,accountId);
    await page.screenshot({path:'artifacts/automation/sources-1440.png',fullPage:true});
  });
  await check('Bangla SMS preview stages a review draft without changing account balances',async()=>{
    await page.goto(`${base}/inbox`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Add alert',exact:true}).click();
    const form=page.getByRole('form',{name:'Add bank alert',exact:true});
    await form.getByLabel('Alert source',{exact:true}).selectOption(sms.id);
    await form.getByLabel('SMS or email text',{exact:true}).fill('Account debited Tk ১২৫.৫০ on ০৮/১১/২০২৬. Available balance Tk ৯০০.০০. Ref UIREF001');
    await form.getByRole('button',{name:'Preview extraction',exact:true}).click();
    await expect(form.getByText('Extraction preview',{exact:true})).toBeVisible();await expect(form.getByText('2026-11-08',{exact:true})).toBeVisible();
    await form.getByRole('button',{name:'Add to review queue',exact:true}).click();await expect(form).toHaveCount(0);
    const staged=await auto();assert.equal(staged.events.length,1);eventId=staged.events[0].id;assert.equal(staged.events[0].draft.poisha,12550);assert.equal(staged.events[0].rawText,null);
    assert.equal((await get()).transactions.length,0);
    await page.screenshot({path:'artifacts/automation/inbox-1440.png',fullPage:true});
  });
  await check('review and unknown-result retry post one transaction and preserve staged edits',async()=>{
    await page.getByRole('button',{name:'Review BD bank alert',exact:true}).click();
    const review=page.getByRole('complementary',{name:'Review alert',exact:true});
    const form=review.getByRole('form',{name:'Review transaction draft',exact:true});
    await form.getByLabel('Description',{exact:true}).fill('Groceries from bank SMS');await form.getByLabel('Category',{exact:true}).selectOption({label:'Groceries'});
    await form.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect.poll(async()=>(await auto()).events.find(e=>e.id===eventId).draft.description).toBe('Groceries from bank SMS');
    await page.screenshot({path:'artifacts/automation/review-1440.png',fullPage:true});
    let lost=false;
    const drop=async route=>{const input=route.request().postDataJSON();if(!lost&&input?.command?.type==='event_accept'){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();};
    await page.route('**/api/v3/automation',drop);
    await form.getByRole('button',{name:'Save & post transaction',exact:true}).click();
    await expect(page.getByRole('button',{name:'Retry previous save safely',exact:true})).toBeVisible();
    assert.equal((await get()).transactions.length,1);
    await page.getByRole('button',{name:'Retry previous save safely',exact:true}).click();
    await expect(review.getByText('Added to your ledger',{exact:true})).toBeVisible();
    await page.unroute('**/api/v3/automation',drop);
    assert.equal((await get()).transactions.length,1);assert.equal((await get()).transactions[0].poisha,12550);
    await page.reload({waitUntil:'networkidle'});assert.equal((await auto()).events.find(e=>e.id===eventId).status,'accepted');
  });
  await check('possible email duplicates require review and can be ignored without another transaction',async()=>{
    const intake=await context.request.post(`${base}/api/v3/ingest`,{headers:{origin:base},data:{sourceId:email.id,externalId:'email-UIREF001',reference:'UIREF001',draft:{accountId,description:'Email of same purchase',type:'expense',category:'Groceries',date:'2026-11-08',poisha:12550}}});assert.equal(intake.status(),200);
    await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Review Email of same purchase',exact:true}).click();
    const review=page.getByRole('complementary',{name:'Review alert',exact:true});
    await expect(review.getByText('Possible duplicate',{exact:true})).toBeVisible();await expect(review.getByRole('button',{name:'Save & post transaction',exact:true})).toBeDisabled();
    await review.getByRole('button',{name:'Ignore alert',exact:true}).click();await expect(review).toHaveCount(0);
    assert.equal((await get()).transactions.length,1);assert.equal((await auto()).events.find(e=>e.externalId==='email-UIREF001').status,'ignored');
  });
  await check('saved display and calendar preferences change live pages and default new entries',async()=>{
    await page.goto(`${base}/settings/preferences`,{waitUntil:'networkidle'});
    const form=page.getByRole('form',{name:'Workspace preferences',exact:true});
    await form.getByLabel('Number format',{exact:true}).selectOption('bn-BD');await form.getByLabel('Display density',{exact:true}).selectOption('compact');await form.getByLabel('Accent color',{exact:true}).selectOption('teal');
    await form.getByLabel('Week starts on',{exact:true}).selectOption('mon');await form.getByLabel('Financial year starts in',{exact:true}).selectOption('4');await form.getByLabel('New transaction status',{exact:true}).selectOption('pending');
    await form.getByRole('button',{name:'Save preferences',exact:true}).click();
    await expect.poll(async()=>(await auto()).preferences.locale).toBe('bn-BD');
    await page.reload({waitUntil:'networkidle'});await expect(form.getByLabel('Number format',{exact:true})).toHaveValue('bn-BD');
    await page.goto(base,{waitUntil:'networkidle'});await expect(page.locator('[data-accent="teal"]')).toHaveCount(1);await expect(page.locator('[data-density="compact"]')).toHaveCount(1);
    const hero=page.getByRole('region',{name:'Total account balance'});if(await hero.count())await expect(hero).toContainText('৮৭৪.৫০');else await expect(page.getByText(/৮৭৪\.৫০/).first()).toBeVisible();
    await page.getByRole('button',{name:'WTD',exact:true}).click();await page.getByRole('button',{name:'FYTD',exact:true}).click();
    await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();await expect(page.getByRole('dialog').getByLabel('Status',{exact:true})).toHaveValue('pending');await page.keyboard.press('Escape');
    await page.goto(`${base}/reports`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Fiscal YTD',exact:true}).click();
    await expect(page.getByText(/(?:Apr 1, 2026|1 Apr 2026)/).first()).toBeVisible();
    await page.screenshot({path:'artifacts/automation/fiscal-report-1440.png',fullPage:true});
  });
  await check('in-app docs search examples and actual OpenAPI and workflow downloads work',async()=>{
    await page.goto(`${base}/docs`,{waitUntil:'networkidle'});await page.getByLabel('Search documentation',{exact:true}).fill('sourceId');
    await expect(page.getByRole('heading',{name:/guides? found/})).toBeVisible();await page.getByRole('button',{name:'Clear search',exact:true}).click();
    await page.goto(`${base}/docs/api`,{waitUntil:'networkidle'});await page.getByRole('tab',{name:'JavaScript / Node.js',exact:true}).click();await expect(page.getByRole('tabpanel')).toContainText('process.env.BUDGET_GO_TOKEN');
    await page.getByRole('tabpanel').getByRole('button',{name:'Copy code example',exact:true}).click();await expect(page.getByRole('tabpanel').getByRole('button',{name:'Copy code example',exact:true})).toContainText('Copied');
    let downloading=page.waitForEvent('download');await page.getByRole('link',{name:'Download OpenAPI',exact:false}).click();let download=await downloading;
    const spec=JSON.parse(await readFile(await download.path(),'utf8'));assert.ok(spec.paths['/api/v3/ingest']);assert.ok(spec.components.schemas.AutomationCommand);
    downloading=page.waitForEvent('download');await page.getByRole('link',{name:'n8n starter workflow',exact:true}).click();download=await downloading;
    const workflow=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(workflow.active,false);assert.ok(workflow.nodes.length>=3);
    assert.deepEqual(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)})),{local:[],session:[]});
  });
  await check('redesigned workspace settings inbox and docs fit phone tablet and desktop',async()=>{
    const pending=await context.request.post(`${base}/api/v3/ingest`,{headers:{origin:base},data:{sourceId:sms.id,externalId:'phone-layout-review',draft:{accountId,description:'Mobile wallet cash-in needs category',type:'income',date:'2026-11-08',poisha:54321}}});assert.equal(pending.status(),200);
    for(const width of [1440,768,360]){
      await page.setViewportSize({width,height:1100});
      for(const [name,path] of [['home','/'],['inbox','/inbox'],['preferences','/settings/preferences'],['sources','/settings/sources'],['docs','/docs/api']]){
        await page.goto(base+path,{waitUntil:'networkidle'});
        const bounds=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(bounds.content<=bounds.width,`${name} overflows at ${width}`);geometry.push({name,...bounds});
        const small=await page.locator('button,input,select,textarea,summary').evaluateAll(nodes=>nodes.flatMap(el=>{const target=el.matches('input[type=checkbox],input[type=radio]')?(el.labels?.[0]??el):el;const box=target.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(el).visibility!=='hidden'&&(box.width<43.9||box.height<43.9)?[{tag:el.tagName,text:(el.textContent??'').trim().slice(0,50),width:box.width,height:box.height}]:[];}));
        assert.deepEqual(small,[],`${name} small controls at ${width}`);
        await capture({path:`artifacts/automation/${name}-${width}.png`,fullPage:true});
        if(width===360)await capture({path:`artifacts/automation/${name}-viewport-360.png`,fullPage:false});
      }
    }
    assert.deepEqual(errors,[]);
  });
}catch(error){failure={message:String(error.message).slice(0,1200)};console.error(JSON.stringify(failure));process.exitCode=1;if(page)await page.screenshot({path:'artifacts/automation/browser-failure.png',fullPage:true}).catch(()=>{});}
finally{await context?.close().catch(()=>{});if(fixture)await fixture.close();await mkdir('artifacts/automation',{recursive:true});await writeFile('artifacts/automation/browser-results.json',JSON.stringify({scope:'Authenticated isolated UI workflow; no real finance fixtures',checks,geometry,errors,failure},null,2));}
console.log(JSON.stringify({groupsPassed:checks.length,failure},null,2));
// The remote CDP browser is deliberately kept available for other fixture suites.
process.exit(failure?1:0);
