import { cookies } from "next/headers";
import sharp from "sharp";
import { createClient } from "@/app/supabase/server";
import { avatarVersion } from "@/app/profile/account-data";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unavailable = (status: number) => new Response("Photo unavailable", { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return unavailable(400);
  try {
    const supabase = createClient(await cookies());
    // Keep the same visibility boundary as the author popup, including for guests.
    const { data: author, error } = await supabase.from("author_profiles")
      .select("photo_url").eq("id", id).maybeSingle<{ photo_url: string | null }>();
    if (error) return unavailable(503);
    const path = author?.photo_url;
    if (!path?.startsWith(`${id}/`) || path.split("/").includes("..") || new URL(request.url).searchParams.get("v") !== avatarVersion(path)) return unavailable(404);
    const { data, error: downloadError } = await supabase.storage.from("photos").download(path);
    if (!data || downloadError) return unavailable(503);
    const photo = await sharp(Buffer.from(await data.arrayBuffer()), { animated: false })
      .rotate().resize(192, 192, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    return new Response(new Uint8Array(photo), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, max-age=300",
      "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return unavailable(503); }
}
