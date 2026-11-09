import { z } from "zod";
import { validDate } from "./preview";
import { normalizeBanglaDigits } from "./automation";
import type { AccountTransaction } from "./workspace";

const id=z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const date=z.string().refine(validDate,"Use a real YYYY-MM-DD date.");
const money=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const statementDraftSchema=z.object({date,description:z.string().trim().min(1).max(120),type:z.enum(["income","expense"]),poisha:money,category:z.string().min(1).max(80),categoryId:id.nullable()}).strict();
export type StatementDraft=z.infer<typeof statementDraftSchema>;
export const statementRowSchema=statementDraftSchema.extend({id,transactionId:id.nullable(),status:z.enum(["pending","imported","linked","ignored"])});
export type StatementRow=z.infer<typeof statementRowSchema>;
export const ruleConditionSchema=z.object({field:z.enum(["description","notes","category","accountId","type","merchantId"]),operator:z.enum(["contains","equals"]),value:z.string().trim().min(1).max(2000)}).strict();
export const ruleActionsSchema=z.object({categoryId:id.optional(),merchantId:id.nullable().optional(),tagIds:z.array(id).max(500).refine(v=>new Set(v).size===v.length).optional(),notes:z.string().max(2000).optional(),excluded:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0,"Choose at least one rule action.");
export const ruleInputSchema=z.object({name:z.string().trim().min(1).max(80),active:z.boolean(),priority:z.number().int().min(0).max(9999),conditions:z.array(ruleConditionSchema).min(1).max(8),actions:ruleActionsSchema}).strict();
export const ruleSchema=ruleInputSchema.extend({id});
export type FinanceRule=z.infer<typeof ruleSchema>;
const ids=z.array(id).min(1).max(100).refine(v=>new Set(v).size===v.length,"Select unique rows.");
export const rulePreviewSchema=z.object({ruleId:id,ids:ids.optional()}).strict();
export const workbenchCommandSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("rule_create"),rule:ruleInputSchema}).strict(),
  z.object({type:z.literal("rule_update"),id,rule:ruleInputSchema}).strict(),
  z.object({type:z.literal("rule_apply"),id,ids}).strict(),
  z.object({type:z.literal("statement_create"),name:z.string().trim().min(1).max(120),accountId:id,rows:z.array(statementDraftSchema).min(1).max(1000)}).strict(),
  z.object({type:z.literal("statement_commit"),id,rowIds:ids,includeDuplicateRowIds:z.array(id).max(100).refine(v=>new Set(v).size===v.length).default([]),links:z.array(z.object({rowId:id,transactionId:id}).strict()).max(100).default([])}).strict(),
  z.object({type:z.literal("statement_ignore"),id,rowIds:ids,ignored:z.boolean()}).strict(),
  z.object({type:z.literal("statement_reconcile"),id,date,balancePoisha:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)}).strict(),
]);
export type WorkbenchCommand=z.infer<typeof workbenchCommandSchema>;
const statementSchema=z.object({id,name:z.string().trim().min(1).max(120),accountId:id,createdAt:z.string().datetime(),rows:z.array(statementRowSchema.extend({duplicateIds:z.array(id),duplicateRowIds:z.array(id)})).max(1000),closingDate:date.nullable(),closingBalancePoisha:z.number().int().safe().nullable(),ledgerBalancePoisha:z.number().int().safe().nullable(),differencePoisha:z.string().nullable(),reconciled:z.boolean()}).strict();
export const workbenchSnapshotSchema=z.object({revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),rules:z.array(ruleSchema).max(500),statements:z.array(statementSchema).max(100),runs:z.array(z.object({id,ruleId:id,createdAt:z.string().datetime(),matchedCount:z.number().int().min(1).max(100),changedIds:z.array(id).min(1).max(100).refine(v=>new Set(v).size===v.length)}).strict()).max(1000)}).strict();
export type WorkbenchSnapshot=z.infer<typeof workbenchSnapshotSchema>;
export const emptyWorkbench=():WorkbenchSnapshot=>({revision:0,rules:[],statements:[],runs:[]});
export function ruleMatches(rule:Pick<FinanceRule,"conditions">,transaction:AccountTransaction):boolean {
  return rule.conditions.every(condition=>{const actual=String(transaction[condition.field]??"").toLocaleLowerCase("en-US"),expected=condition.value.toLocaleLowerCase("en-US");return condition.operator==="equals"?actual===expected:actual.includes(expected);});
}
export function statementDuplicates(row:StatementDraft,transactions:Pick<AccountTransaction,"id"|"accountId"|"date"|"type"|"poisha"|"description">[],accountId:string):string[]{const text=(v:string)=>v.trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");return transactions.filter(t=>t.accountId===accountId&&t.date===row.date&&t.type===row.type&&t.poisha===row.poisha&&text(t.description)===text(row.description)).map(t=>t.id);}

/** RFC-style quoted CSV parser, deliberately bounded before any financial writes. */
export function parseCsv(text:string):string[][] {
  if(new TextEncoder().encode(text).byteLength>1024*1024)throw new Error("Choose a CSV file up to 1 MiB.");
  const input=text.replace(/^\uFEFF/,""),rows:string[][]=[];let row:string[]=[],cell="",quoted=false,afterQuote=false;
  for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||afterQuote)throw new Error("Invalid quote inside a CSV field.");quoted=true;continue;}
    if(afterQuote&&c!==','&&c!=='\r'&&c!=='\n')throw new Error("Unexpected characters after a quoted field.");
    if(c===','){row.push(cell);cell="";afterQuote=false;}else if(c==='\r'||c==='\n'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell="";afterQuote=false;if(rows.length>1001)throw new Error("Import up to 1,000 data rows at a time.");}else cell+=c;
  }
  if(quoted)throw new Error("A quoted CSV field is not closed.");row.push(cell);if(row.some(v=>v.trim()))rows.push(row);if(rows.length>1001)throw new Error("Import up to 1,000 data rows at a time.");return rows;
}
export type CsvMapping={date:number;description:number;amount:number;debit:number;credit:number;mode:"signed"|"debit_credit";dateFormat:"ISO"|"DMY"};
function amount(value:string):bigint|null {const normalized=normalizeBanglaDigits(value).trim().replace(/^(?:BDT|Tk\.?|৳)\s*/i,"");if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(normalized))return null;const negative=normalized.startsWith('-'),[whole,fraction=""]=normalized.replace('-','').replaceAll(',','').split('.');const exact=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return negative?-exact:exact;}
export function mapCsv(rows:string[][],mapping:CsvMapping):{line:number;draft:StatementDraft|null;error:string}[]{
  return rows.slice(1).map((row,index)=>{try{const rawDate=normalizeBanglaDigits(row[mapping.date]??'').trim();let iso=rawDate;if(mapping.dateFormat==='DMY'){const match=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(rawDate);if(!match)throw new Error("Use day/month/four-digit-year dates.");iso=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;}if(!validDate(iso))throw new Error("Invalid or ambiguous transaction date.");const description=(row[mapping.description]??'').trim();if(!description||description.length>120)throw new Error("Description must contain 1–120 characters.");let signed:bigint|null;
      if(mapping.mode==='signed')signed=amount(row[mapping.amount]??'');else{const debitText=(row[mapping.debit]??'').trim(),creditText=(row[mapping.credit]??'').trim();const debit=debitText?amount(debitText):0n,credit=creditText?amount(creditText):0n;if(debit===null||credit===null||debit<0n||credit<0n||debit>0n&&credit>0n)throw new Error("Each row needs one positive debit or credit, not both.");signed=credit-debit;}
      if(signed===null||signed===0n||signed>BigInt(Number.MAX_SAFE_INTEGER)||signed< -BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Use a nonzero safe BDT amount with up to two decimals.");const type=signed<0n?'expense':'income';return{line:index+2,draft:{date:iso,description,type,poisha:Number(signed<0n?-signed:signed),category:type==='expense'?'Groceries':'Other income',categoryId:null},error:''};
    }catch(error){return{line:index+2,draft:null,error:error instanceof Error?error.message:'Invalid row.'};}});
}
