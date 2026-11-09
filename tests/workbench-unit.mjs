import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const workbench=await tsImport('../lib/workbench.ts',import.meta.url);
let groups=0;
function check(name,action){action();groups++;console.log(`PASS workbench ${name}`);}
const mapping={date:0,description:1,amount:2,debit:2,credit:3,mode:'signed',dateFormat:'ISO'};
const mapped=text=>workbench.mapCsv(workbench.parseCsv(text),mapping);
const draft={date:'2026-11-01',description:'Store payment',type:'expense',poisha:12345,category:'Groceries',categoryId:null};
check('CSV handles BOM, escaped quotes, commas, CRLF and embedded newlines',()=>{
 assert.deepEqual(workbench.parseCsv('\uFEFFdate,description,amount\r\n2026-11-01,"Store, ""Dhaka""\nbranch",-123.45\r\n'),[['date','description','amount'],['2026-11-01','Store, "Dhaka"\nbranch','-123.45']]);
 assert.throws(()=>workbench.parseCsv('a,b\n"unclosed'));
 assert.throws(()=>workbench.parseCsv('a,b\n"x"junk,2'));
 assert.throws(()=>workbench.parseCsv('a,b\nx"y,2'));
});
check('CSV bounds actual UTF8 bytes and data rows',()=>{
 assert.throws(()=>workbench.parseCsv('ক'.repeat(350000)),/1 MiB/);
 assert.equal(workbench.parseCsv('a\n'+'x\n'.repeat(1000)).length,1001);
 assert.throws(()=>workbench.parseCsv('a\n'+'x\n'.repeat(1001)),/1,000/);
});
check('Bangla digits, taka prefixes and grouped amounts use exact poisha',()=>{
 assert.deepEqual(mapped('Date,Description,Amount\n২০২৬-১১-০১,Store,-১২৩.৪৫')[0].draft,{...draft,description:'Store'});
 assert.equal(mapped('D,N,A\n2026-11-01,Income,"BDT 1,23,456.78"')[0].draft.poisha,12345678);
 assert.equal(mapped('D,N,A\n2026-11-01,Income,৳ 0.01')[0].draft.poisha,1);
 for(const amount of ['1.001','1e3','NaN','0','90071992547410','12,34'])assert.equal(mapped(`D,N,A\n2026-11-01,Store,"${amount}"`)[0].draft,null,amount);
});
check('Date convention is explicit and debit/credit direction never guessed',()=>{
 assert.equal(mapped('D,N,A\n01/11/2026,Store,-1')[0].draft,null);
 const dmy={...mapping,dateFormat:'DMY',mode:'debit_credit'};
 const rows=workbench.mapCsv([['D','N','DR','CR'],['01/11/2026','Store payment','123.45',''],['29/02/2025','Invalid','1',''],['01/11/2026','Both','1','2'],['02/11/2026','Pay','','25']],dmy);
 assert.deepEqual(rows[0].draft,draft);
 assert.equal(rows[1].draft,null);assert.equal(rows[2].draft,null);
 assert.equal(rows[3].draft.type,'income');assert.equal(rows[3].draft.poisha,2500);
});
check('Duplicate matching includes account, date, amount and normalized description',()=>{
 const entry={...draft,id:'same',accountId:'bank',description:'  STORE   PAYMENT '};
 assert.deepEqual(workbench.statementDuplicates(draft,[entry],'bank'),['same']);
 for(const patch of [{accountId:'cash'},{date:'2026-11-02'},{type:'income'},{poisha:12346},{description:'Another shop'}])assert.deepEqual(workbench.statementDuplicates(draft,[{...entry,...patch}],'bank'),[]);
});
check('Rules use AND with literal case-insensitive text and strict safe actions',()=>{
 const rule={conditions:[{field:'description',operator:'contains',value:'PAYMENT'},{field:'accountId',operator:'equals',value:'bank'}]};
 assert.equal(workbench.ruleMatches(rule,{...draft,accountId:'bank'}),true);
 assert.equal(workbench.ruleMatches(rule,{...draft,accountId:'cash'}),false);
 assert.equal(workbench.ruleMatches({conditions:[{field:'description',operator:'contains',value:'.*'}]},draft),false);
 assert.equal(workbench.ruleActionsSchema.safeParse({}).success,false);
 assert.equal(workbench.ruleActionsSchema.safeParse({poisha:1}).success,false);
 assert.equal(workbench.ruleActionsSchema.safeParse({tagIds:['x','x']}).success,false);
 assert.equal(workbench.ruleActionsSchema.safeParse({merchantId:null,tagIds:[],notes:'',excluded:false}).success,true);
});
check('Statement writes require bounded unique IDs and explicit duplicate row acceptance',()=>{
 const command=workbench.workbenchCommandSchema.parse({type:'statement_commit',id:'statement',rowIds:['a']});
 assert.deepEqual(command.includeDuplicateRowIds,[]);assert.deepEqual(command.links,[]);
 assert.equal(workbench.workbenchCommandSchema.safeParse({...command,includeDuplicates:true}).success,false);
 assert.equal(workbench.workbenchCommandSchema.safeParse({...command,rowIds:['a','a']}).success,false);
 assert.equal(workbench.workbenchCommandSchema.safeParse({...command,rowIds:Array.from({length:101},(_,i)=>String(i))}).success,false);
 assert.equal(workbench.workbenchCommandSchema.safeParse({type:'statement_create',name:'CSV',accountId:'bank',rows:[{...draft,poisha:0}]}).success,false);
 assert.equal(workbench.workbenchCommandSchema.safeParse({type:'statement_reconcile',id:'s',date:'2026-11-01',balancePoisha:-12345}).success,true);
});
console.log(`PASS workbench ${groups} pure groups`);
