export type PresentationLocale = "en-BD" | "bn-BD";

export function todayInDhaka() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Format exact integer poisha without rounding a large value through floating point. */
export function formatMoney(poisha: number | bigint, locale: PresentationLocale = "en-BD") {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "BDT", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const exact = typeof poisha === "bigint" ? poisha : BigInt(poisha);
  const absolute = exact < 0n ? -exact : exact;
  const whole = absolute / 100n;
  const signedWhole = exact < 0n ? (whole === 0n ? -0 : -whole) : whole;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const digits = locale === "bn-BD" ? fraction.replace(/\d/g, digit => "০১২৩৪৫৬৭৮৯"[Number(digit)]) : fraction;
  return formatter.formatToParts(signedWhole).map(part => part.type === "fraction" ? digits : part.value).join("");
}

export function weekStartDate(date: string, start: "sat" | "sun" | "mon") {
  const value = new Date(`${date}T00:00:00Z`);
  const first = { sun: 0, mon: 1, sat: 6 }[start];
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() - first + 7) % 7);
  return value.toISOString().slice(0, 10);
}

export function fiscalStartDate(date: string, month: number) {
  const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < month ? 1 : 0);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
