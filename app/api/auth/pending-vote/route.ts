import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import { createPendingVote, PENDING_VOTE_COOKIE, PENDING_VOTE_MAX_AGE } from "@/app/auth/pending-vote";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Start sign-in from this website." }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid vote." }, { status: 400 }); }
  if (typeof body?.postId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.postId) || (body.vote !== 1 && body.vote !== -1) || typeof body.returnTo !== "string") {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }
  try {
    const supabase = createClient(await cookies());
    const { data: post, error } = await supabase.from("home_feed").select("id").eq("id", body.postId).maybeSingle();
    if (error) throw new Error();
    if (!post) return NextResponse.json({ error: "This post is no longer available." }, { status: 404 });
    const { id, token } = createPendingVote(body.postId, body.vote, body.returnTo);
    const response = NextResponse.json({ intentId: id });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(PENDING_VOTE_COOKIE, token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: PENDING_VOTE_MAX_AGE });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not prepare your vote. Please try again." }, { status: 503 });
  }
}
