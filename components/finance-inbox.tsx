"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CheckCheck, FileText, Inbox, Mail, MessageSquare, Plus, Search, ShieldCheck, X } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { useAutomation } from "@/lib/use-automation";
import { useWorkspace } from "@/lib/use-workspace";
import { usePreferences } from "@/lib/use-preferences";
import { formatMoney } from "@/lib/presentation";
import { categories, decimalAmount } from "@/lib/preview";
import { parseSignedAmount, type WorkspaceData } from "@/lib/workspace";
import { normalizeBanglaDigits, parseBangladeshAlert, type AutomationDraft, type AutomationEvent } from "@/lib/automation";
import styles from "@/app/workspace.module.css";
import css from "./finance-inbox.module.css";

const statusLabel = { needs_review: "Needs review", ready: "Ready to post", accepted: "Added to ledger", ignored: "Ignored" };
type AutomationStore = ReturnType<typeof useAutomation>;
export function FinanceInbox() {
  const workspace = useWorkspace();
  const store = useAutomation();
  const { preferences } = usePreferences();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("review");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const active = store.data.events.find(event => event.id === selected);
  const ready = store.status === "ready" && !store.pending && !store.stale && !store.uncertain;
  const reviewCount = store.data.events.filter(event => event.status === "needs_review" || event.status === "ready").length;
  const events = store.data.events.filter(event => (filter === "all" || filter === "review" && (event.status === "needs_review" || event.status === "ready") || event.status === filter) && (sourceFilter === "all" || event.sourceId === sourceFilter) && `${event.draft.description} ${event.reference} ${event.externalId} ${event.draft.notes}`.toLowerCase().includes(search.trim().toLowerCase()));
  const closeReview = (message: string) => { setNotice(message); setSelected(null); void workspace.reload(); };
  return <FinanceShell active="Inbox" data={workspace.data} defaultCollapsed><div className={styles.root}><main id="workspace-main" tabIndex={-1} className={css.main}>
    <header className={css.pageHeader}><div><p className={css.eyebrow}>MESSAGES → MEANINGFUL MONEY</p><h1>Automation inbox</h1><p>Your bank alerts, ready for a second look.</p></div><div><Link className={styles.secondary} href="/docs/n8n">Connect n8n <ArrowUpRight size={16}/></Link><button type="button" className={styles.button} disabled={!ready || compose} onClick={() => { setCompose(true); setSelected(null); }}><Plus size={17}/>Add alert</button></div></header>
    <section className={css.workflow} aria-label="How alerts become entries"><span><MessageSquare size={18}/><strong>Receive</strong> SMS or email</span><ArrowRight size={15}/><span><FileText size={18}/><strong>Extract</strong> a draft</span><ArrowRight size={15}/><span><ShieldCheck size={18}/><strong>Review</strong> and post</span><Link href="/docs/automation">How it works <ArrowUpRight size={15}/></Link></section>
    {!store.data.preferences.automationEnabled && store.status === "ready" && <div className={css.warning}><strong>New alerts are paused.</strong><p>Review existing alerts or enable intake in <Link href="/settings/preferences">Preferences</Link>.</p></div>}
    {(store.error || workspace.error) && <div className={styles.error} role="alert"><p>{store.error || workspace.error} Your draft is retained.</p><button className={styles.secondary} type="button" disabled={store.pending} onClick={() => store.uncertain ? void store.retryPending().then(problem => { if (!problem) { setNotice("Previous save confirmed. Review the latest saved status before continuing."); void workspace.reload(); } }) : void Promise.all([store.reload(), workspace.reload()])}>{store.uncertain ? "Retry previous save safely" : "Reload saved data"}</button></div>}
    {compose && <IntakeForm store={store} close={() => setCompose(false)} done={message => { setNotice(message); setCompose(false); setFilter("review"); }}/ >}
    <div className={css.inboxHeader}><div><h2>Alert queue <span>{reviewCount} to review</span></h2><p>Review keeps uncertain amounts and duplicate alerts out of your ledger.</p></div><Link href="/settings/sources">Manage sources <ArrowUpRight size={16}/></Link></div>
    <div className={css.filters}><div className={css.tabs} role="group" aria-label="Alert status">{[{value:"review",label:"To review"},{value:"all",label:"All alerts"},{value:"ready",label:"Ready"},{value:"accepted",label:"Added"},{value:"ignored",label:"Ignored"}].map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><label className={css.search}><Search size={17}/><span className={styles.srOnly}>Search alerts</span><input aria-label="Search alerts" placeholder="Search description or reference" value={search} onChange={event => setSearch(event.target.value)}/></label><label className={css.sourceFilter}><span className={styles.srOnly}>Alert source</span><select aria-label="Alert source" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">All sources</option>{store.data.sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label></div>
    <div className={`${css.split} ${active ? css.hasReview : ""}`}><div className={css.queue}>
      {store.status === "loading" ? <p role="status" className={styles.loading}>Loading alerts…</p> : store.status === "ready" && (events.length ? events.map(event => {
        const source = store.data.sources.find(item => item.id === event.sourceId);
        const Icon = source?.channel === "email" ? Mail : MessageSquare;
        const duplicate = !!event.duplicateOfEventId || event.duplicateTransactionIds.length > 0;
        return <button type="button" key={event.id} className={`${css.event} ${selected === event.id ? css.selected : ""}`} onClick={() => { setSelected(event.id); setCompose(false); }} aria-label={`Review ${event.draft.description || source?.name || "alert"}`} aria-pressed={selected === event.id}><span className={css.eventIcon}><Icon size={21}/></span><span className={css.eventInfo}><strong>{event.draft.description || source?.name || "Unclassified alert"}</strong><span>{source?.name ?? "Unknown source"} · {event.draft.date ?? "Date needs review"}</span><small>{event.reference ? `Ref ${event.reference}` : "No bank reference"}{duplicate && " · Possible duplicate"}</small></span><span className={css.eventAmount}><strong data-amount>{event.draft.poisha ? formatMoney(event.draft.poisha, preferences.locale) : "Amount needed"}</strong><span className={css[event.status]}>{statusLabel[event.status]}</span></span></button>;
      }) : <div className={css.empty}><span><Inbox size={30}/></span><h3>{search || sourceFilter !== "all" ? "No alerts match these filters" : filter === "review" ? "Your queue is clear" : "No alerts here yet"}</h3><p>{search || sourceFilter !== "all" ? "Try a different source, status or search term." : "Send SMS or email alerts from n8n, or paste one to start. You review every draft before it becomes a transaction."}</p><Link href="/docs/n8n">Set up an alert workflow <ArrowRight size={16}/></Link></div>)}
      {store.data.nextCursor && <button type="button" className={styles.secondary} disabled={!ready} onClick={() => void store.loadMore()}>Load older alerts</button>}
      {store.status === "ready" && <p className={css.queueMeta}>Showing {store.data.events.length} of {store.data.eventTotal} saved alerts. Filters apply to loaded alerts.</p>}
    </div>{active && <ReviewAlert key={active.id} event={active} store={store} workspace={workspace.data} close={() => setSelected(null)} done={closeReview}/>}</div>
    <p className={css.notice} role="status" aria-live="polite">{notice}</p><footer className={css.footer}><span>Made for bank alerts, with you in control.</span><Link href="/docs/api">API reference <ArrowUpRight size={15}/></Link></footer>
  </main></div></FinanceShell>;
}

function IntakeForm({ store, close, done }: { store: AutomationStore; close: () => void; done: (message: string) => void }) {
  const [sourceId, setSource] = useState(store.data.sources.find(source => source.enabled)?.id ?? "");
  const [rawText, setRawText] = useState("");
  const [externalId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseBangladeshAlert> | null>(null);
  const sources = store.data.sources.filter(source => source.enabled);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!sourceId) { setError("Create or enable a source before adding an alert."); return; }
    const problem = await store.ingest({ sourceId, externalId, rawText });
    if (problem) setError(problem); else done("Alert added to the review queue. No transaction has been posted.");
  }
  function extract() {
    setError("");
    try { setPreview(parseBangladeshAlert(rawText)); } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "This message could not be read."); }
  }
  return <form className={css.intake} onSubmit={submit} aria-label="Add bank alert"><div className={css.editorTitle}><div><p className={css.eyebrow}>MANUAL INTAKE</p><h2>Add a bank alert</h2></div><button type="button" className={styles.iconButton} disabled={store.pending || store.uncertain} onClick={close} aria-label="Close alert form"><X size={19}/></button></div><p className={css.help}>Paste a transaction notification. Bangla digits and BDT/Tk amounts are supported; uncertain fields stay empty for your review. Do not paste security codes.</p><fieldset className={styles.fields} disabled={store.pending || store.uncertain}><div className={styles.field}><label htmlFor="intake-source">Alert source</label><select id="intake-source" value={sourceId} onChange={event => setSource(event.target.value)}><option value="">Choose a source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name} · {source.channel.toUpperCase()}</option>)}</select>{!sources.length && <small><Link href="/settings/sources">Create an alert source first.</Link></small>}</div><div className={styles.field}><label htmlFor="intake-body">SMS or email text</label><textarea autoFocus id="intake-body" maxLength={16000} rows={5} required value={rawText} onChange={event => { setRawText(event.target.value); setPreview(null); }}/></div></fieldset>{preview && <div className={css.preview}><strong>Extraction preview</strong><dl><div><dt>Amount</dt><dd>{preview.draft.poisha ? formatMoney(preview.draft.poisha) : "Needs review"}</dd></div><div><dt>Type</dt><dd>{preview.draft.type ?? "Needs review"}</dd></div><div><dt>Date</dt><dd>{preview.draft.date ?? "Needs review"}</dd></div><div><dt>Reference</dt><dd>{preview.reference || "Not found"}</dd></div></dl>{preview.issues.length > 0 && <ul>{preview.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>}{error && <p role="alert" className={styles.formError}>{error} Your text is retained.</p>}<div className={styles.formActions}><button type="button" className={styles.secondary} disabled={store.pending || !rawText.trim()} onClick={extract}>Preview extraction</button><button type="submit" className={styles.button} disabled={store.pending || store.stale || store.uncertain || !sourceId || !rawText.trim() || !store.data.preferences.automationEnabled}>{store.pending ? "Adding…" : "Add to review queue"}</button></div><p className={css.help}>{store.data.preferences.storeRawMessages ? "Original text will be retained with this alert." : "Original message text is not retained. The extracted draft and fingerprint are saved."} Intake never posts money.</p></form>;
}

function ReviewAlert({ event, store, workspace, close, done }: { event: AutomationEvent; store: AutomationStore; workspace: WorkspaceData; close: () => void; done: (message: string) => void }) {
  const [draft, setDraft] = useState<AutomationDraft>(event.draft);
  const [amount, setAmount] = useState(event.draft.poisha ? decimalAmount(event.draft.poisha) : "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (window.innerWidth < 1000) heading.current?.scrollIntoView({ behavior: "instant", block: "start" }); heading.current?.focus({ preventScroll: true }); }, []);
  const editable = event.status !== "accepted" && event.status !== "ignored";
  const duplicate = !!event.duplicateOfEventId || event.duplicateTransactionIds.length > 0;
  const locked = store.status !== "ready" || store.pending || store.uncertain || !editable;
  function change<K extends keyof AutomationDraft>(key: K, value: AutomationDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setAcknowledged(false); }
  function checkedDraft() {
    const poisha = amount.trim() ? parseSignedAmount(normalizeBanglaDigits(amount.trim())) : null;
    if (amount.trim() && (poisha === null || poisha <= 0)) { setError("Enter a positive BDT amount with up to two decimal places."); return null; }
    return { ...draft, description: draft.description.trim(), poisha };
  }
  async function save(post: boolean) {
    setError(""); const value = checkedDraft(); if (!value) return;
    if (post && (!value.accountId || !value.type || !value.date || !value.poisha || !value.description || !value.category)) { setError("Review the description, account, type, category, date and amount before posting."); return; }
    if (post && duplicate && !acknowledged) { setError("Review the possible duplicate and acknowledge it before posting another transaction."); return; }
    const problem = await store.save({ type: "event_update", id: event.id, draft: value });
    if (problem) { setError(problem); return; }
    if (!post) { setError(""); return; }
    const accepted = await store.save({ type: "event_accept", id: event.id, acknowledgeDuplicate: acknowledged });
    if (accepted) setError(accepted); else done(value.status === "pending" ? "Pending transaction created once. Balances stay unchanged until it is confirmed." : "Reviewed transaction posted once. Account balances and reports are updated.");
  }
  async function ignore(ignored: boolean) { const problem = await store.save({ type: "event_ignore", id: event.id, ignored }); if (problem) setError(problem); else done(ignored ? "Alert ignored. No transaction was created." : "Alert restored to the review queue."); }
  const categoryItems = workspace.categories.filter(category => (!category.archived || category.id === draft.categoryId) && (!draft.type || category.kind === draft.type || category.kind === "both"));
  const builtins = draft.type ? categories[draft.type].filter(name => !categoryItems.some(category => category.name === name)) : [];
  return <aside className={css.review} aria-label="Review alert"><div className={css.editorTitle}><div><p className={css.eyebrow}>REVIEW BEFORE POSTING</p><h2 ref={heading} tabIndex={-1}>Review alert</h2></div><button type="button" className={styles.iconButton} disabled={store.pending || store.uncertain} aria-label="Close review" onClick={close}><X size={19}/></button></div><p className={css.receipt}>{event.receivedAt.slice(0, 10)} · {statusLabel[event.status]}<br/>Reference: {event.reference || "Not supplied"}</p>
    {event.status === "accepted" && <div className={css.success}><CheckCheck size={21}/><div><strong>Added to your ledger</strong><p>This event is linked to one transaction.</p><Link href="/?view=transactions">View transactions <ArrowUpRight size={14}/></Link></div></div>}
    {duplicate && editable && <div className={css.warning}><strong>Possible duplicate</strong><p>{event.duplicateOfEventId ? "Another alert has matching message or reference details." : "An existing transaction has the same account, date, type and amount."} Compare your ledger before creating another entry.</p><Link href="/?view=transactions" target="_blank" rel="noreferrer">Compare transactions <ArrowUpRight size={14}/></Link></div>}
    {event.issues.length > 0 && editable && <div className={css.issues}><strong>Check these details</strong><ul>{event.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
    <form aria-label="Review transaction draft" onSubmit={event => { event.preventDefault(); void save(false); }}><fieldset className={styles.fields} disabled={locked}>
      <div className={styles.field}><label htmlFor="review-description">Description</label><input id="review-description" maxLength={120} value={draft.description} onChange={event => change("description", event.target.value)}/></div>
      <div className={styles.pair}><div className={styles.field}><label htmlFor="review-amount">Amount (BDT)</label><input id="review-amount" inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); setAcknowledged(false); }}/></div><div className={styles.field}><label htmlFor="review-type">Transaction type</label><select id="review-type" value={draft.type ?? ""} onChange={event => { setDraft(current => ({ ...current, type: event.target.value as AutomationDraft["type"] || null, category: "", categoryId: null })); setAcknowledged(false); }}><option value="">Choose type</option><option value="expense">Expense</option><option value="income">Income</option></select></div></div>
      <div className={styles.field}><label htmlFor="review-account">Financial account</label><select id="review-account" value={draft.accountId ?? ""} onChange={event => change("accountId", event.target.value || null)}><option value="">Choose account</option>{workspace.accounts.filter(account => !account.archived || account.id === draft.accountId).map(account => <option key={account.id} value={account.id}>{account.name}{account.archived ? " (archived)" : ""}</option>)}</select></div>
      <div className={styles.pair}><div className={styles.field}><label htmlFor="review-date">Transaction date</label><input type="date" id="review-date" min="1000-01-01" max="9999-12-31" value={draft.date ?? ""} onChange={event => change("date", event.target.value || null)}/></div><div className={styles.field}><label htmlFor="review-category">Category</label><select id="review-category" value={draft.categoryId ?? draft.category} onChange={event => { const category = workspace.categories.find(item => item.id === event.target.value); setDraft(current => ({ ...current, categoryId: category?.id ?? null, category: category?.name ?? event.target.value })); setAcknowledged(false); }}><option value="">Choose category</option>{categoryItems.map(category => <option key={category.id} value={category.id}>{category.name}{category.archived ? " (archived)" : ""}</option>)}{builtins.map(category => <option key={category} value={category}>{category}</option>)}</select></div></div>
      <div className={styles.pair}><div className={styles.field}><label htmlFor="review-status">Posting status</label><select id="review-status" value={draft.status} onChange={event => change("status", event.target.value as AutomationDraft["status"])}><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select><small>Pending transactions do not affect posted balances.</small></div><div className={styles.field}><label htmlFor="review-merchant">Merchant</label><select id="review-merchant" value={draft.merchantId ?? ""} onChange={event => change("merchantId", event.target.value || null)}><option value="">No merchant</option>{workspace.merchants.filter(item => !item.archived || item.id === draft.merchantId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
      {workspace.tags.length > 0 && <div className={styles.field}><span>Tags</span><div className={styles.tagChoices}>{workspace.tags.filter(tag => !tag.archived || draft.tagIds.includes(tag.id)).map(tag => <label key={tag.id}><input type="checkbox" checked={draft.tagIds.includes(tag.id)} onChange={event => change("tagIds", event.target.checked ? [...draft.tagIds, tag.id] : draft.tagIds.filter(id => id !== tag.id))}/><span>{tag.name}</span></label>)}</div></div>}
      <div className={styles.field}><label htmlFor="review-notes">Notes</label><textarea id="review-notes" maxLength={2000} rows={3} value={draft.notes} onChange={event => change("notes", event.target.value)}/></div>
      <label className={css.checkbox}><input type="checkbox" checked={draft.excluded} onChange={event => change("excluded", event.target.checked)}/> Exclude from cash flow, budgets and reports</label>
    </fieldset>{event.rawText && <details className={css.original}><summary>Original message</summary><pre>{event.rawText}</pre></details>}{duplicate && editable && <label className={css.acknowledge}><input type="checkbox" checked={acknowledged} disabled={store.pending} onChange={event => setAcknowledged(event.target.checked)}/><span>I reviewed the possible duplicate and want to post a separate transaction.</span></label>}{error && <p className={styles.formError} role="alert">{error} Your draft is retained.</p>}{editable && <div className={css.reviewActions}><button type="button" className={styles.secondary} disabled={locked || store.stale} onClick={() => void ignore(true)}>Ignore alert</button><button type="submit" className={styles.secondary} disabled={locked || store.stale}>Save draft</button><button type="button" className={styles.button} disabled={locked || store.stale || duplicate && !acknowledged} onClick={() => void save(true)}><Check size={17}/>{store.pending ? "Saving…" : "Save & post transaction"}</button></div>}{event.status === "ignored" && <button type="button" className={styles.secondary} disabled={store.pending || store.stale || store.uncertain} onClick={() => void ignore(false)}>Restore to review queue</button>}</form>
  </aside>;
}
