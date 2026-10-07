import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";
import type { HeartStats } from "@/app/posts/heart-data";

type Context = { params: Promise<{ id: string }> };

async function setHeart(context: Context, hearted: boolean) {
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to heart a post." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  }
  const { data: post, error: postError } = await supabase.from("home_feed")
    .select("id").eq("id", id).maybeSingle();
  if (postError) {
    return NextResponse.json({ error: "This post could not be loaded. Please try again." }, { status: 500 });
  }
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const result = hearted
    ? await supabase.from("post_hearts").upsert({ post_id: id, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : await supabase.from("post_hearts").delete().eq("post_id", id).eq("user_id", user.id);
  if (result.error) {
    console.error("Post heart update failed:", result.error.code);
    return NextResponse.json({ error: "Your heart could not be saved. Please try again." }, { status: 500 });
  }
  revalidatePath("/");
  revalidatePath("/your-posts");
  const { data: stats, error: statsError } = await supabase.rpc("get_post_hearts", { post_ids: [id] }).single<HeartStats>();
  if (statsError || !stats) {
    return NextResponse.json({ error: "Your heart changed, but the count could not be refreshed. Please reload the feed." }, { status: 500 });
  }
  return NextResponse.json({ hearted: stats.hearted, count: stats.heart_count });
}

export async function PUT(_request: Request, context: Context) {
  return setHeart(context, true);
}

export async function DELETE(_request: Request, context: Context) {
  return setHeart(context, false);
}
