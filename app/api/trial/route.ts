import { SAMPLE_TRY_LIMITS_ENABLED } from "@/app/trial/settings";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import { createReview } from "@/app/posts/caption-review";
import { CaptionError, generateCaption } from "@/app/posts/generate-caption";
import { getTrialSelection, publishTrialSelection, TrialPublishError } from "@/app/trial/publish-sample";
import { createPendingShare, PENDING_SHARE_COOKIE, PENDING_SHARE_MAX_AGE } from "@/app/trial/pending-share";
import { getSample } from "@/app/trial/samples";
import { readSample } from "@/app/trial/sample-files";
import { GUEST_COOKIE, createGuestSession, guestQuotaKey, readGuestSession } from "@/app/trial/guest-session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Open the trial on this website to continue." }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Caption generation is not configured yet." }, { status: 503 });
  }
  let body: { action?: unknown; sampleId?: unknown; previousCaptions?: unknown; caption?: unknown; reviewToken?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 20000) throw new Error();
    const raw = await request.text();
    if (raw.length > 20000) throw new Error();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Send a valid sample selection." }, { status: 400 });
  }
  if (!getSample(body.sampleId) || (body.action !== "generate" && body.action !== "publish" && body.action !== "prepare-share")) {
    return NextResponse.json({ error: "Choose a sample from the gallery." }, { status: 400 });
  }
  const previous = body.previousCaptions ?? [];
  if (!Array.isArray(previous) || previous.length > 60 || previous.some(value => typeof value !== "string" || value.length > 200)) {
    return NextResponse.json({ error: "Previous captions must be a list of short captions." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  let guestId = readGuestSession(cookieStore.get(GUEST_COOKIE)?.value);
  // Publishing requires the same guest cookie that created the signed review.
  if (!guestId && body.action !== "generate") {
    return NextResponse.json({ error: "Your trial expired. Choose a sample and generate captions again." }, { status: 400 });
  }
  const session = guestId ? null : createGuestSession();
  guestId ??= session!.id;
  function reply(data: Record<string, unknown>, status = 200, headers?: HeadersInit) {
    const response = NextResponse.json(data, { status, headers });
    response.headers.set("Cache-Control", "no-store");
    if (session) response.cookies.set(GUEST_COOKIE, session.token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: session.maxAge,
    });
    return response;
  }

  try {
    const asset = await readSample(body.sampleId);
    if (!asset) return reply({ error: "This sample is no longer available." }, 404);
    const { sample, bytes } = asset;
    const context = sample.description;

    if (body.action === "generate") {
      let remaining: number | null = null;
      if (SAMPLE_TRY_LIMITS_ENABLED) {
        const { data: quota, error: quotaError } = await supabase.rpc("reserve_guest_trial", { guest_key: guestQuotaKey(guestId) })
          .single<{ allowed: boolean; reason: string; remaining: number }>();
        if (quotaError || !quota) {
          console.error("Guest trial budget unavailable:", quotaError?.code);
          return reply({ error: "The sample trial is temporarily unavailable. Please try again later.", code: "trial_unavailable" }, 503);
        }
        if (!quota.allowed) {
          const reset = new Date();
          reset.setUTCHours(24, 0, 0, 0);
          const retryAfterSeconds = Math.ceil((reset.getTime() - Date.now()) / 1000);
          return reply({
            error: quota.reason === "session_limit"
              ? "You’ve used today’s sample tries. Your captions are still here to share, or sign in to create with your own photo."
              : "Today’s sample tries have all been used. Come back tomorrow, or sign in to create with your own photo.",
            code: quota.reason, retryAfterSeconds,
          }, 429, { "Retry-After": String(retryAfterSeconds) });
        }
        remaining = quota.remaining;
      }
      const generated = await generateCaption(bytes, sample.mimeType, context, previous);
      return reply({
        captions: generated.captions,
        reviewToken: createReview(generated, `guest:${guestId}`, bytes, sample.mimeType, context),
        remaining,
      });
    }

    const selection = await getTrialSelection(guestId, body.sampleId, body.caption, body.reviewToken);
    if (body.action === "prepare-share") {
      const response = reply({ message: "Your selected meme is ready to preview." });
      response.cookies.set(PENDING_SHARE_COOKIE, createPendingShare(selection.sample.id, selection.caption, selection.reviewToken), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: PENDING_SHARE_MAX_AGE,
      });
      return response;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return reply({ error: "Sign in to share your meme." }, 401);
    const postId = await publishTrialSelection(supabase, user.id, selection);
    const response = reply({ message: "Your meme is now on the community feed.", postId }, 201);
    response.cookies.delete(PENDING_SHARE_COOKIE);
    return response;
  } catch (error) {
    if (error instanceof TrialPublishError) return reply({ error: error.message }, error.status);
    if (error instanceof CaptionError) {
      return reply({ error: error.message, code: error.code, retryAfterSeconds: error.retryAfterSeconds }, error.status,
        error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined);
    }
    console.error("Sample trial failed:", error instanceof Error ? error.name : "Unknown error");
    return reply({ error: "Something went wrong with this sample. Please try again." }, 500);
  }
}
