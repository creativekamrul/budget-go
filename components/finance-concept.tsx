"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, BarChart3, Building2, Check, CircleHelp, CreditCard, LayoutGrid, Search, ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Target, Utensils, Wallet, X } from "lucide-react";
import styles from "@/app/concept/concept.module.css";

type View = "Overview" | "Accounts" | "Transactions" | "Budgets";
type Range = "1M" | "3M" | "6M" | "1Y";
const money = (amount: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(amount);
const accounts = [
  { name: "Everyday account", kind: "Bank account", balance: 182500, icon: Building2, color: "blue" },
  { name: "Savings", kind: "Bank account", balance: 96500, icon: Building2, color: "violet" },
  { name: "Mobile wallet", kind: "Mobile money", balance: 18650, icon: Smartphone, color: "pink" },
  { name: "Cash", kind: "Cash account", balance: 5000, icon: Wallet, color: "amber" },
];
const transactions = [
  { id: 1, name: "Weekly groceries", category: "Groceries", account: "Everyday account", date: "2026-11-07", displayDate: "7 Nov", amount: -2450, icon: ShoppingBasket, color: "green" },
  { id: 2, name: "Dinner with friends", category: "Dining out", account: "Mobile wallet", date: "2026-11-07", displayDate: "7 Nov", amount: -1180, icon: Utensils, color: "amber" },
  { id: 3, name: "November salary", category: "Income", account: "Everyday account", date: "2026-11-05", displayDate: "5 Nov", amount: 95000, icon: ArrowDownLeft, color: "blue" },
  { id: 4, name: "New headphones", category: "Shopping", account: "Everyday account", date: "2026-11-04", displayDate: "4 Nov", amount: -4500, icon: ShoppingBag, color: "violet" },
  { id: 5, name: "Lunch break", category: "Dining out", account: "Cash", date: "2026-11-03", displayDate: "3 Nov", amount: -320, icon: Utensils, color: "amber" },
];
const budgets = [
  { category: "Groceries", spent: 6200, limit: 10000, icon: ShoppingBasket, color: "green" },
  { category: "Dining out", spent: 4200, limit: 5000, icon: Utensils, color: "amber" },
  { category: "Transport", spent: 2450, limit: 4000, icon: ArrowLeftRight, color: "blue" },
  { category: "Shopping", spent: 16200, limit: 15000, icon: ShoppingBag, color: "violet" },
];
const ranges: Record<Range, { labels: string[]; values: number[] }> = {
  "1M": { labels: ["8 Oct", "14 Oct", "20 Oct", "26 Oct", "1 Nov", "8 Nov"], values: [267900, 270200, 268800, 273600, 275100, 271300, 277200, 276000, 280500, 278900, 283400, 284650] },
  "3M": { labels: ["Aug", "Sep", "Oct", "Nov"], values: [236400, 242600, 239200, 251000, 247800, 259000, 255500, 266200, 267900, 275100, 278900, 284650] },
  "6M": { labels: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"], values: [198000, 213500, 206000, 225600, 220000, 236400, 239200, 251000, 259000, 267900, 275100, 284650] },
  "1Y": { labels: ["Dec 2025", "Mar", "Jun", "Sep", "Nov"], values: [145000, 153000, 170000, 163000, 188000, 198000, 213500, 220000, 236400, 251000, 267900, 284650] },
};
const nav = [{ title: "Overview", icon: LayoutGrid }, { title: "Accounts", icon: Wallet }, { title: "Transactions", icon: ArrowLeftRight }, { title: "Budgets", icon: Target }] as const;

export function FinanceConcept() {
  const [view, setView] = useState<View>("Overview");
  const [range, setRange] = useState<Range>("1M");
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("all");
  const series = ranges[range];
  const change = 284650 - series.values[0];
  const lower = Math.min(...series.values) - (Math.max(...series.values) - Math.min(...series.values)) * .35;
  const upper = Math.max(...series.values) + (Math.max(...series.values) - Math.min(...series.values)) * .2;
  const coords = series.values.map((value, index) => `${index * 900 / (series.values.length - 1)},${210 - (value - lower) / (upper - lower) * 190}`);
  const line = `M${coords.join(" L")}`;
  const visibleTransactions = transactions.filter(t => (account === "all" || t.account === account) && `${t.name} ${t.category} ${t.account}`.toLowerCase().includes(search.toLowerCase().trim()));
  const navigate = (next: View) => { setView(next); setSearch(""); setAccount("all"); };
  const inspectAccount = (name: string) => { setAccount(name); setSearch(""); setView("Transactions"); };

  const transactionList = (compact = false) => <>
    {visibleTransactions.length ? <div className={styles.transactionRows}>{visibleTransactions.slice(0, compact ? 4 : undefined).map(t => <div className={styles.transaction} key={t.id}>
      <span className={`${styles.iconTile} ${styles[t.color]}`}><t.icon size={18} aria-hidden="true" /></span>
      <div className={styles.transactionName}><strong>{t.name}</strong><span>{t.category}<span className={styles.dot}>·</span>{t.account}</span></div>
      <time dateTime={t.date}>{t.displayDate}</time>
      <strong className={`${styles.transactionAmount} ${t.amount > 0 ? styles.positive : ""}`}>{t.amount > 0 ? "+" : "−"}{money(Math.abs(t.amount))}<span>{t.amount > 0 ? "Income" : "Expense"}</span></strong>
    </div>)}</div> : <div className={styles.empty}><Search size={28} aria-hidden="true" /><h3>No matching transactions</h3><p>Try another account or search term.</p><button className={styles.textButton} onClick={() => { setSearch(""); setAccount("all"); }}>Reset filters <ArrowRight size={16} aria-hidden="true" /></button></div>}
  </>;

  const budgetList = (compact = false) => <div className={styles.budgetRows}>{budgets.slice(0, compact ? 3 : undefined).map(b => {
    const ratio = b.spent / b.limit;
    const status = ratio > 1 ? "Over budget" : ratio >= .8 ? "Near limit" : "On track";
    return <div className={styles.budgetRow} key={b.category}><div className={styles.budgetTop}><span className={`${styles.smallIcon} ${styles[b.color]}`}><b.icon size={16} aria-hidden="true" /></span><strong>{b.category}</strong><span className={ratio > 1 ? styles.negative : styles.muted}>{status}</span></div><div className={styles.progress} role="progressbar" aria-label={`${b.category}: ${money(b.spent)} spent of ${money(b.limit)}, ${status}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(ratio * 100))}><span className={ratio > 1 ? styles.overBar : ""} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div><div className={styles.budgetAmounts}><span>{money(b.spent)} <span className={styles.muted}>of {money(b.limit)}</span></span><span className={ratio > 1 ? styles.negative : styles.muted}>{ratio > 1 ? `${money(b.spent - b.limit)} over` : `${Math.round(ratio * 100)}%`}</span></div></div>;
  })}</div>;

  return <div className={styles.root}>
    <a className={styles.skipLink} href="#concept-main">Skip to finance overview</a>
    <aside className={styles.sidebar} aria-label="Workspace sidebar">
      <div className={styles.brand}><span className={styles.brandMark}><BarChart3 size={21} strokeWidth={2.3} aria-hidden="true" /></span><span>budget<span className={styles.brandGo}>go</span></span></div>
      <div className={styles.workspaceLabel}><span className={styles.avatar}>P</span><div><strong>Personal workspace</strong><span>All your money, together</span></div></div>
      <nav className={styles.navigation} aria-label="Concept navigation">{nav.map(item => <button key={item.title} aria-current={view === item.title ? "page" : undefined} className={`${styles.navButton} ${view === item.title ? styles.active : ""}`} onClick={() => navigate(item.title)}><item.icon size={18} aria-hidden="true" />{item.title}{view === item.title && <span className={styles.activeDot} />}</button>)}</nav>
      <div className={styles.sidebarAccounts}><div className={styles.sidebarSectionTitle}>YOUR ACCOUNTS <span>BDT</span></div><div className={styles.accountGroup}>Cash & bank <span>{money(302650)}</span></div>{accounts.map(a => <button className={styles.sidebarAccount} key={a.name} onClick={() => inspectAccount(a.name)}><a.icon size={16} aria-hidden="true" /><span>{a.name}</span><strong>{money(a.balance)}</strong></button>)}<div className={styles.accountGroup}>Credit <span>{money(18000)}</span></div><button className={styles.sidebarAccount} onClick={() => navigate("Accounts")}><CreditCard size={16} aria-hidden="true" /><span>Credit card</span><strong>{money(18000)}</strong></button></div>
      <div className={styles.sidebarBottom}><div className={styles.futureNote}><Sparkles size={17} aria-hidden="true" /><div><strong>Built around you</strong><p>Your accounts. Your workflows.<br />API & MCP are part of the plan.</p></div></div><Link href="/" className={styles.ledgerLink}>Open current app <ArrowUpRight size={16} aria-hidden="true" /></Link><p className={styles.sidebarFootnote}>A new direction for Budget Go</p></div>
    </aside>

    <div className={styles.workspace}>
      <header className={styles.topbar}><div className={styles.breadcrumb}>Personal workspace <span>/</span><strong>{view}</strong></div><div className={styles.headerRight}><span className={styles.currency}>BDT</span><span className={styles.headerAvatar} aria-label="Fictional personal workspace">P</span></div></header>
      <nav className={styles.mobileNavigation} aria-label="Concept navigation">{nav.map(item => <button key={item.title} aria-current={view === item.title ? "page" : undefined} className={view === item.title ? styles.active : ""} onClick={() => navigate(item.title)}><item.icon size={17} aria-hidden="true" />{item.title}</button>)}</nav>
      <main className={styles.main} id="concept-main" tabIndex={-1}>
        <div className={styles.previewNotice}><span className={styles.previewBadge}>DESIGN PREVIEW</span><p>Fictional finances, real direction. Nothing here is saved.</p><Link href="/">Current app <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>YOUR FINANCIAL PICTURE</p><h1>{view === "Overview" ? "A little clarity goes a long way." : view}</h1><p>{view === "Overview" ? "Every account, every transaction. One place to see it all." : view === "Accounts" ? "A clear view of what you own and what you owe." : view === "Transactions" ? "Follow the money, down to the details." : "Make room for what matters this month."}</p></div><span className={styles.asOf}>As of 8 Nov 2026</span></div>

        {view === "Overview" && <>
          <section className={styles.wealthPanel} aria-labelledby="net-worth-title"><div className={styles.wealthTop}><div><h2 id="net-worth-title" className={styles.wealthLabel}>Net worth <span className={styles.infoIcon} title="Total assets minus total liabilities"><CircleHelp size={14} aria-hidden="true" /><span className={styles.srOnly}>: assets minus liabilities</span></span></h2><p className={styles.wealthValue}>{money(284650)}</p><p className={styles.wealthChange}><ArrowUpRight size={15} aria-hidden="true" /><strong>{money(change)} ({(change / series.values[0] * 100).toFixed(2)}%)</strong><span>past {range === "1M" ? "month" : range === "3M" ? "3 months" : range === "6M" ? "6 months" : "year"}</span></p></div><div className={styles.ranges} role="group" aria-label="Net worth time range">{(Object.keys(ranges) as Range[]).map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}</div></div>
            <div className={styles.chart}><div className={styles.chartAxis}><span>{money(upper)}</span><span>{money((upper + lower) / 2)}</span><span>{money(lower)}</span></div><svg viewBox="0 0 900 230" preserveAspectRatio="none" role="img" aria-label={`Fictional net worth over ${range}, increasing from ${money(series.values[0])} to ${money(284650)}. Exact values available below.`}><defs><linearGradient id="concept-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8EAFFF" stopOpacity=".16" /><stop offset="100%" stopColor="#8EAFFF" stopOpacity="0" /></linearGradient></defs>{[30, 120, 210].map(y => <line key={y} x1="0" x2="900" y1={y} y2={y} stroke="#303641" strokeDasharray="3 5" />)}<path d={`${line} L900,230 L0,230 Z`} fill="url(#concept-chart-fill)" /><path d={line} fill="none" stroke="#A6BCFF" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /><circle cx="900" cy={coords[coords.length - 1].split(",")[1]} r="4" fill="#A6BCFF" /></svg><div className={styles.chartLabels}>{series.labels.map(label => <span key={label}>{label}</span>)}</div></div>
            <div className={styles.wealthFooter}><div><span className={`${styles.legendDot} ${styles.assetDot}`} /><span>Assets</span><strong>{money(302650)}</strong></div><div><span className={`${styles.legendDot} ${styles.debtDot}`} /><span>Liabilities</span><strong>{money(18000)}</strong></div><details className={styles.chartData}><summary>View chart values</summary><ol>{series.values.map((value, index) => <li key={index}>Point {index + 1}: {money(value)}</li>)}</ol></details></div>
          </section>
          <div className={styles.cashFlow}><div><span className={`${styles.flowIcon} ${styles.green}`}><ArrowDownLeft size={18} aria-hidden="true" /></span><div><p>Income this month</p><strong>{money(95000)}</strong></div></div><div><span className={`${styles.flowIcon} ${styles.amber}`}><ArrowUpRight size={18} aria-hidden="true" /></span><div><p>Spent this month</p><strong>{money(78250)}</strong></div></div><div><span className={`${styles.flowIcon} ${styles.blue}`}><Wallet size={18} aria-hidden="true" /></span><div><p>Net cash flow</p><strong className={styles.positive}>+{money(16750)}</strong></div></div></div>
          <div className={styles.lowerGrid}><section className={styles.panel} aria-labelledby="recent-title"><div className={styles.panelHeading}><div><h2 id="recent-title">Recent transactions</h2><p>The latest across your accounts</p></div><button className={styles.textButton} onClick={() => navigate("Transactions")}>View all <ArrowRight size={15} aria-hidden="true" /></button></div>{transactionList(true)}<div className={styles.panelFoot}>Showing 4 of 5 fictional recent transactions</div></section><section className={styles.panel} aria-labelledby="budget-title"><div className={styles.panelHeading}><div><h2 id="budget-title">November budget</h2><p>A plan for your everyday</p></div><button className={styles.iconButton} aria-label="View all budgets" onClick={() => navigate("Budgets")}><ArrowUpRight size={18} aria-hidden="true" /></button></div>{budgetList(true)}<button className={styles.panelAction} onClick={() => navigate("Budgets")}>See all 4 categories <ArrowRight size={16} aria-hidden="true" /></button></section></div>
        </>}

        {view === "Accounts" && <><div className={styles.accountSummary}><section><p>Total assets</p><strong>{money(302650)}</strong><span>Across 4 manual accounts</span></section><section><p>Total liabilities</p><strong>{money(18000)}</strong><span>1 credit account</span></section><section><p>Net worth</p><strong>{money(284650)}</strong><span>Assets minus liabilities</span></section></div><section className={styles.panel}><div className={styles.panelHeading}><div><h2>Cash & bank accounts</h2><p>Illustrative balances · manual accounts</p></div><span className={styles.pill}>4 accounts</span></div><div className={styles.accountCards}>{accounts.map(a => <button className={styles.accountCard} key={a.name} onClick={() => inspectAccount(a.name)}><span className={`${styles.iconTile} ${styles[a.color]}`}><a.icon size={20} aria-hidden="true" /></span><span><strong>{a.name}</strong><span>{a.kind}</span></span><span className={styles.accountCardBalance}>{money(a.balance)}<span>View transactions <ArrowRight size={13} aria-hidden="true" /></span></span></button>)}</div></section><section className={`${styles.panel} ${styles.creditPanel}`}><div className={styles.panelHeading}><div><h2>Liabilities</h2><p>Balances owed are subtracted from net worth</p></div></div><div className={styles.creditRow}><span className={`${styles.iconTile} ${styles.amber}`}><CreditCard size={20} aria-hidden="true" /></span><div><strong>Credit card</strong><p>Fictional outstanding balance</p></div><strong>{money(18000)}</strong></div></section></>}

        {view === "Transactions" && <section className={styles.panel}><div className={styles.transactionFilters}><div className={styles.search}><Search size={18} aria-hidden="true" /><label className={styles.srOnly} htmlFor="concept-search">Search transactions</label><input id="concept-search" placeholder="Search transactions…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className={styles.iconButton} aria-label="Clear search" onClick={() => setSearch("")}><X size={16} aria-hidden="true" /></button>}</div><label className={styles.accountFilter}><span className={styles.srOnly}>Filter by account</span><select aria-label="Filter by account" value={account} onChange={event => setAccount(event.target.value)}><option value="all">All accounts</option>{accounts.map(a => <option key={a.name}>{a.name}</option>)}</select></label></div><div className={styles.listLabel}><span>November 2026</span><span aria-live="polite">{visibleTransactions.length} {visibleTransactions.length === 1 ? "transaction" : "transactions"}</span></div>{transactionList()}<div className={styles.panelFoot}>Fictional recent entries for design review · amounts are in BDT</div></section>}

        {view === "Budgets" && <><div className={styles.accountSummary}><section><p>Planned this month</p><strong>{money(34000)}</strong><span>Across 4 tracked categories</span></section><section><p>Spent in these categories</p><strong>{money(29050)}</strong><span>85% of the monthly plan</span></section><section><p>Remaining overall</p><strong>{money(4950)}</strong><span>One category is over budget</span></section></div><section className={styles.panel}><div className={styles.panelHeading}><div><h2>Category budgets</h2><p>November 2026 · not your full monthly spending</p></div><span className={styles.pill}><Target size={14} aria-hidden="true" />Monthly plan</span></div>{budgetList()}<div className={styles.budgetNote}><Check size={17} aria-hidden="true" /><p>Budgets organize spending. They do not change account balances.</p></div></section></>}

        <footer className={styles.footer}><span><span className={styles.footerMark} />Your money. A clearer picture.</span><span>Budget Go · Independent concept · Fictional data</span></footer>
      </main>
    </div>
  </div>;
}
