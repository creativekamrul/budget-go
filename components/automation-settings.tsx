"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Mail, MessageSquare, Pencil, Plus, Radio, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useAutomation } from "@/lib/use-automation";
import { type AutomationSource, type WorkspacePreferences } from "@/lib/automation";
import { type WorkspaceData } from "@/lib/workspace";
import styles from "@/app/workspace.module.css";
import css from "./finance-settings.module.css";

type AutomationStore = ReturnType<typeof useAutomation>;
export function AutomationSettings({ section, workspace }: { section: "preferences" | "sources"; workspace: WorkspaceData }) {
  const store = useAutomation();
  const [editing, setEditing] = useState<{ source: AutomationSource | null } | null>(null);
  const [notice, setNotice] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const canChange = store.status === "ready" && !store.pending && !store.stale && !store.uncertain;
  const close = () => { setEditing(null); requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus()); };
  return <>
    {store.error && <div className={styles.error} role="alert"><p>{store.error} Your draft is retained.</p><button type="button" className={styles.secondary} disabled={store.pending} onClick={() => store.uncertain ? void store.retryPending().then(result => { if (!result) { setNotice("Previous save confirmed."); close(); } }) : void store.reload()}>{store.uncertain ? "Retry previous save safely" : "Reload saved data"}</button></div>}
    {store.status === "loading" && <p role="status" className={styles.loading}>Loading {section === "preferences" ? "preferences" : "automation sources"}…</p>}
    {section === "preferences" && store.hasLoaded && <PreferencesEditor store={store} done={setNotice}/>}
    {section === "sources" && <>
      <div className={css.connectionIntro}><Radio size={26}/><div><h3>Your banks send alerts. Your tools do the rest.</h3><p>Connect an SMS or email workflow in n8n, then review its messages in the inbox. Sources identify where an alert came from and can suggest its account.</p><Link href="/docs/n8n">Set up your first workflow <ArrowUpRight size={15}/></Link></div></div>
      <div className={css.listToolbar}><span>{store.data.sources.filter(source => source.enabled).length} enabled · {store.data.sources.length} total</span><button type="button" className={styles.button} disabled={!canChange || editing !== null} onClick={event => { opener.current = event.currentTarget; setEditing({ source: null }); }}><Plus size={17}/>New source</button></div>
      {editing && <SourceEditor key={editing.source?.id ?? "new"} initial={editing.source} store={store} workspace={workspace} close={close} done={value => { setNotice(value); close(); }}/ >}
      {store.status === "ready" && (store.data.sources.length ? <div className={css.sourceList}>{store.data.sources.map(source => {
        const Icon = source.channel === "email" ? Mail : source.channel === "sms" ? MessageSquare : Radio;
        return <section key={source.id} className={css.sourceRow}><span className={css.sourceIcon}><Icon size={22}/></span><div className={css.sourceInfo}><h3>{source.name}<span className={source.enabled ? css.enabled : css.disabled}>{source.enabled ? "Enabled" : "Paused"}</span></h3><p>{source.channel.toUpperCase()} · {source.providerLabel || "Custom source"} · {workspace.accounts.find(account => account.id === source.accountId)?.name ?? "Account chosen during review"}</p><code>Source ID: {source.id}</code></div><button type="button" className={styles.iconButton} disabled={!canChange || editing !== null} aria-label={`Edit source ${source.name}`} onClick={event => { opener.current = event.currentTarget; setEditing({ source }); }}><Pencil size={17}/></button></section>;
      })}</div> : <div className={css.sourceEmpty}><MessageSquare size={30}/><h3>Give your alerts a way in.</h3><p>Create a source for a bank email, SMS forwarder, mobile wallet or manual paste. Then use its ID in your workflow.</p><Link href="/docs/automation">How the inbox works <ArrowUpRight size={15}/></Link></div>)}
      {!store.data.preferences.automationEnabled && store.status === "ready" && <p className={css.policyNotice}>Automation intake is currently paused in Preferences. Sources can still be configured; new messages will be rejected until enabled.</p>}
    </>}
    <p className={css.notice} role="status" aria-live="polite">{notice}</p>
  </>;
}

function PreferencesEditor({ store, done }: { store: AutomationStore; done: (message: string) => void }) {
  const [form, setForm] = useState<WorkspacePreferences>(store.data.preferences);
  const [error, setError] = useState("");
  const change = <K extends keyof WorkspacePreferences>(key: K, value: WorkspacePreferences[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    const problem = await store.save({ type: "preferences_update", preferences: form });
    if (problem) setError(problem); else done("Preferences saved. Your display, date ranges and entry defaults are updated.");
  }
  return <form onSubmit={save} aria-label="Workspace preferences" className={css.preferences}><fieldset disabled={store.pending || store.uncertain} className={styles.fields}>
    <section className={css.settingGroup}><div className={css.groupTitle}><span><SlidersHorizontal size={20}/></span><div><h3>Make it yours</h3><p>A clearer workspace, in the format you use.</p></div></div><div className={css.settingFields}>
      <div className={styles.field}><label htmlFor="preference-locale">Number format</label><select id="preference-locale" value={form.locale} onChange={event => change("locale", event.target.value as WorkspacePreferences["locale"])}><option value="en-BD">English · ৳1,234.50</option><option value="bn-BD">বাংলা · ১,২৩৪.৫০৳</option></select><small>Formats monetary amounts; interface labels remain in English.</small></div>
      <div className={styles.field}><label htmlFor="preference-density">Display density</label><select id="preference-density" value={form.density} onChange={event => change("density", event.target.value as WorkspacePreferences["density"])}><option value="comfortable">Comfortable</option><option value="compact">Compact ledger</option></select></div>
      <div className={styles.field}><label htmlFor="preference-accent">Accent color</label><select id="preference-accent" value={form.accent} onChange={event => change("accent", event.target.value as WorkspacePreferences["accent"])}><option value="emerald">Emerald</option><option value="teal">River teal</option><option value="amber">Warm amber</option></select></div>
    </div></section>
    <section className={css.settingGroup}><div className={css.groupTitle}><span>BD</span><div><h3>Bangladesh & reporting</h3><p>Your calendar, week and financial year.</p></div></div><div className={css.settingFields}>
      <div className={styles.field}><label htmlFor="preference-timezone">Financial timezone</label><input id="preference-timezone" readOnly value="Asia/Dhaka · UTC+06:00"/><small>All posted-today calculations follow Bangladesh time.</small></div>
      <div className={styles.field}><label htmlFor="preference-week">Week starts on</label><select id="preference-week" value={form.weekStart} onChange={event => change("weekStart", event.target.value as WorkspacePreferences["weekStart"])}><option value="sat">Saturday</option><option value="sun">Sunday</option><option value="mon">Monday</option></select><small>Used by the Home week-to-date balance view.</small></div>
      <div className={styles.field}><label htmlFor="preference-fiscal">Financial year starts in</label><select id="preference-fiscal" value={form.fiscalYearStartMonth} onChange={event => change("fiscalYearStartMonth", Number(event.target.value))}>{months.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select><small>Used by fiscal year-to-date Home and Reports ranges.</small></div>
      <div className={styles.field}><label htmlFor="preference-status">New transaction status</label><select id="preference-status" value={form.defaultEntryStatus} onChange={event => change("defaultEntryStatus", event.target.value as WorkspacePreferences["defaultEntryStatus"])}><option value="confirmed">Confirmed</option><option value="pending">Pending review</option></select><small>Pending entries do not change posted balances until confirmed.</small></div>
    </div></section>
    <section className={css.settingGroup}><div className={css.groupTitle}><span><ShieldCheck size={20}/></span><div><h3>Automation & message privacy</h3><p>Stay in control of what arrives and what is retained.</p></div></div><div className={css.toggleList}>
      <label><input type="checkbox" checked={form.automationEnabled} onChange={event => change("automationEnabled", event.target.checked)}/><span><strong>Accept incoming alerts</strong><small>Allow enabled sources to submit email and SMS events. Every event still requires review before posting.</small></span></label>
      <label><input type="checkbox" checked={form.storeRawMessages} onChange={event => change("storeRawMessages", event.target.checked)}/><span><strong>Retain original message text</strong><small>Off by default. When enabled, new alerts may retain their original body for your review. Disabling removes stored bodies; structured drafts remain.</small></span></label>
    </div><p className={css.policyNotice}>Never forward OTPs, PINs or passwords. The inbox rejects messages containing security-code indicators. <Link href="/docs/security">Read the data policy.</Link></p></section>
  </fieldset>{error && <p role="alert" className={styles.formError}>{error} Your changes are retained.</p>}<div className={styles.formActions}><button type="submit" className={styles.button} disabled={store.status !== "ready" || store.pending || store.stale || store.uncertain}>{store.pending ? "Saving…" : "Save preferences"}</button></div></form>;
}

function SourceEditor({ initial, store, workspace, close, done }: { initial: AutomationSource | null; store: AutomationStore; workspace: WorkspaceData; close: () => void; done: (message: string) => void }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", channel: initial?.channel ?? "sms", providerLabel: initial?.providerLabel ?? "", accountId: initial?.accountId ?? "", enabled: initial?.enabled ?? true });
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    const source = { ...form, accountId: form.accountId || null };
    const problem = await store.save(initial ? { type: "source_update", id: initial.id, source } : { type: "source_create", source });
    if (problem) setError(problem); else done(`Source ${initial ? "updated" : "created"}. Use its ID in your workflow.`);
  }
  return <form className={css.editor} onSubmit={save} aria-label={initial ? "Edit source" : "New source"}><h3>{initial ? "Edit source" : "New automation source"}</h3><fieldset disabled={store.pending || store.uncertain} className={styles.fields}><div className={styles.pair}><div className={styles.field}><label htmlFor="source-name">Source name</label><input id="source-name" autoFocus required maxLength={80} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></div><div className={styles.field}><label htmlFor="source-channel">Channel</label><select id="source-channel" value={form.channel} onChange={event => setForm(current => ({ ...current, channel: event.target.value as typeof form.channel }))}><option value="sms">SMS</option><option value="email">Email</option><option value="manual">Manual paste</option></select></div></div><div className={styles.pair}><div className={styles.field}><label htmlFor="source-provider">Bank or provider label</label><input id="source-provider" maxLength={80} list="bd-providers" value={form.providerLabel} onChange={event => setForm(current => ({ ...current, providerLabel: event.target.value }))} placeholder="e.g. Your bank, bKash or Nagad"/><datalist id="bd-providers">{["bKash", "Nagad", "Rocket", "City Bank", "BRAC Bank", "Dutch-Bangla Bank"].map(name => <option key={name} value={name}/>)}</datalist></div><div className={styles.field}><label htmlFor="source-account">Suggested account</label><select id="source-account" value={form.accountId} onChange={event => setForm(current => ({ ...current, accountId: event.target.value }))}><option value="">Choose during review</option>{workspace.accounts.filter(account => !account.archived || account.id === form.accountId).map(account => <option key={account.id} value={account.id}>{account.name}{account.archived ? " (archived)" : ""}</option>)}</select></div></div><label className={css.checkbox}><input type="checkbox" checked={form.enabled} onChange={event => setForm(current => ({ ...current, enabled: event.target.checked }))}/> Source enabled</label><p className={css.help}>This identifies a message feed; it does not connect to a bank API. Configure forwarding in your external workflow.</p></fieldset>{error && <p className={styles.formError} role="alert">{error} Your draft is retained.</p>}<div className={styles.formActions}><button type="button" className={styles.secondary} disabled={store.pending} onClick={close}>Cancel</button><button className={styles.button} disabled={store.pending || store.stale || store.uncertain}>{store.pending ? "Saving…" : initial ? "Save source" : "Create source"}</button></div></form>;
}
