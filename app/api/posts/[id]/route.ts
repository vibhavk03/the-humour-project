import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/app/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createClient(await cookies());
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to delete your post." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid post." }, { status: 400 });
  }

  // Both the explicit owner filter and posts RLS restrict deletion to the author.
  const { data: post, error } = await supabase.from("posts")
    .delete().eq("id", id).eq("user_id", user.id)
    .select("id, image_path").maybeSingle();
  if (error) {
    console.error("Post deletion failed:", error.code);
    return NextResponse.json({ error: "Your post could not be deleted. Please try again." }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "Post not found or you do not own it." }, { status: 404 });
  }

  // Delete the row first so a storage failure never leaves a broken public post.
  // Related votes are removed by the database's ON DELETE CASCADE constraint.
  try {
    const { error: cleanupError } = await supabase.storage.from("post-images").remove([post.image_path]);
    if (cleanupError) console.error("Deleted post image cleanup failed:", cleanupError.name);
  } catch {
    console.error("Deleted post image cleanup could not reach storage.");
  }
  revalidatePath("/");
  revalidatePath("/your-posts");
  return NextResponse.json({ message: "Your post was deleted." });
}
