import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { generateCaption } from "./generate-caption";

type Review = Awaited<ReturnType<typeof generateCaption>> & {
  userId: string;
  imageHash: string;
  context: string;
  expires: number;
};

function signature(payload: string) {
  const secret = process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("Caption generation is not configured.");
  return createHmac("sha256", secret).update(payload).digest();
}

function imageHash(bytes: Uint8Array, mimeType: string) {
  return createHash("sha256").update(mimeType).update(bytes).digest("hex");
}

export function createReview(generated: Awaited<ReturnType<typeof generateCaption>>, userId: string, bytes: Uint8Array, mimeType: string, context: string) {
  const review: Review = { ...generated, userId, imageHash: imageHash(bytes, mimeType), context, expires: Date.now() + 24 * 60 * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(review)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyReview(token: string, userId: string, bytes: Uint8Array, mimeType: string, context: string): Review | null {
  try {
    const [payload, encodedSignature, extra] = token.split(".");
    if (!payload || !encodedSignature || extra) return null;
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const review = JSON.parse(Buffer.from(payload, "base64url").toString()) as Review;
    if (review.userId !== userId || review.expires <= Date.now() || review.context !== context || review.imageHash !== imageHash(bytes, mimeType)) return null;
    return review;
  } catch {
    return null;
  }
}
