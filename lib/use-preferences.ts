"use client";

import { useEffect, useState } from "react";
import { defaultPreferences, preferencesSchema, type WorkspacePreferences } from "./automation";
export type { WorkspacePreferences } from "./automation";
export const preferencesChanged = () => window.dispatchEvent(new Event("budget-go-preferences-changed"));

export function usePreferences() {
  const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewCount, setReviewCount] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    fetch("/api/v3/automation", { cache: "no-store", credentials: "same-origin", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Preferences could not be loaded. Default display settings are in use.");
      const value = await response.json();
      const parsed = preferencesSchema.parse(value.preferences);
      if (alive) {
        setPreferences(parsed); setError("");
        setReviewCount(Array.isArray(value.events) ? value.events.filter((item: { status: string }) => item.status === "needs_review" || item.status === "ready").length : 0);
      }
    }).catch(() => { if (alive) setError("Preferences could not be loaded. Default display settings are in use."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [version]);
  useEffect(() => {
    const reload = () => setVersion(value => value + 1);
    window.addEventListener("budget-go-preferences-changed", reload);
    window.addEventListener("budget-go-automation-changed", reload);
    return () => { window.removeEventListener("budget-go-preferences-changed", reload); window.removeEventListener("budget-go-automation-changed", reload); };
  }, []);
  return { preferences, loading, error, reviewCount, reload: () => setVersion(value => value + 1) };
}
