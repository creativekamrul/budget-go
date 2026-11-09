import { z } from "zod";
import { validDate } from "./preview";
import { monthValid } from "./finance";
import { workspaceDataSchema } from "./workspace";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const date = z.string().refine(validDate, "Use a real YYYY-MM-DD date in years 1000–9999.");
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const recurringTransactionSchema = z.object({
  accountId: id, description: z.string().trim().min(1).max(120), type: z.enum(["income", "expense"]),
  category: z.string().max(80), categoryId: id.nullable(), poisha: money.refine(n => n > 0, "Amount must be positive."),
  merchantId: id.nullable(), tagIds: z.array(id).max(500).refine(ids => new Set(ids).size === ids.length),
  notes: z.string().max(2000), status: z.enum(["confirmed", "pending"]), excluded: z.boolean(),
}).strict();
export const recurringScheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(80), transaction: recurringTransactionSchema,
  startDate: date, frequency: z.enum(["weekly", "monthly", "yearly"]), active: z.boolean(),
}).strict();
export const recurringScheduleSchema = recurringScheduleInputSchema.extend({id,archived:z.boolean()});
export type RecurringSchedule = z.infer<typeof recurringScheduleSchema>;
export const planningCommandSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("monthly_plan_set"),month:z.string().refine(monthValid),incomePoisha:money,spendingPoisha:money}).strict(),
  z.object({type:z.literal("recurring_create"),schedule:recurringScheduleInputSchema}).strict(),
  z.object({type:z.literal("recurring_update"),id,schedule:recurringScheduleInputSchema}).strict(),
  z.object({type:z.literal("recurring_archive"),id,archived:z.boolean()}).strict(),
  z.object({type:z.literal("recurring_record"),id,date}).strict(),
]);
export type PlanningCommand = z.infer<typeof planningCommandSchema>;
export const planningSnapshotSchema = z.object({
  revision:money,
  recurring:z.array(recurringScheduleSchema).max(500),
  occurrences:z.array(z.object({id,scheduleId:id,date,transactionId:id}).strict()).max(5000),
  splits:z.array(z.object({id,originalTransactionId:id,original:workspaceDataSchema.shape.transactions.element,partIds:z.array(id).min(2).max(20),createdAt:z.string()}).strict()).max(1000),
  monthlyPlans:z.array(z.object({month:z.string().refine(monthValid),incomePoisha:money,spendingPoisha:money}).strict()).max(1000),
}).strict();
export type PlanningData = z.infer<typeof planningSnapshotSchema>;
export type PlanningSnapshot = PlanningData;
export const emptyPlanning = (): PlanningData => ({revision:0,recurring:[],occurrences:[],splits:[],monthlyPlans:[]});

const timestamp = (value:string) => Date.parse(`${value}T00:00:00Z`);
function dateAt(year:number,month:number,day:number):string | null {
  if (year < 1000 || year > 9999) return null;
  const last = new Date(Date.UTC(year,month,0)).getUTCDate();
  const result = `${year}-${String(month).padStart(2,"0")}-${String(Math.min(day,last)).padStart(2,"0")}`;
  return validDate(result) ? result : null;
}
type ScheduleTiming = Pick<RecurringSchedule,"startDate"|"frequency">;
export function isOccurrenceDate(schedule:ScheduleTiming,value:string):boolean {
  if (!validDate(schedule.startDate) || !validDate(value) || value < schedule.startDate) return false;
  const [year,month,day] = value.split("-").map(Number);
  const [,anchorMonth,anchorDay] = schedule.startDate.split("-").map(Number);
  if (schedule.frequency === "weekly") return (timestamp(value)-timestamp(schedule.startDate)) % (7*86400000) === 0;
  if (schedule.frequency === "yearly" && month !== anchorMonth) return false;
  return value === dateAt(year,month,anchorDay) && day > 0;
}
/** Calendar projections only. These dates never post financial entries. */
export function upcomingOccurrences(schedule:RecurringSchedule,from:string,to:string,recordedDates:string[]=[]):string[] {
  if (!validDate(from) || !validDate(to) || from > to || !validDate(schedule.startDate) || !schedule.active || schedule.archived) return [];
  const recorded = new Set(recordedDates);
  const result:string[] = [];
  const start = from > schedule.startDate ? from : schedule.startDate;
  if (start > to) return result;
  if (schedule.frequency === "weekly") {
    const anchor = timestamp(schedule.startDate), first = anchor+Math.ceil((timestamp(start)-anchor)/(7*86400000))*7*86400000;
    for (let time=first;time<=timestamp(to);time+=7*86400000) {
      const value=new Date(time).toISOString().slice(0,10);if (!recorded.has(value)) result.push(value);
      if (result.length >= 1000) break;
    }
  } else {
    const [anchorYear,anchorMonth,anchorDay] = schedule.startDate.split("-").map(Number);
    const [firstYear,firstMonth] = start.split("-").map(Number);
    if (schedule.frequency === "yearly") {
      for (let year=Math.max(anchorYear,firstYear);year<=Number(to.slice(0,4));year++) {
        const value=dateAt(year,anchorMonth,anchorDay);if(value && value>=start && value<=to && !recorded.has(value))result.push(value);
        if(result.length>=1000)break;
      }
    } else {
      let index=firstYear*12+firstMonth-1;const final=Number(to.slice(0,4))*12+Number(to.slice(5,7))-1;
      for(;index<=final;index++) {
        const value=dateAt(Math.floor(index/12),index%12+1,anchorDay);if(value&&value>=start&&value<=to&&!recorded.has(value))result.push(value);
        if(result.length>=1000)break;
      }
    }
  }
  return result;
}
export function nextOccurrence(schedule:RecurringSchedule,from:string,recordedDates:string[]=[]):string|null {
  return upcomingOccurrences(schedule,from,"9999-12-31",recordedDates)[0] ?? null;
}
