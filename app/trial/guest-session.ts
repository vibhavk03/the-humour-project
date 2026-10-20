import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export const GUEST_COOKIE = "humour_guest_trial";
const LIFETIME = 24 * 60 * 60;
function sign(payload: string) {
  const secret = process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Caption generation is not configured.");
  return createHmac("sha256", secret).update(`guest-trial:${payload}`).digest();
}

export function readGuestSession(token: string | undefined): string | null {
  try {
    const [payload, signature, extra] = (token ?? "").split(".");
    if (!payload || !signature || extra) return null;
    const actual = Buffer.from(signature, "base64url");
    const expected = sign(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.id === "string" && /^[0-9a-f-]{36}$/.test(data.id) && data.expires > Date.now() ? data.id : null;
  } catch {
    return null;
  }
}

export function createGuestSession() {
  const id = randomUUID();
  const payload = Buffer.from(JSON.stringify({ id, expires: Date.now() + LIFETIME * 1000 })).toString("base64url");
  return { id, token: `${payload}.${sign(payload).toString("base64url")}`, maxAge: LIFETIME };
}

export function guestQuotaKey(id: string) {
  return sign(`quota:${id}`).toString("hex");
}
