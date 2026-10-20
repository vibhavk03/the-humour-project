import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeedReturnPath } from "./return-path";

export const PENDING_VOTE_COOKIE = "humour_pending_vote";
export const PENDING_VOTE_MAX_AGE = 10 * 60;
export type PendingVote = { id: string; postId: string; vote: 1 | -1; returnTo: string; expires: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sign(payload: string) {
  const secret = process.env.AUTH_ACTION_SECRET || process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Sign-in actions are not configured.");
  return createHmac("sha256", secret).update(`pending-vote:${payload}`).digest();
}
export function createPendingVote(postId: string, vote: 1 | -1, returnTo: string) {
  if (!uuid.test(postId) || (vote !== 1 && vote !== -1)) throw new Error("Invalid vote");
  const pending: PendingVote = { id: randomUUID(), postId, vote, returnTo: getFeedReturnPath(returnTo), expires: Date.now() + PENDING_VOTE_MAX_AGE * 1000 };
  const payload = Buffer.from(JSON.stringify(pending)).toString("base64url");
  return { id: pending.id, token: `${payload}.${sign(payload).toString("base64url")}` };
}
export function readPendingVote(token: string | undefined): PendingVote | null {
  try {
    if (!token || token.length > 2000) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = sign(payload), actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as PendingVote;
    if (!uuid.test(value.id) || !uuid.test(value.postId) || (value.vote !== 1 && value.vote !== -1) || typeof value.returnTo !== "string" || getFeedReturnPath(value.returnTo) !== value.returnTo || !Number.isFinite(value.expires) || value.expires <= Date.now()) return null;
    return value;
  } catch { return null; }
}
export async function applyPendingVote(supabase: SupabaseClient, userId: string, pending: PendingVote): Promise<"saved" | "missing" | "failed"> {
  try {
    const { data: post, error } = await supabase.from("home_feed").select("id").eq("id", pending.postId).maybeSingle();
    if (error) return "failed";
    if (!post) return "missing";
    // Set the desired state. Repeated callbacks cannot add another vote.
    const { error: writeError } = await supabase.from("post_hearts").upsert({ post_id: pending.postId, user_id: userId, vote: pending.vote }, { onConflict: "post_id,user_id" });
    return writeError ? "failed" : "saved";
  } catch { return "failed"; }
}
