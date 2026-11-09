export type Transaction = { id: string; description: string; category: string; date: string; type: "income" | "expense"; poisha: number };
export const categories = { income: ["Salary", "Freelance", "Other income"], expense: ["Groceries", "Dining", "Transport", "Home", "Shopping"] };
const formatter = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function decimalAmount(poisha: number) { return `${Math.floor(poisha / 100)}.${String(poisha % 100).padStart(2, "0")}`; }
export function money(poisha: number) {
  const absolute = BigInt(Math.abs(poisha));
  const whole = absolute / 100n;
  const signedWhole = poisha < 0 ? (whole === 0n ? -0 : -whole) : whole;
  return formatter.formatToParts(signedWhole).map(part => part.type === "fraction" ? String(absolute % 100n).padStart(2, "0") : part.value).join("");
}
export function parseAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return y >= 1000 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
