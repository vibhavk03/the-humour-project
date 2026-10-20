import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import type { Vote, VoteStats } from "@/app/posts/vote-data";

type Context = { params: Promise<{ id: string }> };

async function setVote(request: Request, context: Context, remove: boolean) {
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to vote on a post." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  }
  let vote: Vote = 0;
  if (!remove) {
    try {
      const body = await request.json();
      if (body?.vote !== 1 && body?.vote !== -1) throw new Error();
      vote = body.vote;
    } catch {
      return NextResponse.json({ error: "Choose an upvote (1) or downvote (-1)." }, { status: 400 });
    }
  }
  const { data: post, error: postError } = await supabase.from("home_feed").select("id").eq("id", id).maybeSingle();
  if (postError) return NextResponse.json({ error: "This post could not be loaded. Please try again." }, { status: 500 });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  // Retain the existing table so historical likes become +1 votes in place.
  const result = remove
    ? await supabase.from("post_hearts").delete().eq("post_id", id).eq("user_id", user.id)
    : await supabase.from("post_hearts").upsert({ post_id: id, user_id: user.id, vote }, { onConflict: "post_id,user_id" });
  if (result.error) {
    console.error("Post vote update failed:", result.error.code);
    return NextResponse.json({ error: "Your vote could not be saved. Please try again." }, { status: 500 });
  }
  revalidatePath("/");
  revalidatePath("/your-posts");
  const { data: stats, error } = await supabase.rpc("get_post_votes", { post_ids: [id] }).single<VoteStats>();
  if (error || !stats) return NextResponse.json({ error: "Your vote was saved, but the score could not be refreshed. Please reload the feed." }, { status: 500 });
  return NextResponse.json({ vote: Number(stats.user_vote), score: Number(stats.score) });
}

export async function PUT(request: Request, context: Context) { return setVote(request, context, false); }
export async function DELETE(request: Request, context: Context) { return setVote(request, context, true); }
