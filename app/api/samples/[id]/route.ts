import sharp from "sharp";
import { readSample } from "@/app/trial/sample-files";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const asset = await readSample((await params).id);
    if (!asset) return new Response("Sample not found", { status: 404 });
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    const bytes = preview
      ? await sharp(asset.bytes, { page: 0, pages: 1, limitInputPixels: 40_000_000 })
        .resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
      : asset.bytes;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": preview ? "image/webp" : asset.sample.mimeType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Sample could not be loaded", { status: 500 });
  }
}
