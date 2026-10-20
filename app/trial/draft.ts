import { SAMPLES, getSample } from "./samples";

export const DRAFT_KEY = "humour-sample-draft-v1";
export type Choice = { caption: string; reviewToken: string };
export type SampleResult = { choices: Choice[]; selected: string; generationToken?: string; remainingCaptions?: number };
export type TrialDraft = { sampleId: string; results: Record<string, SampleResult>; remaining: number | null };

export function parseDraft(raw: string | null): TrialDraft | null {
  try {
    if (!raw || raw.length > 1_000_000) return null;
    const draft = JSON.parse(raw) as TrialDraft;
    if (!getSample(draft.sampleId) || !draft.results || typeof draft.results !== "object" || Array.isArray(draft.results)) return null;
    if (draft.remaining !== null && (!Number.isInteger(draft.remaining) || draft.remaining < 0 || draft.remaining > 10)) return null;
    const entries = Object.entries(draft.results);
    if (entries.length > SAMPLES.length) return null;
    for (const [id, result] of entries) {
      if (result?.generationToken !== undefined && (typeof result.generationToken !== "string" || result.generationToken.length > 2000)) return null;
      if (result?.remainingCaptions !== undefined && (!Number.isInteger(result.remainingCaptions) || result.remainingCaptions < 0 || result.remainingCaptions > 30)) return null;
      if (!getSample(id) || !result || !Array.isArray(result.choices) || result.choices.length > 60 || typeof result.selected !== "string") return null;
      if (result.choices.some(choice => !choice || typeof choice.caption !== "string" || !choice.caption || choice.caption.length > 200 || typeof choice.reviewToken !== "string" || choice.reviewToken.length > 16000)) return null;
      if (result.selected && !result.choices.some(choice => choice.caption === result.selected)) return null;
    }
    return draft;
  } catch {
    return null;
  }
}
