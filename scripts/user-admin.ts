import "./load-env";
import { parseArgs } from "node:util";
import { emitKeypressEvents } from "node:readline";
import { db } from "../lib/server/db";
import { hashPassword, passwordValid } from "../lib/server/password";
class AdminError extends Error {}
async function maskedPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new AdminError("Use a terminal for the masked password prompt, or securely supply BUDGET_GO_ADMIN_PASSWORD in the process environment (never a CLI argument).");
  emitKeypressEvents(process.stdin);
  const wasRaw = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const chars: string[] = [];
    function finish(error?: Error) { process.stdin.removeListener("keypress", onKey); process.stdin.setRawMode(wasRaw); process.stdin.pause(); process.stdout.write("\n"); if (error) reject(error); else resolve(chars.join("")); }
    function onKey(value: string, key: { name?: string; ctrl?: boolean }) {
      if (key?.ctrl && key.name === "c") { finish(new AdminError("Cancelled.")); return; }
      if (key?.name === "return" || key?.name === "enter") { finish(); return; }
      if (key?.name === "backspace") { if (chars.length) { chars.pop(); process.stdout.write("\b \b"); } return; }
      if (key?.ctrl || !value || /[\x00-\x1f\x7f]/.test(value)) return;
      for (const character of value) { if (chars.join("").length >= 256) break; chars.push(character); process.stdout.write("*"); }
    }
    process.stdin.on("keypress", onKey);
  });
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: { email: { type: "string" }, name: { type: "string" } } });
  const action = positionals[0];
  if (positionals.length !== 1 || !["create", "reset", "disable"].includes(action)) throw new AdminError("Use npm run user:create -- --email address --name Name; user:reset -- --email address; or user:disable -- --email address.");
  const email = values.email?.trim().toLowerCase() ?? "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminError("Supply a valid --email address.");
  if (!process.env.DATABASE_URL) throw new AdminError("Set DATABASE_URL before administration.");
  let passwordHash = "";
  if (action !== "disable") {
    let password = process.env.BUDGET_GO_ADMIN_PASSWORD;
    delete process.env.BUDGET_GO_ADMIN_PASSWORD;
    if (password === undefined) { password = await maskedPassword("New password (12–256 characters): "); const confirm = await maskedPassword("Confirm password: "); if (password !== confirm) throw new AdminError("Passwords did not match."); }
    if (!passwordValid(password)) throw new AdminError("Password must be 12–256 characters and cannot be all whitespace.");
    passwordHash = await hashPassword(password);
  }
  const client = db();
  try {
    if (action === "create") {
      const name = values.name?.trim() ?? "";
      if (!name || name.length > 80) throw new AdminError("Supply a display --name of 1–80 characters.");
      await client.user.create({ data: { email, name, passwordHash, categories: { create: [
          ...["Salary", "Freelance", "Other income"].map(name => ({ id: `builtin-${name.toLowerCase().replaceAll(" ", "-")}`, name, kind: "income", color: "#A6BCFF", icon: "folder" })),
          ...["Groceries", "Dining", "Transport", "Home", "Shopping"].map(name => ({ id: `builtin-${name.toLowerCase()}`, name, kind: "expense", color: "#A6BCFF", icon: "folder" })),
        ] } } });
      console.log("User created. No transactions, budgets or API tokens were seeded.");
    } else {
      await client.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "email" = ${email} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { email } });
        if (!user) throw new AdminError("No matching user.");
        if (action === "reset" && user.sessionVersion >= 2_147_483_647) throw new AdminError("Session version limit reached. Administrator intervention required.");
        await tx.user.update({ where: { id: user.id }, data: action === "reset" ? { passwordHash, sessionVersion: user.sessionVersion + 1 } : { active: false } });
        await tx.apiToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      });
      console.log(action === "reset" ? "Password reset. Existing browser sessions and API tokens are invalidated. Finance data was not changed." : "User disabled. Browser sessions and API tokens can no longer access this account. Finance data was not changed.");
    }
  } finally { await client.$disconnect(); }
}
main().catch(error => {
  // Only our own validation text is safe to show; raw database errors can include credentials.
  const safe = error instanceof AdminError;
  console.error(safe ? error.message : "User administration failed. Check database configuration, applied migrations and whether the email already exists. Connection details have not been printed.");
  process.exitCode = 1;
});
