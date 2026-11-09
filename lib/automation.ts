import { z } from "zod";
import { validDate } from "./preview";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const preferencesSchema = z.object({
  timezone: z.literal("Asia/Dhaka"), locale: z.enum(["en-BD", "bn-BD"]), density: z.enum(["comfortable", "compact"]),
  accent: z.enum(["emerald", "teal", "amber"]), weekStart: z.enum(["sat", "sun", "mon"]), fiscalYearStartMonth: z.number().int().min(1).max(12),
  defaultEntryStatus: z.enum(["confirmed", "pending"]), storeRawMessages: z.boolean(), automationEnabled: z.boolean(),
}).strict();
export type WorkspacePreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = (): WorkspacePreferences => ({ timezone: "Asia/Dhaka", locale: "en-BD", density: "comfortable", accent: "emerald", weekStart: "sat", fiscalYearStartMonth: 7, defaultEntryStatus: "confirmed", storeRawMessages: false, automationEnabled: true });
export const DEFAULT_PREFERENCES = defaultPreferences();
export const sourceFieldsSchema = z.object({ name: z.string().trim().min(1).max(80), channel: z.enum(["sms", "email", "manual"]), providerLabel: z.string().trim().max(80), accountId: id.nullable(), enabled: z.boolean() }).strict();
export const automationSourceSchema = sourceFieldsSchema.extend({ id });
export type AutomationSource = z.infer<typeof automationSourceSchema>;
export const automationDraftSchema = z.object({
  accountId: id.nullable(), description: z.string().trim().max(120), type: z.enum(["income", "expense"]).nullable(), category: z.string().max(80), categoryId: id.nullable(),
  date: z.string().refine(validDate, "Use a real YYYY-MM-DD date.").nullable(), poisha: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  merchantId: id.nullable(), tagIds: z.array(id).max(500).refine(ids => new Set(ids).size === ids.length), notes: z.string().max(2000), status: z.enum(["confirmed", "pending"]), excluded: z.boolean(),
}).strict();
export type AutomationDraft = z.infer<typeof automationDraftSchema>;
export const emptyAutomationDraft = (): AutomationDraft => ({ accountId: null, description: "", type: null, category: "", categoryId: null, date: null, poisha: null, merchantId: null, tagIds: [], notes: "", status: "confirmed", excluded: false });
export const automationEventSchema = z.object({
  id, sourceId: id, externalId: z.string().min(1).max(200), reference: z.string().max(120), receivedAt: z.string(), status: z.enum(["needs_review", "ready", "accepted", "ignored"]),
  draft: automationDraftSchema, issues: z.array(z.string()), duplicateOfEventId: id.nullable(), duplicateTransactionIds: z.array(id), transactionId: id.nullable(), rawText: z.string().nullable(),
}).strict();
export type AutomationEvent = z.infer<typeof automationEventSchema>;
export const automationSnapshotSchema = z.object({ revision, preferences: preferencesSchema, sources: z.array(automationSourceSchema), events: z.array(automationEventSchema), eventTotal: z.number().int().nonnegative(), eventLimit: z.literal(200), nextCursor: id.nullable() }).strict();
export type AutomationSnapshot = z.infer<typeof automationSnapshotSchema>;
export const emptyAutomationSnapshot = (): AutomationSnapshot => ({ revision: 0, preferences: defaultPreferences(), sources: [], events: [], eventTotal: 0, eventLimit: 200, nextCursor: null });
export const automationCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("preferences_update"), preferences: preferencesSchema }).strict(),
  z.object({ type: z.literal("source_create"), source: sourceFieldsSchema }).strict(),
  z.object({ type: z.literal("source_update"), id, source: sourceFieldsSchema }).strict(),
  z.object({ type: z.literal("event_update"), id, draft: automationDraftSchema }).strict(),
  z.object({ type: z.literal("event_accept"), id, acknowledgeDuplicate: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("event_ignore"), id, ignored: z.boolean() }).strict(),
]);
export type AutomationCommand = z.infer<typeof automationCommandSchema>;
export const ingestSchema = z.object({ sourceId: id, externalId: z.string().trim().min(1).max(200), rawText: z.string().min(1).max(16000).optional(), reference: z.string().trim().max(120).optional(), draft: automationDraftSchema.partial().strict().optional() }).strict().refine(value => !!value.rawText || !!value.draft, "Supply rawText or a structured draft.");
export type IngestInput = z.infer<typeof ingestSchema>;
export const alertParseSchema = z.object({rawText:z.string().min(1).max(16000)}).strict();

export function normalizeBanglaDigits(text: string): string { return text.replace(/[০-৯]/g, digit => String(digit.charCodeAt(0) - 0x09e6)); }
export function containsSecuritySecret(text: string): boolean { return /\b(?:otp|one[ -]?time(?:\s+password|\s+code)?|verification\s+code|security\s+code|pin|password|passcode|cvv|cvc)\b|ওটিপি|পাসওয়ার্ড|পাসওয়ার্ড|পিন\s*(?:কোড|নম্বর|:)/i.test(text); }
function exactAmount(value: string): number | null {
  const grouping = /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/;
  if (!grouping.test(value)) return null;
  const [whole, cents = ""] = value.replaceAll(",", "").split(".");
  const amount = BigInt(whole) * 100n + BigInt(cents.padEnd(2, "0"));
  return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
/** Conservative helper, not a bank-specific parser or AI. Missing/ambiguous fields remain unset. */
export function parseBangladeshAlert(rawText: string): { draft: AutomationDraft; reference: string; issues: string[] } {
  const text = normalizeBanglaDigits(rawText);
  const draft = emptyAutomationDraft();
  const issues: string[] = [];
  if (containsSecuritySecret(text)) throw new Error("Security codes, OTPs and passwords must not be sent to the finance inbox.");
  const debit = /\b(?:debited|debit|spent|purchase|withdrawal)\b|ডেবিট|খরচ/i.test(text);
  const credit = /\b(?:credited|credit|received|deposit)\b|ক্রেডিট|জমা/i.test(text);
  if (debit !== credit) draft.type = debit ? "expense" : "income";
  else issues.push("Confirm whether the alert is income or expense.");
  // Balance amounts commonly follow the transaction amount. If more than one amount is present,
  // only an amount directly adjacent to an explicit debit/credit word is eligible.
  const adjacent = [...text.matchAll(/\b(?:debited|credited|spent|received|withdrawal|deposit)(?:\s+(?:with|by|for|of|amount))*\s*[:=-]?\s*(?:BDT|Tk\.?|৳)\s*([\d,]+(?:\.\d+)?)/gi), ...text.matchAll(/(?:BDT|Tk\.?|৳)\s*([\d,]+(?:\.\d+)?)\s*(?:has\s+been\s+)?(?:debited|credited|spent|received)\b/gi)];
  const allAmounts = [...text.matchAll(/(?:\bBDT\b|\bTk\.?|৳)\s*([\d,]+(?:\.\d+)?)/gi)].filter(match => !/\b(?:balance|bal|fee|fees|limit)\b[^.!?;]*$/i.test(text.slice(Math.max(0, match.index - 60), match.index)));
  const amounts = [...new Set((adjacent.length ? adjacent : allAmounts).map(match => match[1]))];
  if (amounts.length === 1) draft.poisha = exactAmount(amounts[0]);
  if (!draft.poisha) issues.push("Confirm the transaction amount in BDT; balances and fees are not guessed.");
  const dates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(match => match[1]);
  for (const match of text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g)) dates.push(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
  const uniqueDates = [...new Set(dates)];
  if (uniqueDates.length === 1 && validDate(uniqueDates[0])) draft.date = uniqueDates[0];
  else issues.push("Confirm the real transaction date; missing, two-digit-year or conflicting dates are not guessed.");
  const references = [...text.matchAll(/\b(?:trx\s*id|trxid|txn\s*id|transaction\s*id|reference|ref)(?:\s+(?:number|no|id)\b\.?)?\s*[:#=.-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,119})\b/gi)].map(match => match[1]).filter(value => !/^(?:number|transaction|amount|reference|balance|unknown)$/i.test(value));
  const reference = new Set(references).size === 1 ? references[0] : "";
  return { draft, reference, issues };
}
