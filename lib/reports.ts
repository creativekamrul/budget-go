import { validDate } from "./preview";
import { accountBalance, categoryInSubtree, resolveCategoryId, topLevelCategoryBudgets, type AccountTransaction, type WorkspaceData } from "./workspace";

export type ReportPeriod = "monthly" | "quarterly" | "ytd" | "fiscal_ytd" | "last_6_months" | "custom";
export type DateRange = { start: string; end: string };
const DAY = 86_400_000;
export const MAX_REPORT_DAYS = 3660;
const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (value: number | Date) => new Date(value).toISOString().slice(0, 10);
const monthFirst = (year: number, month: number) => iso(Date.UTC(year, month, 1));
const monthLast = (year: number, month: number) => iso(Date.UTC(year, month + 1, 0));

export function validateReportRange(range: DateRange): DateRange {
  if (!validDate(range.start) || !validDate(range.end)) throw new Error("Choose valid dates in years 1000–9999.");
  if (range.start > range.end) throw new Error("The start date must be on or before the end date.");
  if ((timestamp(range.end) - timestamp(range.start)) / DAY + 1 > MAX_REPORT_DAYS) throw new Error("Choose up to ten years per report.");
  return range;
}

export function reportRange(period: ReportPeriod, anchor: string, custom?: DateRange, fiscalStartMonth = 7): DateRange {
  if (!validDate(anchor)) throw new Error("Choose a valid report date.");
  const [year, month] = anchor.split("-").map(Number);
  const index = month - 1;
  let range: DateRange;
  switch (period) {
    case "monthly": range = { start: monthFirst(year, index), end: monthLast(year, index) }; break;
    case "quarterly": { const quarter = Math.floor(index / 3) * 3; range = { start: monthFirst(year, quarter), end: monthLast(year, quarter + 2) }; break; }
    case "ytd": range = { start: `${year}-01-01`, end: anchor }; break;
    case "fiscal_ytd": {
      if (!Number.isInteger(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12) throw new Error("Choose a fiscal start month between 1 and 12.");
      range = { start: monthFirst(month < fiscalStartMonth ? year - 1 : year, fiscalStartMonth - 1), end: anchor };
      break;
    }
    case "last_6_months": range = { start: monthFirst(year, index - 5), end: monthLast(year, index) }; break;
    case "custom": if (!custom) throw new Error("Choose a custom start and end date."); range = custom; break;
  }
  return validateReportRange(range);
}

/** Immediately preceding inclusive interval with exactly the same number of days. */
export function previousRange(range: DateRange): DateRange | null {
  validateReportRange(range);
  const days = (timestamp(range.end) - timestamp(range.start)) / DAY + 1;
  const previous = { start: iso(timestamp(range.start) - days * DAY), end: iso(timestamp(range.start) - DAY) };
  return validDate(previous.start) && validDate(previous.end) ? previous : null;
}

export function shiftReportAnchor(period: ReportPeriod, anchor: string, direction: -1 | 1): string | null {
  if (!validDate(anchor)) return null;
  const [year, month, day] = anchor.split("-").map(Number);
  const months = period === "quarterly" ? 3 : period === "last_6_months" ? 6 : period === "ytd" || period === "fiscal_ytd" ? 12 : 1;
  const first = new Date(Date.UTC(year, month - 1 + months * direction, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shifted = iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last)));
  return validDate(shifted) ? shifted : null;
}

export function shiftCustomRange(range: DateRange, direction: -1 | 1): DateRange | null {
  validateReportRange(range);
  const days = (timestamp(range.end) - timestamp(range.start)) / DAY + 1;
  const shifted = { start: iso(timestamp(range.start) + days * DAY * direction), end: iso(timestamp(range.end) + days * DAY * direction) };
  return validDate(shifted.start) && validDate(shifted.end) ? shifted : null;
}

export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number(BigInt(current) - BigInt(previous)) / Math.abs(previous) * 100;
}
const total = (entries: AccountTransaction[], type: "income" | "expense") => Number(entries.filter(t => t.type === type).reduce((sum, t) => sum + BigInt(t.poisha), 0n));
const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator * 100;
function average(amount: number, count: number) {
  if (!count) return 0;
  const sign = amount < 0 ? -1n : 1n;
  return Number(((BigInt(Math.abs(amount)) + BigInt(Math.floor(count / 2))) / BigInt(count)) * sign);
}

export function buildReport(data: WorkspaceData, range: DateRange, asOf: string) {
  validateReportRange(range);
  if (!validDate(asOf)) throw new Error("Use a valid report as-of date.");
  const observedEnd = range.end < asOf ? range.end : asOf;
  const observed = observedEnd >= range.start ? { start: range.start, end: observedEnd } : null;
  const comparison = observed ? previousRange(observed) : null;
  const between = (t: AccountTransaction, interval: DateRange | null) => t.status !== "pending" && !t.excluded && interval !== null && t.date >= interval.start && t.date <= interval.end;
  const transactions = data.transactions.filter(t => between(t, observed)).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const prior = data.transactions.filter(t => between(t, comparison));
  const incomePoisha = total(transactions, "income"), expensePoisha = total(transactions, "expense");
  const previousIncomePoisha = total(prior, "income"), previousExpensePoisha = total(prior, "expense");
  const months = [];
  const [startYear, startMonth] = range.start.split("-").map(Number);
  for (let date = monthFirst(startYear, startMonth - 1); date.slice(0, 7) <= range.end.slice(0, 7);) {
    const month = date.slice(0, 7);
    const entries = transactions.filter(t => t.date.startsWith(month));
    const income = total(entries, "income"), expense = total(entries, "expense");
    months.push({ month, incomePoisha: income, expensePoisha: expense, netPoisha: income - expense, savingsRate: ratio(income - expense, income) });
    const [year, monthNumber] = month.split("-").map(Number);
    // Avoid formatting year10000 when the last valid month is December9999.
    if (month === range.end.slice(0, 7)) break;
    date = monthFirst(year, monthNumber);
  }
  const includedBudgets = data.budgets.filter(b => b.month >= range.start.slice(0, 7) && b.month <= range.end.slice(0, 7));
  // A parent's limit already covers its subtree. Do not add a child's limit again
  // or count a transaction twice when both parent and child have a plan.
  const topLevelBudgets = topLevelCategoryBudgets(data, includedBudgets);
  const budgetLimitPoisha = Number(topLevelBudgets.reduce((sum, b) => sum + BigInt(b.limitPoisha), 0n));
  const budgetSpendPoisha = Number(transactions.filter(t => t.type === "expense" && includedBudgets.some(b => {
    const rootId = resolveCategoryId(data, b.categoryId, b.category);
    return b.month === t.date.slice(0, 7) && (rootId ? categoryInSubtree(data, resolveCategoryId(data, t.categoryId, t.category), rootId) : b.category === t.category);
  })).reduce((sum, t) => sum + BigInt(t.poisha), 0n));
  const groups = new Map<string, { type: "income" | "expense"; category: string; poisha: bigint; count: number }>();
  for (const t of transactions) {
    const key = `${t.type}:${t.category}`;
    const group = groups.get(key) ?? { type: t.type, category: t.category, poisha: 0n, count: 0 };
    group.poisha += BigInt(t.poisha); group.count++;
    groups.set(key, group);
  }
  const activityGroups = [...groups.values()].map(group => ({ ...group, poisha: Number(group.poisha) })).sort((a, b) => a.type.localeCompare(b.type) || b.poisha - a.poisha || a.category.localeCompare(b.category));
  const balanceDate = observedEnd;
  const beforeStart = observed ? previousRange({ start: range.start, end: range.start })?.end : balanceDate;
  const accounts = data.accounts.map(account => ({ ...account, balancePoisha: accountBalance(data, account.id, balanceDate), startPoisha: beforeStart ? accountBalance(data, account.id, beforeStart) : 0 }));
  const balancePoisha = Number(accounts.reduce((sum, a) => sum + BigInt(a.balancePoisha), 0n));
  const startBalancePoisha = Number(accounts.reduce((sum, a) => sum + BigInt(a.startPoisha), 0n));
  return {
    range, observed, comparison, asOf, transactions, incomePoisha, expensePoisha, netPoisha: incomePoisha - expensePoisha,
    previousIncomePoisha, previousExpensePoisha,
    incomeChange: comparison ? percentageChange(incomePoisha, previousIncomePoisha) : null,
    expenseChange: comparison ? percentageChange(expensePoisha, previousExpensePoisha) : null,
    savingsRate: ratio(incomePoisha - expensePoisha, incomePoisha),
    budgetLimitPoisha, budgetSpendPoisha, budgetUsage: ratio(budgetSpendPoisha, budgetLimitPoisha),
    months, averageMonthCount: observed ? months.filter(m => m.month <= observedEnd.slice(0, 7)).length : 0,
    averageIncomePoisha: average(incomePoisha, observed ? months.filter(m => m.month <= observedEnd.slice(0, 7)).length : 0), averageExpensePoisha: average(expensePoisha, observed ? months.filter(m => m.month <= observedEnd.slice(0, 7)).length : 0), averageNetPoisha: average(incomePoisha - expensePoisha, observed ? months.filter(m => m.month <= observedEnd.slice(0, 7)).length : 0),
    activityGroups, accounts, balancePoisha, startBalancePoisha, balanceChangePoisha: balancePoisha - startBalancePoisha,
    unassignedCount: transactions.filter(t => t.accountId === null).length,
  };
}

function csvText(value: string) {
  // Quote all fields and neutralize spreadsheet formula prefixes in user-controlled text.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
function decimal(poisha: number) {
  const absolute = BigInt(Math.abs(poisha));
  return `${poisha < 0 ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function transactionsCsv(data: WorkspaceData, rows: AccountTransaction[]): string {
  const names = new Map(data.accounts.map(a => [a.id, a.name]));
  const merchants = new Map((data.merchants ?? []).map(m => [m.id, m.name]));
  const tags = new Map((data.tags ?? []).map(t => [t.id, t.name]));
  const lines = ["Date,Description,Type,Category,Account,Merchant,Tags,Notes,Status,Excluded,Amount (BDT),Currency"];
  for (const t of rows) lines.push([
    csvText(t.date), csvText(t.description), csvText(t.type), csvText(t.category), csvText(t.accountId === null ? "Unassigned" : names.get(t.accountId) ?? "Unknown account"),
    csvText(t.merchantId ? merchants.get(t.merchantId) ?? "" : ""), csvText((t.tagIds ?? []).map(id => tags.get(id) ?? "").filter(Boolean).join("; ")), csvText(t.notes ?? ""), csvText(t.status ?? "confirmed"), t.excluded ? "true" : "false",
    decimal(t.poisha * (t.type === "expense" ? -1 : 1)), "BDT",
  ].join(","));
  return lines.join("\r\n") + "\r\n";
}
