"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./finance-dialogs";
type TokenMetadata = { id: string; name: string; scopes: string[]; expiresAt: string; revokedAt: string | null; createdAt: string };
function message(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}
function metadata(value: unknown): value is TokenMetadata {
  if (!value || typeof value !== "object") return false;
  const item = value as TokenMetadata;
  return typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.scopes) && item.scopes.every(scope => typeof scope === "string") && typeof item.expiresAt === "string" && typeof item.createdAt === "string" && (item.revokedAt === null || typeof item.revokedAt === "string");
}
export function IntegrationSettings() {
  const [tokens, setTokens] = useState<TokenMetadata[]>([]);
  const [loadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [write, setWrite] = useState(false);
  const [secret, setSecret] = useState("");
  const [revoke, setRevoke] = useState<TokenMetadata | null>(null);
  const busy = useRef(false);
  const invoker = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const secretHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/v1/tokens", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(message(payload, "Could not load integration tokens. Sign in again or retry."));
        if (!Array.isArray(payload) || !payload.every(metadata)) throw new Error("Unexpected token list response.");
        setTokens(payload);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load integration tokens."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (busy.current) return;
    if (!name.trim() || name.trim().length > 80 || !/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365) { setError("Use a token name of 1–80 characters and an expiry of 1–365 days."); return; }
    busy.current = true; setPending(true); setError(""); setNotice(""); setSecret("");
    try {
      const response = await fetch("/api/v1/tokens", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), scopes: write ? ["finance:read", "finance:write"] : ["finance:read"], expiresInDays: Number(days) }) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(message(payload, "Could not create an integration token."));
      if (!payload || typeof payload !== "object" || !("token" in payload) || typeof payload.token !== "string" || !("metadata" in payload) || !metadata(payload.metadata)) throw new Error("Could not confirm token creation. Reload and revoke any unrecognized token before retrying.");
      setTokens(current => [payload.metadata as TokenMetadata, ...current]); setSecret(payload.token); setName(""); setNotice("Token created. Its secret is shown only now. Keep it in your integration's private credential store.");
      requestAnimationFrame(() => secretHeading.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Token creation could not be confirmed. Reload this page and revoke any unrecognized token before retrying."); }
    finally { busy.current = false; setPending(false); }
  }
  async function revokeToken(): Promise<string | null> {
    if (!revoke || busy.current) return "An operation is already in progress.";
    busy.current = true; setPending(true); setError(""); setSecret("");
    try {
      const response = await fetch(`/api/v1/tokens/${encodeURIComponent(revoke.id)}`, { method: "DELETE", credentials: "same-origin" });
      const payload: unknown = await response.json();
      if (!response.ok) return message(payload, "The token could not be revoked. Retry when the server is available.");
      setTokens(current => current.map(token => token.id === revoke.id ? { ...token, revokedAt: new Date().toISOString() } : token));
      setRevoke(null); setNotice("Token revoked. Future requests using it will be rejected."); return null;
    } catch { return "Revocation could not be confirmed. Reload this page to check its status."; }
    finally { busy.current = false; setPending(false); }
  }
  return <><section className="settings-section panel" aria-labelledby="tokens-heading"><h2 id="tokens-heading" ref={heading} tabIndex={-1}>Integration access</h2><p>Create a separate, expiring token for each trusted n8n or MCP client. Read-only is the default. Read/write access can change or delete your finances. Tokens cannot manage users or mint other tokens. Financial write access includes accounts, entries, transfers, budgets and transaction classification.</p><p>Workspace API: <code>/api/v3/workspace</code> · MCP Streamable HTTP: <code>/api/mcp</code> with <code>workspace_get</code> and <code>workspace_mutate</code>. Use <code>Authorization: Bearer &lt;token&gt;</code> over HTTPS. These are manual bearer credentials, not an OAuth login. Never put a token in a URL. The legacy v1 export omits financial accounts and transfers; use Export workspace for a complete v3 snapshot with categories, tags, merchants and transaction metadata. Import/restore is not available yet.</p>{error && <p className="save-error" role="alert">{error} <Link href="/settings/integrations">Reload settings</Link></p>}{secret && <section className="token-secret" aria-labelledby="secret-heading"><h3 id="secret-heading" tabIndex={-1} ref={secretHeading}>Copy your token now</h3><p>It cannot be retrieved later. Closing this view hides it; revoke it if it is lost or exposed.</p><code>{secret}</code><div className="settings-actions"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(secret); setNotice("Token copied. Store it privately, then clear your clipboard."); } catch { setNotice("Clipboard unavailable. Select and copy the token manually."); } }}>Copy token</Button><Button variant="ghost" onClick={() => { setSecret(""); heading.current?.focus(); }}>Hide token</Button></div></section>}<form onSubmit={create} aria-busy={pending}><fieldset className="form-fields" disabled={pending || loading}><div className="field"><label htmlFor="token-name">Token name <span>(required · up to 80 characters)</span></label><input id="token-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="off" placeholder="e.g. My n8n budget automation" /></div><div className="field"><label htmlFor="token-days">Expires after <span>(1–365 days)</span></label><input id="token-days" type="number" min="1" max="365" step="1" required value={days} onChange={event => setDays(event.target.value)} /></div><label><input type="checkbox" checked={write} onChange={event => setWrite(event.target.checked)} /> Allow financial writes and deletes (includes read access)</label></fieldset><div className="settings-actions"><Button disabled={pending || loading} type="submit">{pending ? "Working…" : "Create token"}</Button></div></form><h3>Your tokens</h3>{loading ? <p role="status">Loading integration tokens…</p> : tokens.length ? <ul className="token-list">{tokens.map(token => { const inactive = !!token.revokedAt || Date.parse(token.expiresAt) <= loadedAt; return <li className="token-row" key={token.id}><div><strong>{token.name}</strong><p>{token.scopes.includes("finance:write") ? "Read / write" : "Read only"} · {token.revokedAt ? "Revoked" : inactive ? "Expired" : `Expires ${new Date(token.expiresAt).toLocaleDateString("en-BD")}`}</p></div><Button variant="outline" disabled={pending || inactive} aria-label={`Revoke ${token.name}`} onClick={event => { invoker.current = event.currentTarget; setRevoke(token); }}>Revoke</Button></li>; })}</ul> : !error && <p>No integration tokens yet.</p>}</section><p role="status" aria-live="polite">{notice}</p>{revoke && <ConfirmDialog title="Revoke integration token?" description={`Revoke “${revoke.name}”? Any automation using it will stop working. This cannot be undone.`} action="Revoke token" onConfirm={revokeToken} close={() => setRevoke(null)} restoreFocus={() => (invoker.current?.isConnected ? invoker.current : heading.current)?.focus()} />}</>;
}
