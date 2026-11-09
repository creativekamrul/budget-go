import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';

const planning = await tsImport('../lib/planning.ts',import.meta.url);
const workspace = await tsImport('../lib/workspace.ts',import.meta.url);
const reports = await tsImport('../lib/reports.ts',import.meta.url);
const checks=[];
function check(name,action){action();checks.push(name);console.log(`PASS core ${name}`);}
const transaction={accountId:'bank',description:'Rent',type:'expense',category:'Home',categoryId:null,poisha:2000000,merchantId:null,tagIds:[],notes:'',status:'confirmed',excluded:false};
const schedule=(startDate='2024-01-31',frequency='monthly',extra={})=>({id:'schedule',name:'Rent',transaction,startDate,frequency,active:true,archived:false,...extra});

check('monthly occurrences clamp short months and return to the original anchor day',()=>{
  assert.deepEqual(planning.upcomingOccurrences(schedule(),'2024-01-01','2024-04-30'),['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
  assert.deepEqual(planning.upcomingOccurrences(schedule('2025-01-31'),'2025-02-01','2025-03-31'),['2025-02-28','2025-03-31']);
  assert.equal(planning.isOccurrenceDate(schedule(),'2024-02-28'),false);
  assert.equal(planning.isOccurrenceDate(schedule(),'2024-02-29'),true);
  assert.equal(planning.isOccurrenceDate(schedule(),'2024-03-29'),false);
});
check('yearly leap-day occurrences preserve the February anchor and supported calendar limits',()=>{
  const leap=schedule('2024-02-29','yearly');
  assert.deepEqual(planning.upcomingOccurrences(leap,'2024-01-01','2028-12-31'),['2024-02-29','2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
  assert.equal(planning.isOccurrenceDate(leap,'2025-03-01'),false);
  assert.equal(planning.isOccurrenceDate(leap,'2023-02-28'),false);
  assert.deepEqual(planning.upcomingOccurrences(schedule('9999-12-31'),'9999-12-01','9999-12-31'),['9999-12-31']);
});
check('weekly forecasts skip recorded dates and never mutate the schedule or produce invalid ranges',()=>{
  const weekly=schedule('2026-11-01','weekly'),before=structuredClone(weekly);
  assert.deepEqual(planning.upcomingOccurrences(weekly,'2026-11-01','2026-11-30',['2026-11-08']),['2026-11-01','2026-11-15','2026-11-22','2026-11-29']);
  assert.equal(planning.isOccurrenceDate(weekly,'2026-11-09'),false);
  assert.equal(planning.nextOccurrence(weekly,'2026-11-02',['2026-11-08']),'2026-11-15');
  assert.deepEqual(planning.upcomingOccurrences(weekly,'2026-11-30','2026-11-01'),[]);
  assert.deepEqual(planning.upcomingOccurrences(weekly,'invalid','2026-11-01'),[]);
  assert.deepEqual(weekly,before);
});
check('inactive and archived forecasts stay separate from posted balances',()=>{
  assert.deepEqual(planning.upcomingOccurrences(schedule('2026-11-01','weekly',{active:false}),'2026-11-01','2026-11-30'),[]);
  assert.deepEqual(planning.upcomingOccurrences(schedule('2026-11-01','weekly',{archived:true}),'2026-11-01','2026-11-30'),[]);
  assert.equal(planning.nextOccurrence(schedule('2026-11-01','weekly',{active:false}),'2026-11-01'),null);
  const empty=workspace.emptyWorkspace();assert.equal(workspace.workspaceSummary(empty,'2026-11','2026-11-09').expensePoisha,0);
});
check('planning commands reject unsafe targets bad recurrence fields and owner injection',()=>{
  const good={type:'recurring_create',schedule:{name:'Rent',transaction,startDate:'2026-11-01',frequency:'monthly',active:true}};
  assert.equal(planning.planningCommandSchema.safeParse(good).success,true);
  for(const schedulePatch of [{startDate:'2026-02-31'},{frequency:'daily'},{transaction:{...transaction,poisha:1.1}},{transaction:{...transaction,userId:'foreign'}}])assert.equal(planning.planningCommandSchema.safeParse({...good,schedule:{...good.schedule,...schedulePatch}}).success,false);
  for(const amount of [-1,1.1,Number.MAX_SAFE_INTEGER+1])assert.equal(planning.planningCommandSchema.safeParse({type:'monthly_plan_set',month:'2026-11',incomePoisha:amount,spendingPoisha:0}).success,false);
  assert.equal(planning.planningCommandSchema.safeParse({type:'monthly_plan_set',month:'2026-11',incomePoisha:0,spendingPoisha:0}).success,true);
});
check('bulk selection bounds and patch fields forbid implicit amount account or owner changes',()=>{
  assert.doesNotThrow(()=>workspace.validateCommand({type:'transaction_bulk_update',ids:['one','two'],patch:{notes:'Reviewed',status:'confirmed'}}));
  for(const ids of [[],['same','same'],Array.from({length:101},(_,i)=>`entry-${i}`)])assert.throws(()=>workspace.validateCommand({type:'transaction_bulk_delete',ids}));
  for(const patch of [{},{poisha:1},{accountId:'other'},{type:'income'},{userId:'foreign'}])assert.throws(()=>workspace.validateCommand({type:'transaction_bulk_update',ids:['one'],patch}));
});
check('split command validates explicit positive parts and budget copying keeps calendar months strict',()=>{
  const part={description:'Food',category:'Groceries',categoryId:null,poisha:100};
  assert.doesNotThrow(()=>workspace.validateCommand({type:'transaction_split',id:'one',parts:[part,part]}));
  for(const parts of [[part],Array(21).fill(part),[part,{...part,poisha:0}],[part,{...part,userId:'foreign'}]])assert.throws(()=>workspace.validateCommand({type:'transaction_split',id:'one',parts}));
  assert.doesNotThrow(()=>workspace.validateCommand({type:'budget_copy',fromMonth:'2026-10',toMonth:'2026-11'}));
  assert.throws(()=>workspace.validateCommand({type:'budget_copy',fromMonth:'2026-13',toMonth:'2026-11'}));
});
check('legacy category labels share hierarchy rollups without double limits or renamed-label remapping',()=>{
  const data=workspace.emptyWorkspace();
  data.categories=[
    {id:'food',name:'Food',kind:'expense',parentId:null,color:'#79e3b4',icon:'folder',archived:false},
    {id:'groceries',name:'Groceries',kind:'expense',parentId:'food',color:'#79e3b4',icon:'folder',archived:false},
    {id:'produce',name:'Produce',kind:'expense',parentId:'groceries',color:'#79e3b4',icon:'folder',archived:false},
  ];
  const expense=(id,category,categoryId,poisha,extra={})=>({id,accountId:null,description:id,type:'expense',category,categoryId,date:'2026-11-01',poisha,merchantId:null,tagIds:[],notes:'',status:'confirmed',excluded:false,...extra});
  data.transactions=[expense('legacy-food','Groceries',null,1000),expense('produce-food','Produce','produce',2000),expense('pending-food','Produce','produce',3000,{status:'pending'}),expense('excluded-food','Produce','produce',4000,{excluded:true})];
  data.budgets=[
    {id:'food-plan',month:'2026-11',category:'Food',categoryId:'food',limitPoisha:10000},
    {id:'legacy-groceries-plan',month:'2026-11',category:'Groceries',categoryId:null,limitPoisha:5000},
    {id:'produce-plan',month:'2026-11',category:'Produce',categoryId:'produce',limitPoisha:2000},
    {id:'december-plan',month:'2026-12',category:'Groceries',categoryId:null,limitPoisha:5000},
  ];
  const summary=workspace.workspaceSummary(data,'2026-11','2026-11-09');
  assert.equal(summary.budgets.find(b=>b.id==='food-plan').spentPoisha,3000);
  assert.equal(summary.budgets.find(b=>b.id==='legacy-groceries-plan').spentPoisha,3000,'A label-only parent budget includes its current catalog descendants');
  assert.deepEqual(workspace.topLevelCategoryBudgets(data,data.budgets).map(b=>b.id),['food-plan','december-plan'],'Only overlapping limits within the same month are removed');
  const report=reports.buildReport(data,{start:'2026-11-01',end:'2026-11-30'},'2026-11-09');
  assert.equal(report.budgetLimitPoisha,10000);assert.equal(report.budgetSpendPoisha,3000);assert.equal(report.expensePoisha,3000);
  data.categories.find(c=>c.id==='groceries').name='Market food';
  assert.equal(workspace.resolveCategoryId(data,null,'Groceries'),null,'A legacy string does not follow a renamed category through inferred history');
  assert.equal(workspace.resolveCategoryId(data,'groceries','Groceries'),'groceries','An explicit stable ID is retained through rename');
  const renamed=workspace.workspaceSummary(data,'2026-11','2026-11-09');
  assert.equal(renamed.budgets.find(b=>b.id==='food-plan').spentPoisha,2000);
  assert.equal(renamed.budgets.find(b=>b.id==='legacy-groceries-plan').spentPoisha,1000);
  assert.deepEqual(workspace.topLevelCategoryBudgets(data,data.budgets).map(b=>b.id),['food-plan','legacy-groceries-plan','december-plan']);
  const renamedReport=reports.buildReport(data,{start:'2026-11-01',end:'2026-11-30'},'2026-11-09');
  assert.equal(renamedReport.budgetLimitPoisha,15000);assert.equal(renamedReport.budgetSpendPoisha,3000);
});
const guides=await Promise.all(['transactions','recurring','budgets'].map(async name=>({name,markdown:await readFile(new URL(`../docs/developer/${name}.md`,import.meta.url),'utf8')})));
check('new repository and in-app guide examples match actual runtime commands',()=>{
  for(const {name,markdown} of guides){
    assert.match(markdown,/^# /);
    for(const match of markdown.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)){
      const value=JSON.parse(match[1]);
      if(value.command){const schema=['monthly_plan_set','recurring_create','recurring_update','recurring_record','recurring_archive'].includes(value.command.type)?planning.planningCommandSchema:workspace.workspaceCommandSchema;assert.equal(schema.safeParse(value.command).success,true,`Invalid ${name} command example`);}
    }
  }
});
console.log(JSON.stringify({scope:'Actual-source calendar/strict-command checks; no database or UI persistence evidence',groupsPassed:checks.length,checks},null,2));
