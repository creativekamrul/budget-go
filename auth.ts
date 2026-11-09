import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHash } from "node:crypto";
import { db } from "./lib/server/db";
import { DUMMY_HASH, verifyPassword } from "./lib/server/password";

async function takeAttempt(key: string, milliseconds: number, maximum: number): Promise<boolean> {
  const start = new Date(Date.now() - milliseconds);
  const rows = await db().$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginRateLimit" ("key", "windowStart", "attempts") VALUES (${key}, NOW(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginRateLimit"."windowStart" < ${start} THEN 1 ELSE LEAST("LoginRateLimit"."attempts" + 1, 1000000) END,
      "windowStart" = CASE WHEN "LoginRateLimit"."windowStart" < ${start} THEN NOW() ELSE "LoginRateLimit"."windowStart" END
    RETURNING "attempts"`;
  return rows[0].attempts <= maximum;
}
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Credentials({
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials) {
      try {
        const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 256 || !password) return null;
        if (!await takeAttempt("global", 60_000, 120)) return null;
        if (!await takeAttempt(createHash("sha256").update(email).digest("hex"), 15 * 60_000, 10)) return null;
        await db().loginRateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
        const user = await db().user.findUnique({ where: { email } });
        const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
        if (!matches || !user || !user.active) return null;
        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      } catch { return null; }
    },
  })],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.sessionVersion = user.sessionVersion; }
      if (typeof token.id === "string" && token.id) {
        try {
          const current = await db().user.findUnique({ where: { id: token.id }, select: { active: true, sessionVersion: true } });
          if (!current?.active || current.sessionVersion !== token.sessionVersion) { token.id = ""; token.sessionVersion = 0; }
        } catch { throw new Error("Authentication service unavailable."); }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.id === "string" ? token.id : "";
      session.user.sessionVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      return session;
    },
    redirect({ url }) {
      const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
      try { const target = new URL(url, base); return target.origin === new URL(base).origin ? target.href : base; } catch { return base; }
    },
  },
  logger: {
    error() { console.error("[auth] Authentication request failed."); },
    warn() { console.warn("[auth] Authentication configuration warning."); },
  },
});
