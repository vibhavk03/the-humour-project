import { cookies } from "next/headers";
import { createClient } from "@/app/supabase/server";

type AuthorRow = { first_name: string | null; last_name: string | null; photo_url: string | null };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid author." }, { status: 400, headers });
  }
  const supabase = createClient(await cookies());
  const { data: author, error } = await supabase.from("author_profiles")
    .select("first_name, last_name, photo_url").eq("id", id).maybeSingle<AuthorRow>();
  if (error) {
    console.error("Author profile unavailable:", error.code);
    return Response.json({ error: "Profile details are unavailable right now." }, { status: 503, headers });
  }
  if (!author) return Response.json({ error: "This profile is no longer available." }, { status: 404, headers });
  const name = [author.first_name?.trim(), author.last_name?.trim()].filter(Boolean).join(" ") || "Campus contributor";
  let photoUrl: string | null = null;
  if (author.photo_url?.startsWith(`${id}/`) && !author.photo_url.split("/").includes("..")) {
    const { data, error: photoError } = await supabase.storage.from("photos").createSignedUrl(author.photo_url, 60 * 60);
    if (photoError) console.error("Author photo unavailable:", photoError.name);
    photoUrl = data?.signedUrl ?? null;
  }
  return Response.json({ name, photoUrl }, { headers });
}
