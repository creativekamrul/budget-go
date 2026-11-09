"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FinanceShell } from "./finance-shell";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Download, Gauge, Printer, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { validDate } from "@/lib/preview";
import { formatMoney, todayInDhaka } from "@/lib/presentation";
import { usePreferences } from "@/lib/use-preferences";
import { buildReport, reportRange, shiftCustomRange, shiftReportAnchor, transactionsCsv, validateReportRange, type DateRange, type ReportPeriod } from "@/lib/reports";
import { accountKindLabels } from "@/lib/workspace";
import { useWorkspace } from "@/lib/use-workspace";
import styles from "@/app/reports.module.css";

const periods = [{ key: "monthly", label: "Monthly" }, { key: "quarterly", label: "Quarterly" }, { key: "ytd", label: "Year to Date" }, { key: "fiscal_ytd", label: "Fiscal YTD" }, { key: "last_6_months", label: "Last 6 Months" }, { key: "custom", label: "Custom Range" }] as const;
function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) { return new Intl.DateTimeFormat("en-BD", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function periodLabel(period: ReportPeriod, range: DateRange) {
  if (period === "monthly") return formatDate(range.start, { month: "long", year: "numeric" });
  if (period === "quarterly") return `Q${Math.floor((Number(range.start.slice(5, 7)) - 1) / 3) + 1} ${range.start.slice(0, 4)}`;
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}
function changeLabel(value: number | null) { return value === null ? "No previous activity" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`; }
function percentage(value: number | null) { return value === null ? "—" : `${value.toFixed(1)}%`; }

export function FinanceReports() {
  const store = useWorkspace();
  const { preferences } = usePreferences();
  const money = (poisha: number) => formatMoney(poisha, preferences.locale);
  const root = useRef<HTMLDivElement>(null);
  const [today] = useState(todayInDhaka);
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState<DateRange>(() => reportRange("monthly", today));
  const [draft, setDraft] = useState<DateRange>(custom);
  const [rangeError, setRangeError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let saved: Map<HTMLDetailsElement, boolean> | null = null;
    const beforePrint = () => {
      // Print all report sections, including when printing through the browser menu.
      if (saved) return;
      saved = new Map(Array.from(root.current?.querySelectorAll<HTMLDetailsElement>("details") ?? []).map(section => [section, section.open]));
      for (const section of saved.keys()) section.open = true;
    };
    const afterPrint = () => {
      if (!saved) return;
      for (const [section, open] of saved) if (section.isConnected) section.open = open;
      saved = null;
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => { window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint); afterPrint(); };
  }, []);
  const range = reportRange(period, anchor, custom, preferences.fiscalYearStartMonth);
  const report = buildReport(store.data, range, today);
  const comparisonDays = report.comparison ? Math.round((Date.parse(`${report.comparison.end}T00:00:00Z`) - Date.parse(`${report.comparison.start}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  const comparisonText = report.comparison ? `vs previous ${comparisonDays} ${comparisonDays === 1 ? "day" : "days"}` : "No earlier comparison";
  const ready = store.status === "ready";
  function candidate(direction: -1 | 1) {
    try {
      if (period === "custom") return shiftCustomRange(custom, direction);
      const next = shiftReportAnchor(period, anchor, direction);
      return next ? reportRange(period, next, undefined, preferences.fiscalYearStartMonth) : null;
    } catch { return null; }
  }
  function move(direction: -1 | 1) {
    const next = candidate(direction);
    if (!next) return;
    if (period === "custom") { setCustom(next); setDraft(next); }
    else { const shifted = shiftReportAnchor(period, anchor, direction); if (shifted) setAnchor(shifted); }
    setRangeError("");
  }
  function selectPeriod(next: ReportPeriod) {
    try { reportRange(next, anchor, custom, preferences.fiscalYearStartMonth); setPeriod(next); setRangeError(""); }
    catch (error) { setRangeError(error instanceof Error ? error.message : "Choose another report date."); }
  }
  function applyRange(event: React.FormEvent) {
    event.preventDefault();
    try { validateReportRange(draft); setCustom({ ...draft }); setRangeError(""); }
    catch (error) { setRangeError(error instanceof Error ? error.message : "Choose a valid range."); }
  }
  function exportCsv() {
    if (!ready) return;
    try {
      const blob = new Blob(["\uFEFF", transactionsCsv(store.data, report.transactions)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `budget-go-activity-${range.start}-${range.end}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Activity CSV download started. It contains private income and expense records; keep it somewhere safe.");
    } catch { setNotice("CSV download could not start. Your saved finances have not changed."); }
  }
  return <FinanceShell active="Reports" data={store.data}><div ref={root} className={styles.root}>
    <a className={styles.skip} href="#workspace-main">Skip to report</a>

    <main className={styles.main} id="workspace-main" tabIndex={-1}>
      <div className={styles.heading}><div><h1>Reports</h1><p>Understand your income, spending and account balances.</p></div><button className={styles.outline} disabled={!ready} onClick={() => window.print()}><Printer size={17} aria-hidden="true" />Print report</button></div>
      <div className={styles.periods} role="group" aria-label="Report period">{periods.map(item => <button key={item.key} aria-pressed={period === item.key} onClick={() => selectPeriod(item.key)}>{item.label}</button>)}</div>
      <div className={styles.periodNavigation}><div><button className={styles.iconButton} aria-label="Previous report period" disabled={!candidate(-1)} onClick={() => move(-1)}><ChevronLeft size={19} aria-hidden="true" /></button><button className={styles.iconButton} aria-label="Next report period" disabled={!candidate(1) || (candidate(1)?.start ?? "") > today} onClick={() => move(1)}><ChevronRight size={19} aria-hidden="true" /></button><strong>{periodLabel(period, range)}</strong></div><button className={styles.outline} onClick={() => { setAnchor(today); if (period === "custom") { const current = reportRange("monthly", today); setCustom(current); setDraft(current); } setRangeError(""); }}>Today</button></div>
      {period === "custom" ? <form className={styles.rangeForm} onSubmit={applyRange} noValidate><label>From<input aria-label="Report start date" type="date" min="1000-01-01" max="9999-12-31" value={draft.start} onChange={e => setDraft(current => ({ ...current, start: e.target.value }))} /></label><label>To<input aria-label="Report end date" type="date" min="1000-01-01" max="9999-12-31" value={draft.end} onChange={e => setDraft(current => ({ ...current, end: e.target.value }))} /></label><button className={styles.primary} type="submit">Apply range</button><p>Inclusive dates · up to ten years</p></form> : <div className={styles.anchorControl}><label htmlFor="report-anchor">Report date</label><input id="report-anchor" type="date" min="1000-01-01" max="9999-12-31" value={anchor} onChange={event => { if (!validDate(event.target.value)) return; try { reportRange(period, event.target.value); setAnchor(event.target.value); setRangeError(""); } catch (error) { setRangeError(error instanceof Error ? error.message : "Choose another date."); } }} /></div>}
      {rangeError && <p className={styles.error} role="alert">{rangeError} The last valid range is still shown.</p>}
      {store.error && <div className={styles.error} role="alert"><p>{store.error}</p>{store.status === "unauthenticated" ? <Link href="/login">Sign in again</Link> : <button className={styles.outline} onClick={() => void store.reload()}><RefreshCw size={16} aria-hidden="true" />Retry loading report</button>}</div>}
      {store.status === "loading" ? <p className={styles.loading} role="status">Loading your report…</p> : ready && <>
        <p className={styles.scope}>Posted activity through {formatDate(report.observed?.end ?? today)}. Transfers and opening balances are excluded from income and spending.{report.unassignedCount > 0 && ` Includes ${report.unassignedCount} unassigned legacy ${report.unassignedCount === 1 ? "entry" : "entries"}.`}</p>
        <div className={styles.summaries}>
          <section className={styles.summary}><h2><TrendingUp size={17} aria-hidden="true" />Total income</h2><strong>{money(report.incomePoisha)}</strong><p><span className={styles.positive}>{changeLabel(report.incomeChange)}</span> {comparisonText}</p></section>
          <section className={styles.summary}><h2><ArrowUpRight size={17} aria-hidden="true" />Total expenses</h2><strong>{money(report.expensePoisha)}</strong><p><span>{changeLabel(report.expenseChange)}</span> {comparisonText}</p></section>
          <section className={styles.summary}><h2><Wallet size={17} aria-hidden="true" />Net savings</h2><strong className={report.netPoisha >= 0 ? styles.positive : styles.negative}>{money(report.netPoisha)}</strong><p>Income minus expenses</p></section>
          <section className={styles.summary}><h2><Gauge size={17} aria-hidden="true" />Budget performance</h2><strong>{report.budgetUsage === null ? "—" : percentage(report.budgetUsage)}</strong>{report.budgetUsage !== null && <div className={styles.track} role="progressbar" aria-label="Selected category budgets used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(report.budgetUsage))} aria-valuetext={`${percentage(report.budgetUsage)} used`}><span style={{ width: `${Math.min(100, report.budgetUsage)}%` }} /></div>}<p>{report.budgetUsage === null ? "No budgets for this range" : `${money(report.budgetSpendPoisha)} of ${money(report.budgetLimitPoisha)}`}</p></section>
        </div>
        {report.comparison && <p className={styles.comparison}>Comparison: {formatDate(report.comparison.start)} – {formatDate(report.comparison.end)}; the same number of observed calendar days.</p>}
        <details className={styles.section} open><summary><ChevronDown size={17} aria-hidden="true" />Trends & insights</summary><div className={styles.sectionBody}><h3>Monthly breakdown</h3><div className={styles.tableScroll} role="region" aria-label="Monthly breakdown table" tabIndex={0}><table><thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net</th><th scope="col">Savings rate</th></tr></thead><tbody>{report.months.map(row => <tr key={row.month}><th scope="row">{formatDate(`${row.month}-01`, { month: "short", year: "numeric" })}{row.month > today.slice(0, 7) && <small>Future · not posted</small>}</th><td>{money(row.incomePoisha)}</td><td>{money(row.expensePoisha)}</td><td className={row.netPoisha >= 0 ? styles.positive : styles.negative}>{money(row.netPoisha)}</td><td>{percentage(row.savingsRate)}</td></tr>)}</tbody></table></div><div className={styles.averages}><div><span>Avg. monthly income</span><strong className={styles.positive}>{money(report.averageIncomePoisha)}</strong></div><div><span>Avg. monthly expenses</span><strong>{money(report.averageExpensePoisha)}</strong></div><div><span>Avg. monthly savings</span><strong className={report.averageNetPoisha >= 0 ? styles.positive : styles.negative}>{money(report.averageNetPoisha)}</strong></div></div><p className={styles.helper}>Averages use {report.averageMonthCount} observed {report.averageMonthCount === 1 ? "month" : "months"}, including a partial current month, and round to the nearest poisha. A zero income has no savings rate.</p></div></details>
        <details className={styles.section} open><summary><ChevronDown size={17} aria-hidden="true" />Activity breakdown</summary><div className={styles.sectionBody}><div className={styles.sectionHeading}><h3>Income and expense categories</h3><button className={styles.outline} onClick={exportCsv}><Download size={16} aria-hidden="true" />CSV</button></div>{report.activityGroups.length ? <div className={styles.activity}>{report.activityGroups.map(group => <div key={`${group.type}-${group.category}`}><span className={styles.activityIcon}>{group.type === "income" ? <ArrowDownRight size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}</span><div><strong>{group.category}</strong><p>{group.type === "income" ? "Income" : "Expense"} · {group.count} {group.count === 1 ? "entry" : "entries"}</p></div><strong className={group.type === "income" ? styles.positive : undefined}>{money(group.poisha)}</strong></div>)}</div> : <div className={styles.empty}><p>No posted income or expenses for this range.</p><span>Choose a different period to see activity.</span></div>}<p className={styles.helper}>CSV contains the underlying posted income and expense entries, not transfers. Full monthly budget limits apply to selected categories; limits are not prorated for partial months.</p></div></details>
        <details className={styles.section} open><summary><ChevronDown size={17} aria-hidden="true" />Account balances</summary><div className={styles.sectionBody}><div className={styles.balanceSummary}><div><span>Net worth</span><strong>{money(report.balancePoisha)}</strong><small>As of {formatDate(report.observed?.end ?? today)}</small></div><div><span>Change during observed period</span><strong className={report.balanceChangePoisha >= 0 ? styles.positive : styles.negative}>{money(report.balanceChangePoisha)}</strong><small>Includes openings, posted entries and dated valuations</small></div></div>{report.accounts.length ? <div className={styles.accountList}>{report.accounts.map(account => <div key={account.id}><div><strong>{account.name}</strong><p>{accountKindLabels[account.kind]}{account.archived && " · Archived"}</p></div><strong>{money(account.balancePoisha)}</strong></div>)}</div> : <p className={styles.empty}>No accounts yet. Add one in your workspace to track balances.</p>}<p className={styles.helper}>All manual BDT positions, including archived assets and debts. Positive positions are assets; negative positions are liabilities. No live prices or currency conversion.</p></div></details>
      </>}
      <footer className={styles.footer}><span>Budget Go · Reports</span><span>Private BDT finances · No data changed</span></footer><p className={styles.notice} role="status" aria-live="polite">{notice}</p>
    </main>
  </div></FinanceShell>;
}
