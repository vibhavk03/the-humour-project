import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

export const PENDING_SHARE_COOKIE = "humour_pending_share";
export const PENDING_SHARE_MAX_AGE = 60 * 60;
type PendingShare = { sampleId: string; caption: string; reviewToken: string; expires: number };
function sign(payload: string) {
  const secret = process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Caption generation is not configured.");
  return createHmac("sha256", secret).update(`pending-share:${payload}`).digest();
}

export function createPendingShare(sampleId: string, caption: string, reviewToken: string) {
  const pending: PendingShare = { sampleId, caption, reviewToken, expires: Date.now() + PENDING_SHARE_MAX_AGE * 1000 };
  // Compress the signed review so the template, caption, and provenance fit one cookie.
  const payload = deflateRawSync(JSON.stringify(pending)).toString("base64url");
  const token = `${payload}.${sign(payload).toString("base64url")}`;
  if (token.length > 3800) throw new Error("The selected caption could not be saved for sign-in. Please try another caption.");
  return token;
}

export function readPendingShare(token: string | undefined): PendingShare | null {
  try {
    if (!token || token.length > 3800) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const actual = Buffer.from(signature, "base64url");
    const expected = sign(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const pending = JSON.parse(inflateRawSync(Buffer.from(payload, "base64url"), { maxOutputLength: 20000 }).toString()) as PendingShare;
    if (typeof pending.sampleId !== "string" || pending.sampleId.length > 80 || typeof pending.caption !== "string" || pending.caption.length > 200 || typeof pending.reviewToken !== "string" || pending.reviewToken.length > 16000 || !Number.isFinite(pending.expires) || pending.expires <= Date.now()) return null;
    return pending;
  } catch {
    return null;
  }
}
