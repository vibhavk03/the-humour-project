import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CAPTIONS_PER_REQUEST, MAX_CAPTIONS_PER_PICTURE, PICTURE_CAPTION_LIMIT_MESSAGE } from "./caption-limits";

type CaptionRun = { owner: string; picture: string; generated: number; expires: number };
export class CaptionRunError extends Error {
  constructor(message: string, public status: number, public remainingCaptions?: number) { super(message); }
}
function sign(payload: string) {
  const secret = process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Caption generation is not configured.");
  return createHmac("sha256", secret).update(`caption-run:${payload}`).digest();
}

// A new selection has no continuation token and starts a fresh 30-caption run.
export function prepareCaptionRun(token: unknown, owner: string, bytes: Uint8Array, mimeType: string) {
  const picture = createHash("sha256").update(mimeType).update(bytes).digest("hex");
  let run: CaptionRun = { owner, picture, generated: 0, expires: Date.now() + 24 * 60 * 60 * 1000 };
  if (token !== undefined && token !== null && token !== "") {
    try {
      if (typeof token !== "string" || token.length > 2000) throw new Error();
      const [payload, signature, extra] = token.split(".");
      if (!payload || !signature || extra) throw new Error();
      const actual = Buffer.from(signature, "base64url"), expected = sign(payload);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as CaptionRun;
      if (parsed.owner !== owner || parsed.picture !== picture || !Number.isFinite(parsed.expires) || parsed.expires <= Date.now() ||
        !Number.isInteger(parsed.generated) || parsed.generated < 0 || parsed.generated > MAX_CAPTIONS_PER_PICTURE || parsed.generated % CAPTIONS_PER_REQUEST !== 0) throw new Error();
      run = parsed;
    } catch { throw new CaptionRunError("This caption session expired. Select your picture again to start a fresh session.", 400); }
  }
  if (run.generated + CAPTIONS_PER_REQUEST > MAX_CAPTIONS_PER_PICTURE) throw new CaptionRunError(PICTURE_CAPTION_LIMIT_MESSAGE, 429, 0);
  return {
    finish() {
      const next = { ...run, generated: run.generated + CAPTIONS_PER_REQUEST };
      const payload = Buffer.from(JSON.stringify(next)).toString("base64url");
      return { generationToken: `${payload}.${sign(payload).toString("base64url")}`, remainingCaptions: MAX_CAPTIONS_PER_PICTURE - next.generated };
    },
  };
}
