"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { categories, decimalAmount, parseAmount, validDate } from "@/lib/preview";
import { normalizeBanglaDigits } from "@/lib/automation";
import { formatMoney } from "@/lib/presentation";
import type { AccountTransaction, WorkspaceCommand } from "@/lib/workspace";
import type { useWorkspace } from "@/lib/use-workspace";
import type { usePlanning } from "@/lib/use-planning";
import styles from "@/app/workspace.module.css";

type Store = ReturnType<typeof useWorkspace>;
type Planning = ReturnType<typeof usePlanning>;
export function CoreDialog({ mode, store, planning, month, selected, transaction, locale, close, done, restoreFocus }: { mode: "split" | "bulk" | "plan"; store: Store; planning: Planning; month: string; selected: string[]; transaction?: AccountTransaction; locale: "en-BD" | "bn-BD"; close: () => void; done: (message: string) => void; restoreFocus: () => void }) {
  const [error, setError] = useState("");
  const [parts, setParts] = useState(() => [{ description: transaction?.description ?? "", category: transaction?.category ?? "Groceries", amount: transaction ? decimalAmount(transaction.poisha) : "" }, { description: "", category: transaction?.category ?? "Groceries", amount: "" }]);
  const [patch, setPatch] = useState<Record<string, string>>({ field: "status", value: "confirmed" });
  const currentPlan = planning.data.monthlyPlans.find(item => item.month === month);
  const [income, setIncome] = useState(currentPlan ? decimalAmount(currentPlan.incomePoisha) : "");
  const [spending, setSpending] = useState(currentPlan ? decimalAmount(currentPlan.spendingPoisha) : "");
  const change = (field: string, value: string) => setPatch(previous => ({ ...previous, [field]: value }));
  const source = mode === "plan" ? planning : store;
  const locked = source.pending || source.uncertain;
  const categoryType = transaction?.type ?? "expense";
  const kindOptions = store.data.categories.filter(item => !item.archived && (item.kind === categoryType || item.kind === "both"));
  const categoryOptions = [...kindOptions.map(item => item.name), ...categories[categoryType].filter(name => !kindOptions.some(item => item.name === name))];
  const sum = parts.reduce((total, part) => total + BigInt(parseAmount(normalizeBanglaDigits(part.amount)) ?? 0), 0n);
  const remaining = BigInt(transaction?.poisha ?? 0) - sum;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "plan") {
      const money = (text: string) => /^0(?:\.0{1,2})?$/.test(normalizeBanglaDigits(text.trim())) ? 0 : parseAmount(normalizeBanglaDigits(text.trim()));
      const incomePoisha = money(income), spendingPoisha = money(spending);
      if (incomePoisha === null || spendingPoisha === null) { setError("Enter income and spending targets with up to two decimals. Zero is allowed."); return; }
      const problem = await planning.save({ type: "monthly_plan_set", month, incomePoisha, spendingPoisha });
      if (problem) setError(problem); else done("Monthly targets saved. Your actual transactions are unchanged."); return;
    }
    let command: WorkspaceCommand;
    if (mode === "split") {
      if (!transaction) return;
      if (parts.length < 2 || parts.length > 20 || parts.some(part => !part.description.trim() || part.description.trim().length > 120 || parseAmount(normalizeBanglaDigits(part.amount)) === null)) { setError("Every part needs a description, category and positive amount with up to two decimals."); return; }
      if (remaining !== 0n) { setError("The split amounts must add up exactly to the original transaction."); return; }
      command = { type: "transaction_split", id: transaction.id, parts: parts.map(part => ({ description: part.description.trim(), category: part.category, categoryId: store.data.categories.find(category => category.name === part.category)?.id ?? null, poisha: parseAmount(normalizeBanglaDigits(part.amount))! })) };
    } else {
      let value: unknown = patch.value;
      if (patch.field === "excluded") value = patch.value === "true";
      if (patch.field === "merchantId") value = patch.value || null;
      if (patch.field === "tagIds") value = patch.value ? [patch.value] : [];
      if (patch.field === "date" && !validDate(patch.value)) { setError("Choose a real transaction date."); return; }
      if (patch.field === "description" && (!patch.value.trim() || patch.value.trim().length > 120)) { setError("Enter a description of 1–120 characters."); return; }
      const changes = patch.field === "category" ? { category: patch.value, categoryId: store.data.categories.find(category => category.name === patch.value)?.id ?? null } : { [patch.field]: value };
      command = { type: "transaction_bulk_update", ids: selected, patch: changes };
    }
    const problem = await store.save(command);
    if (problem) setError(problem); else done(mode === "split" ? "Transaction split. The original total and account balance are preserved." : `${selected.length} transactions updated together.`);
  }
  const title = mode === "split" ? "Split transaction" : mode === "bulk" ? "Edit selected transactions" : "Monthly targets";
  return <Dialog open onOpenChange={value => { if (!value && !locked) close(); }}><DialogContent className={styles.dialog} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (locked) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}><DialogTitle>{title}</DialogTitle><DialogDescription className={styles.dialogDescription}>{mode === "split" ? "Divide one entry between categories. Parts keep its account, date, type and status; their total must stay the same." : mode === "bulk" ? `Change one field for ${selected.length} selected transactions. Every other field stays as it is. All changes save together.` : `Plan income and total spending for ${month}. Targets do not create income or expenses.`}</DialogDescription><form onSubmit={submit} noValidate><fieldset className={styles.fields} disabled={locked}>
    {mode === "split" && <><p className={styles.splitSummary}>Original <strong>{formatMoney(transaction?.poisha ?? 0, locale)}</strong> · <span>Remaining <strong>{formatMoney(remaining, locale)}</strong></span></p><div className={styles.splitParts}>{parts.map((part, index) => <section key={index} className={styles.splitPart}><div><h3>Part {index + 1}</h3><button type="button" className={styles.iconButton} aria-label={`Remove part ${index + 1}`} disabled={parts.length <= 2} onClick={() => setParts(previous => previous.filter((_, position) => position !== index))}><Trash2 size={17}/></button></div><div className={styles.field}><label htmlFor={`split-description-${index}`}>Part {index + 1} description</label><input id={`split-description-${index}`} maxLength={120} value={part.description} onChange={event => setParts(previous => previous.map((saved, position) => position === index ? { ...saved, description: event.target.value } : saved))}/></div><div className={styles.pair}><div className={styles.field}><label htmlFor={`split-category-${index}`}>Part {index + 1} category</label><select id={`split-category-${index}`} value={part.category} onChange={event => setParts(previous => previous.map((saved, position) => position === index ? { ...saved, category: event.target.value } : saved))}>{categoryOptions.map(category => <option key={category}>{category}</option>)}</select></div><div className={styles.field}><label htmlFor={`split-amount-${index}`}>Part {index + 1} amount (BDT)</label><input id={`split-amount-${index}`} inputMode="decimal" value={part.amount} onChange={event => setParts(previous => previous.map((saved, position) => position === index ? { ...saved, amount: event.target.value } : saved))}/></div></div></section>)}</div><button type="button" className={styles.secondary} disabled={parts.length >= 20} onClick={() => setParts(previous => [...previous, { description: "", category: categoryOptions[0], amount: "" }])}><Plus size={16}/>Add split part</button></>}
    {mode === "bulk" && <><div className={styles.field}><label htmlFor="bulk-field">Field to change</label><select id="bulk-field" value={patch.field} onChange={event => setPatch({ field: event.target.value, value: event.target.value === "status" ? "confirmed" : event.target.value === "excluded" ? "false" : "" })}><option value="status">Status</option><option value="category">Category</option><option value="merchantId">Merchant</option><option value="tagIds">Tags (replace all)</option><option value="date">Date</option><option value="description">Description</option><option value="notes">Notes</option><option value="excluded">Report exclusion</option></select></div><div className={styles.field}><label htmlFor="bulk-value">New value</label>{patch.field === "status" ? <select id="bulk-value" value={patch.value} onChange={event => change("value", event.target.value)}><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select> : patch.field === "excluded" ? <select id="bulk-value" value={patch.value} onChange={event => change("value", event.target.value)}><option value="false">Include in reports and budgets</option><option value="true">Exclude from reports and budgets</option></select> : patch.field === "category" ? <select id="bulk-value" value={patch.value} onChange={event => change("value", event.target.value)}><option value="">Choose a category</option>{store.data.categories.filter(category => !category.archived).map(category => <option key={category.id}>{category.name}</option>)}{[...categories.income, ...categories.expense].filter(category => !store.data.categories.some(saved => saved.name === category)).map(category => <option key={category}>{category}</option>)}</select> : patch.field === "merchantId" || patch.field === "tagIds" ? <select id="bulk-value" value={patch.value} onChange={event => change("value", event.target.value)}><option value="">{patch.field === "tagIds" ? "Clear all tags" : "No merchant"}</option>{(patch.field === "tagIds" ? store.data.tags : store.data.merchants).filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : patch.field === "notes" ? <textarea id="bulk-value" value={patch.value} maxLength={2000} rows={4} onChange={event => change("value", event.target.value)}/> : <input id="bulk-value" type={patch.field === "date" ? "date" : "text"} min={patch.field === "date" ? "1000-01-01" : undefined} max={patch.field === "date" ? "9999-12-31" : undefined} maxLength={120} value={patch.value} onChange={event => change("value", event.target.value)}/>}</div>{patch.field === "category" && <p className={styles.formHelp}>All selected entries must support the category type. Mixed income and expense selections need a category that supports both.</p>}{patch.field === "tagIds" && <p className={styles.formHelp}>This replaces the selected entries’ tag lists with one tag, or clears them. Other classification is retained.</p>}</>}
    {mode === "plan" && <div className={styles.pair}><div className={styles.field}><label htmlFor="plan-income">Expected income (BDT)</label><input id="plan-income" inputMode="decimal" value={income} onChange={event => setIncome(event.target.value)}/></div><div className={styles.field}><label htmlFor="plan-spending">Planned spending (BDT)</label><input id="plan-spending" inputMode="decimal" value={spending} onChange={event => setSpending(event.target.value)}/></div></div>}
    </fieldset>{(error || source.uncertain || source.stale) && <div className={styles.formError} role="alert"><p>{error || source.error} Your draft is retained.</p>{source.uncertain ? <button type="button" className={styles.secondary} disabled={source.pending} onClick={() => void source.retryPending().then(problem => { if (problem) setError(problem); else done("Previous save confirmed."); })}>Retry same save safely</button> : <button type="button" className={styles.secondary} disabled={source.pending} onClick={() => void source.reload()}>Reload saved data</button>}</div>}<div className={styles.formActions}><button type="button" className={styles.secondary} disabled={locked} onClick={close}>Cancel</button><button className={styles.button} disabled={locked || source.stale || source.status !== "ready"}>{source.pending ? "Saving…" : mode === "split" ? "Save split" : mode === "bulk" ? "Apply to selected" : "Save monthly targets"}</button></div></form></DialogContent></Dialog>;
}
