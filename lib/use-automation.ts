"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { automationCommandSchema, automationSnapshotSchema, emptyAutomationSnapshot, ingestSchema, type AutomationCommand, type IngestInput } from "./automation";
import { preferencesChanged } from "./use-preferences";

type Request = { kind: "command"; expectedRevision: number; requestId: string; command: AutomationCommand } | { kind: "ingest"; input: IngestInput };
const message = (value: unknown, fallback: string) => value && typeof value === "object" && "error" in value && value.error && typeof value.error === "object" && "message" in value.error && typeof value.error.message === "string" ? value.error.message : fallback;
export function useAutomation() {
  const [data, setData] = useState(emptyAutomationSnapshot);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "unauthenticated">("loading");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const alive = useRef(true), busy = useRef(false), generation = useRef(0);
  const request = useRef<Request | null>(null);
  const revision = useRef(0);
  const reload = useCallback(async () => {
    if (busy.current) return;
    const version = ++generation.current;
    setStatus("loading");
    try {
      const response = await fetch("/api/v3/automation", { credentials: "same-origin", cache: "no-store" });
      const value: unknown = await response.json();
      if (!alive.current || version !== generation.current) return;
      if (!response.ok) { setStatus(response.status === 401 ? "unauthenticated" : "unavailable"); setError(message(value, "Automation could not be loaded. Saved entries are unchanged.")); return; }
      const saved = automationSnapshotSchema.parse(value); revision.current = saved.revision; setData(saved); setStatus("ready"); setHasLoaded(true); setStale(false);
      setError(request.current ? "A previous save has an unknown result. Retry it safely before making another change." : "");
    } catch {
      if (alive.current && version === generation.current) { setStatus("unavailable"); setError("Automation could not be loaded. Check your connection and reload; saved entries are unchanged."); }
    }
  }, []);
  useEffect(() => { alive.current = true; let cancelled = false; queueMicrotask(() => { if (!cancelled) void reload(); }); return () => { cancelled = true; alive.current = false; }; }, [reload]);
  async function send(next: Request, retry = false): Promise<string | null> {
    if (busy.current) return "A save is already in progress.";
    if (!retry && (status !== "ready" || stale)) return "Reload saved data, then review your retained draft before saving.";
    if (request.current && JSON.stringify(next) !== JSON.stringify(request.current)) return "Resolve the previous save before starting a different change.";
    request.current = next; busy.current = true; ++generation.current; setPending(true);
    let refresh = false;
    try {
      const response = await fetch(next.kind === "ingest" ? "/api/v3/ingest" : "/api/v3/automation", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next.kind === "ingest" ? next.input : { expectedRevision: next.expectedRevision, requestId: next.requestId, command: next.command }),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const problem = message(value, "The save could not be confirmed.");
        if (response.status < 500) request.current = null;
        if (alive.current) { setError(problem); setUncertain(response.status >= 500); if (response.status === 409) setStale(true); if (response.status === 401) setStatus("unauthenticated"); }
        return problem;
      }
      if (next.kind === "command") {
        const saved = automationSnapshotSchema.parse(value);
        revision.current = saved.revision;
        if (alive.current) setData(saved);
      } else refresh = true;
      request.current = null;
      if (alive.current) { setStatus("ready"); setError(""); setStale(false); setUncertain(false); }
      if (next.kind === "command" && next.command.type === "preferences_update") preferencesChanged();
      window.dispatchEvent(new Event("budget-go-automation-changed"));
      return null;
    } catch {
      const problem = "The save result is unknown. Retry the same save safely; its stable identifier prevents another entry.";
      if (alive.current) { setError(problem); setUncertain(true); }
      return problem;
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
      if (refresh && alive.current) await reload();
    }
  }
  async function save(command: AutomationCommand) {
    const parsed = automationCommandSchema.safeParse(command);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the entered fields.";
    if (request.current) return "Retry the previous save safely before changing this draft.";
    return send({ kind: "command", expectedRevision: revision.current, requestId: crypto.randomUUID(), command: parsed.data });
  }
  async function ingest(input: IngestInput) {
    const parsed = ingestSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the message.";
    if (request.current) return "Retry the previous save safely before changing this draft.";
    return send({ kind: "ingest", input: parsed.data });
  }
  async function loadMore() {
    if (!data.nextCursor || busy.current || status !== "ready" || stale || uncertain) return;
    busy.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v3/automation?cursor=${encodeURIComponent(data.nextCursor)}`, { cache: "no-store", credentials: "same-origin" });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(message(value, "More alerts could not be loaded."));
      const next = automationSnapshotSchema.parse(value);
      if (next.revision !== revision.current) { setStale(true); setError("Your inbox changed. Reload saved data before loading older alerts; your draft is retained."); return; }
      if (alive.current) setData(previous => ({ ...next, events: [...previous.events, ...next.events.filter(item => !previous.events.some(saved => saved.id === item.id))] }));
    } catch { if (alive.current) setError("Older alerts could not be loaded. Your saved inbox is unchanged; try again."); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return { data, status, hasLoaded, error, pending, stale, uncertain, reload, loadMore, save, ingest, retryPending: () => request.current ? send(request.current, true) : Promise.resolve(null) };
}
