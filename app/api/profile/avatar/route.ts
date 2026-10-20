import { cookies } from "next/headers";
import sharp from "sharp";
import { createClient } from "@/app/supabase/server";
import { avatarVersion } from "@/app/profile/account-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  const url = new URL(request.url);
  const unavailable = (status: number) => new Response("Avatar unavailable", { status, headers: { "Cache-Control": "no-store" } });
  if (!user) return unavailable(401);
  // Include account identity in the URL so a browser cache cannot mix accounts.
  if (url.searchParams.get("user") !== user.id) return unavailable(404);
  const { data: profile, error } = await supabase.from("profiles").select("photo_url")
    .eq("id", user.id).maybeSingle<{ photo_url: string | null }>();
  if (error) return unavailable(503);
  const path = profile?.photo_url;
  if (!path?.startsWith(`${user.id}/`) || url.searchParams.get("v") !== avatarVersion(path)) return unavailable(404);
  try {
    const { data, error } = await supabase.storage.from("photos").download(path);
    if (!data || error) return unavailable(503);
    const thumbnail = await sharp(Buffer.from(await data.arrayBuffer()), { animated: false })
      .rotate().resize(128, 128, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
    return new Response(new Uint8Array(thumbnail), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600",
      "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return unavailable(503);
  }
}
