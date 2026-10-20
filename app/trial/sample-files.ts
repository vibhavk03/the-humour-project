import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSample } from "./samples";
import { matchesImageType, validateImage } from "@/app/posts/upload-validation";

export async function readSample(id: unknown) {
  const sample = getSample(id);
  if (!sample) return null;
  const bytes = await readFile(path.join(process.cwd(), "memes", sample.filename));
  if (validateImage({ size: bytes.length, type: sample.mimeType }) || !matchesImageType(bytes, sample.mimeType)) {
    throw new Error(`Invalid sample asset: ${sample.id}`);
  }
  return { sample, bytes };
}
