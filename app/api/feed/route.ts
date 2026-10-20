import { cookies } from "next/headers";
import { createClient } from "@/app/supabase/server";
import { getNextFeed } from "@/app/posts/feed-data";
import { makeFeedCursor, parseFeedCursor } from "@/app/posts/feed-cursor";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope");
  const cursor = parseFeedCursor(params.get("cursor"));
  const headers = { "Cache-Control": "private, no-store" };
  if ((scope !== "home" && scope !== "personal") || !cursor) {
    return Response.json({ error: "Invalid feed request." }, { status: 400, headers });
  }
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (scope === "personal" && (authError || !user)) {
    return Response.json({ error: "Sign in to see your posts." }, { status: 401, headers });
  }
  const result = await getNextFeed(supabase, cursor, scope === "personal" ? user!.id : undefined);
  if (result.error) return Response.json({ error: "Posts could not be loaded. Please try again." }, { status: 503, headers });
  return Response.json({ posts: result.posts, nextCursor: result.hasNext ? makeFeedCursor(result.posts, cursor.pinnedId) : null }, { headers });
}
