"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyPlanning, planningCommandSchema, planningSnapshotSchema, type PlanningCommand } from "./planning";

const message = (value: unknown, fallback: string) => value && typeof value === "object" && "error" in value && value.error && typeof value.error === "object" && "message" in value.error && typeof value.error.message === "string" ? value.error.message : fallback;
type Request = { expectedRevision: number; requestId: string; command: PlanningCommand };
export function usePlanning() {
  const [data, setData] = useState(emptyPlanning);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "unauthenticated">("loading");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const alive = useRef(true), busy = useRef(false), generation = useRef(0), revision = useRef(0);
  const request = useRef<Request | null>(null);
  const reload = useCallback(async () => {
    if (busy.current) return;
    const version = ++generation.current; setStatus("loading");
    try {
      const response = await fetch("/api/v3/planning", { cache: "no-store", credentials: "same-origin" });
      const value: unknown = await response.json();
      if (!alive.current || version !== generation.current) return;
      if (!response.ok) { setStatus(response.status === 401 ? "unauthenticated" : "unavailable"); setError(message(value, "Planning could not be loaded. Saved finances are unchanged.")); return; }
      const saved = planningSnapshotSchema.parse(value);
      revision.current = saved.revision; setData(saved); setHasLoaded(true); setStatus("ready"); setStale(false);
      setError(request.current ? "A previous save has an unknown result. Retry it safely before starting another change." : "");
    } catch { if (alive.current && version === generation.current) { setStatus("unavailable"); setError("Planning could not be loaded. Check the connection and reload. Your saved finances are unchanged."); } }
  }, []);
  useEffect(() => { alive.current = true; let cancelled = false; queueMicrotask(() => { if (!cancelled) void reload(); }); return () => { cancelled = true; alive.current = false; }; }, [reload]);
  async function send(envelope: Request) {
    if (busy.current) return "A save is already in progress.";
    busy.current = true; request.current = envelope; ++generation.current; setPending(true);
    try {
      const response = await fetch("/api/v3/planning", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope) });
      const value: unknown = await response.json();
      if (!response.ok) {
        const problem = message(value, "The save could not be confirmed.");
        if (response.status < 500) request.current = null;
        if (alive.current) { setError(problem); setUncertain(response.status >= 500); if (response.status === 409) setStale(true); if (response.status === 401) setStatus("unauthenticated"); }
        return problem;
      }
      const saved = planningSnapshotSchema.parse(value); revision.current = saved.revision; request.current = null;
      if (alive.current) { setData(saved); setStatus("ready"); setHasLoaded(true); setError(""); setStale(false); setUncertain(false); }
      return null;
    } catch {
      const problem = "The save result is unknown. Retry the same save safely; its request ID prevents another financial entry.";
      if (alive.current) { setError(problem); setUncertain(true); } return problem;
    } finally { busy.current = false; if (alive.current) setPending(false); }
  }
  async function save(command: PlanningCommand) {
    if (request.current) return "Resolve the previous save with a safe retry before changing this draft.";
    if (status !== "ready" || stale) return "Reload saved data and review the retained draft before saving.";
    const parsed = planningCommandSchema.safeParse(command);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the planning fields.";
    return send({ expectedRevision: revision.current, requestId: crypto.randomUUID(), command: parsed.data });
  }
  return { data, status, hasLoaded, error, pending, stale, uncertain, reload, save, retryPending: () => request.current ? send(request.current) : Promise.resolve(null) };
}
