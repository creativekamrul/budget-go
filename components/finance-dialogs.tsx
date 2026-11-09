"use client";
import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { categories, decimalAmount, money, parseAmount, validDate, type Transaction } from "@/lib/preview";
import { type Budget } from "@/lib/finance";

type ModalProps = { close: () => void; restoreFocus: () => void; reload?: () => Promise<void> };
export function TransactionDialog({ initial, month, transactions, onSave, close, restoreFocus, reload }: ModalProps & { initial: Transaction | null; month: string; transactions: Transaction[]; onSave: (transaction: Transaction) => Promise<string | null> }) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [form, setForm] = useState(initial ? { ...initial, amount: decimalAmount(initial.poisha) } : { description: "", amount: "", category: "Groceries", date: todayKey.startsWith(month) ? todayKey : `${month}-01`, type: "expense" as "income" | "expense" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const ref = useRef<HTMLFormElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const next: Record<string, string> = {};
    const poisha = parseAmount(form.amount);
    if (!form.description.trim() || form.description.trim().length > 120) next.description = "Enter a description of 1–120 characters.";
    if (poisha === null) next.amount = "Enter an amount greater than zero, with at most 2 decimal places.";
    if (!validDate(form.date)) next.date = "Enter a valid calendar date between years 1000 and 9999.";
    if (!categories[form.type].includes(form.category)) next.category = "Choose a category for this transaction type.";
    const total = transactions.filter(t => t.id !== initial?.id).reduce((sum, t) => sum + BigInt(t.poisha), 0n);
    if (poisha !== null && total + BigInt(poisha) > BigInt(Number.MAX_SAFE_INTEGER)) next.amount = "The combined transaction amounts exceed the safe money limit.";
    setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus()); return; }
    saving.current = true; setPending(true);
    try {
      const error = await onSave({ id: initial?.id ?? crypto.randomUUID(), description: form.description.trim(), category: form.category, date: form.date, type: form.type, poisha: poisha! });
      if (error) setErrors({ save: error });
    } catch { setErrors({ save: "The save could not be confirmed. Reload saved data before retrying." }); }
    finally { saving.current = false; setPending(false); }
  }
  async function reloadDraft() {
    if (saving.current || !reload) return;
    saving.current = true; setPending(true);
    try { await reload(); } finally { saving.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={value => { if (!value && !pending) close(); }}><DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}><div className="dialog-heading"><span className="eyebrow">Your monthly ledger</span><DialogTitle>{initial ? "Edit transaction" : "Add transaction"}</DialogTitle><DialogDescription>Saved securely to your account after confirmation. Amounts are in BDT.</DialogDescription></div><form ref={ref} onSubmit={submit} noValidate aria-busy={pending}><fieldset disabled={pending} className="form-fields"><fieldset className="type-picker"><legend className="sr-only">Transaction type</legend>{(["expense", "income"] as const).map(type => <label key={type} className={form.type === type ? "selected" : ""}><input type="radio" name="type" value={type} checked={form.type === type} onChange={() => setForm({ ...form, type, category: categories[type][0] })} />{type === "expense" ? <ArrowUpRight size={17} aria-hidden="true" /> : <ArrowDownLeft size={17} aria-hidden="true" />}{type === "expense" ? "Expense" : "Income"}</label>)}</fieldset>
    <div className="field"><label htmlFor="description">Description <span>(required)</span></label><input id="description" name="description" maxLength={120} placeholder="What was it for?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} aria-invalid={!!errors.description} aria-describedby={errors.description ? "description-error" : undefined} />{errors.description && <p className="field-error" id="description-error">{errors.description}</p>}</div>
    <div className="field"><label htmlFor="amount">Amount <span>(BDT ৳ · required)</span></label><input id="amount" name="amount" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} aria-invalid={!!errors.amount} aria-describedby={errors.amount ? "amount-error" : undefined} />{errors.amount && <p className="field-error" id="amount-error">{errors.amount}</p>}</div>
    <div className="form-pair"><div className="field"><label htmlFor="category">Category <span>(required)</span></label><select id="category" name="category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} aria-invalid={!!errors.category} aria-describedby={errors.category ? "category-error" : undefined}>{categories[form.type].map(category => <option key={category}>{category}</option>)}</select>{errors.category && <p id="category-error" className="field-error">{errors.category}</p>}</div><div className="field"><label htmlFor="date">Date <span>(required)</span></label><input id="date" name="date" type="date" min="1000-01-01" max="9999-12-31" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} aria-invalid={!!errors.date} aria-describedby={errors.date ? "date-error" : undefined} />{errors.date && <p id="date-error" className="field-error">{errors.date}</p>}</div></div></fieldset>
    {errors.save && <><p className="save-error" role="alert">{errors.save} Your draft is still here.</p>{reload && <Button type="button" variant="outline" disabled={pending} onClick={() => void reloadDraft()}>Reload saved data</Button>}</>}<div className="dialog-actions"><Button disabled={pending} type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={pending} type="submit">{pending ? "Saving…" : initial ? "Save changes" : "Add transaction"}</Button></div></form></DialogContent></Dialog>;
}
export function BudgetDialog({ initial, month, budgets, onSave, close, restoreFocus, reload }: ModalProps & { initial: Budget | null; month: string; budgets: Budget[]; onSave: (budget: Budget) => Promise<string | null> }) {
  const [category, setCategory] = useState(initial?.category ?? categories.expense.find(category => !budgets.some(b => b.month === month && b.category === category)) ?? categories.expense[0]);
  const [amount, setAmount] = useState(initial ? decimalAmount(initial.limitPoisha) : "");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"amount" | "category" | "">("");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const poisha = parseAmount(amount);
    if (poisha === null) { setErrorField("amount"); setError("Enter a positive limit with at most 2 decimal places."); amountRef.current?.focus(); return; }
    if (budgets.some(b => b.id !== initial?.id && b.month === month && b.category === category)) { setErrorField("category"); setError("A budget for this category and month already exists. Edit that budget instead."); categoryRef.current?.focus(); return; }
    saving.current = true; setPending(true); setErrorField(""); setError("");
    try { const result = await onSave({ id: initial?.id ?? crypto.randomUUID(), month, category, limitPoisha: poisha }); if (result) setError(result); }
    catch { setError("The save could not be confirmed. Reload saved data before retrying."); }
    finally { saving.current = false; setPending(false); }
  }
  async function reloadDraft() {
    if (saving.current || !reload) return;
    saving.current = true; setPending(true);
    try { await reload(); } finally { saving.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={value => { if (!value && !pending) close(); }}><DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}><div className="dialog-heading"><span className="eyebrow">Plan the everyday</span><DialogTitle>{initial ? "Edit budget" : "Set budget"}</DialogTitle><DialogDescription>{month} · BDT ৳. One expense limit per category and month, saved to your account.</DialogDescription></div><form onSubmit={submit} noValidate aria-busy={pending}><fieldset disabled={pending} className="form-fields"><div className="field"><label htmlFor="budget-category">Expense category <span>(required)</span></label><select ref={categoryRef} id="budget-category" value={category} onChange={e => { setCategory(e.target.value); setError(""); setErrorField(""); }} aria-invalid={errorField === "category"} aria-describedby={errorField === "category" ? "budget-error" : undefined}>{categories.expense.map(item => <option key={item}>{item}</option>)}</select></div><div className="field"><label htmlFor="budget-amount">Monthly limit <span>(BDT ৳ · required)</span></label><input ref={amountRef} id="budget-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} aria-describedby={errorField === "amount" ? "budget-error" : undefined} aria-invalid={errorField === "amount"} /></div></fieldset>{error && <><p className="save-error" id="budget-error" role="alert">{error}</p>{reload && <Button type="button" variant="outline" disabled={pending} onClick={() => void reloadDraft()}>Reload saved data</Button>}</>}<div className="dialog-actions"><Button disabled={pending} type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={pending} type="submit">{pending ? "Saving…" : initial ? "Save budget" : "Set budget"}</Button></div></form></DialogContent></Dialog>;
}
export function ConfirmDialog({ title, description, action, onConfirm, close, restoreFocus, reload, children }: { reload?: () => Promise<void>; title: string; description: string; action: string; onConfirm: () => Promise<string | null>; close: () => void; restoreFocus: () => void; children?: React.ReactNode }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  async function confirm() {
    if (saving.current) return;
    saving.current = true; setPending(true); setError("");
    try { const result = await onConfirm(); if (result) setError(result); }
    catch { setError("The operation could not be confirmed. Reload saved data before retrying."); }
    finally { saving.current = false; setPending(false); }
  }
  async function reloadDraft() {
    if (saving.current || !reload) return;
    saving.current = true; setPending(true);
    try { await reload(); } finally { saving.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={value => { if (!value && !pending) close(); }}><DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}><div className="dialog-heading"><span className="eyebrow">Please review</span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>{children}{error && <><p className="save-error" role="alert">{error}</p>{reload && <Button type="button" variant="outline" disabled={pending} onClick={() => void reloadDraft()}>Reload saved data</Button>}</>}<div className="dialog-actions"><Button ref={cancel} disabled={pending} variant="outline" onClick={close}>Cancel</Button><Button disabled={pending} className="button-danger" onClick={() => void confirm()}>{pending ? "Saving…" : action}</Button></div></DialogContent></Dialog>;
}
export function TransactionAmount({ transaction }: { transaction: Transaction }) { return <span className={`transaction-amount ${transaction.type}`}><strong>{transaction.type === "income" ? "+" : "−"}{money(transaction.poisha)}</strong><span>{transaction.type === "income" ? "Income" : "Expense"}</span></span>; }
