import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const settings = { N: 65_536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
let active = 0;
const waiting: Array<() => void> = [];
async function derive(password: string, salt: string): Promise<Buffer> {
  // Bound memory under a login burst: each scrypt uses about 64 MiB, regardless of libuv pool size.
  if (active >= 2) {
    if (waiting.length >= 120) throw new Error("Authentication is busy. Retry later.");
    await new Promise<void>(resolve => waiting.push(resolve));
  } else active += 1;
  try { return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, settings, (error, key) => error ? reject(error) : resolve(key))); }
  finally { const next = waiting.shift(); if (next) next(); else active -= 1; }
}
export function passwordValid(password: string) { return password.length >= 12 && password.length <= 256 && /\S/.test(password); }
export async function hashPassword(password: string): Promise<string> {
  if (!passwordValid(password)) throw new Error("Password must be 12–256 characters.");
  const salt = randomBytes(24).toString("hex");
  const hash = await derive(password, salt);
  return `scrypt-v1$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, expected] = encoded.split("$");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{48}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(expected ?? "") || password.length > 256) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(Buffer.from(expected, "hex"), actual);
}
// Fixed format dummy hash ensures unknown users still perform the same scrypt work.
export const DUMMY_HASH = `scrypt-v1$${"0".repeat(48)}$${"0".repeat(128)}`;
