"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyWorkspace, validateCommand, validateWorkspace, type WorkspaceCommand } from "./workspace";

type PendingRequest = { expectedRevision: number; requestId: string; command: WorkspaceCommand; fingerprint: string };
type Status = "loading" | "ready" | "unavailable" | "unauthenticated";

function serverMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

export function useWorkspace() {
  const [data, setData] = useState(emptyWorkspace);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const request = useRef<PendingRequest | null>(null);
  const saving = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    if (saving.current) return;
    const id = ++generation.current;
    setStatus("loading");
    try {
      const response = await fetch("/api/v4/workspace", { cache: "no-store", credentials: "same-origin" });
      const payload: unknown = await response.json();
      if (!alive.current || id !== generation.current) return;
      if (!response.ok) {
        setStatus(response.status === 401 ? "unauthenticated" : "unavailable");
        setError(serverMessage(payload, "Your workspace could not be loaded. Try again."));
        return;
      }
      setData(validateWorkspace(payload));
      setStatus("ready");
      setStale(false);
      setError(request.current ? "A previous save has an unknown result. Retry that save safely before making another change." : "");
    } catch {
      if (!alive.current || id !== generation.current) return;
      setStatus("unavailable");
      setError("Your workspace could not be loaded. Check the connection and try again. Saved data has not been replaced.");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void reload(); });
    return () => { cancelled = true; alive.current = false; };
  }, [reload]);

  async function send(command: WorkspaceCommand, retry = false): Promise<string | null> {
    if (saving.current) return "A save is already in progress.";
    if (!retry && (status !== "ready" || stale)) return "Reload saved data before making another change. Your draft is still here.";
    let checked: WorkspaceCommand;
    try { checked = validateCommand(command); }
    catch (cause) { return cause instanceof Error ? cause.message : "Check the entered values."; }
    const fingerprint = JSON.stringify(checked);
    if (request.current && request.current.fingerprint !== fingerprint) return "Resolve the previous save before changing this draft or starting a different save.";
    const envelope = request.current ?? { command: checked, expectedRevision: data.revision, requestId: crypto.randomUUID(), fingerprint };
    request.current = envelope;
    // A read started before this mutation must never replace its newer saved snapshot.
    ++generation.current;
    saving.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/v4/workspace", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: envelope.expectedRevision, requestId: envelope.requestId, command: envelope.command }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = serverMessage(payload, "The save could not be confirmed.");
        if (response.status < 500) request.current = null;
        if (alive.current) {
          setError(message);
          setUncertain(response.status >= 500);
          if (response.status === 409) setStale(true);
          if (response.status === 401) setStatus("unauthenticated");
        }
        return message;
      }
      const saved = validateWorkspace(payload);
      request.current = null;
      if (alive.current) { setData(saved); setStatus("ready"); setError(""); setStale(false); setUncertain(false); }
      return null;
    } catch {
      const message = "The save result is unknown. Retry the same save safely; its request ID prevents duplicate entries.";
      if (alive.current) { setUncertain(true); setError(message); }
      return message;
    } finally {
      saving.current = false;
      if (alive.current) setPending(false);
    }
  }

  async function retryPending() {
    const previous = request.current;
    if (!previous) return null;
    return send(previous.command, true);
  }

  return { data, status, error, pending, stale, uncertain, reload, save: send, retryPending };
}
