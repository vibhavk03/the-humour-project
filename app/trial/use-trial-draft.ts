"use client";

import { useSyncExternalStore } from "react";
import { DRAFT_KEY, parseDraft, type TrialDraft } from "./draft";
import { SAMPLES } from "./samples";

const CHANGE_EVENT = "humour-trial-draft-change";
let fallback: string | null = null;
const EMPTY: TrialDraft = { sampleId: SAMPLES[0].id, results: {}, remaining: null };
function snapshot() {
  if (fallback !== null) return fallback;
  try { return window.sessionStorage.getItem(DRAFT_KEY); }
  catch { return fallback; }
}
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveTrialDraft(draft: TrialDraft) {
  fallback = JSON.stringify(draft);
  let persisted = false;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, fallback);
    persisted = true;
  } catch { /* Keep the current trial usable even when browser storage is blocked. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return persisted;
}

export function clearTrialDraft() {
  fallback = null;
  try { window.sessionStorage.removeItem(DRAFT_KEY); }
  catch { /* The in-memory draft is still cleared if storage is unavailable. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTrialDraft() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return parseDraft(raw) ?? EMPTY;
}
