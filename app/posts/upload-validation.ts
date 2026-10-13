export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CONTEXT_LENGTH = 1000;
export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const ACCEPTED_IMAGE_TYPES = Object.keys(IMAGE_EXTENSIONS).join(",");

export function validateImage(file: { size: number; type: string }) {
  if (!file.size) return "Choose an image to upload.";
  if (!Object.hasOwn(IMAGE_EXTENSIONS, file.type)) {
    return "Image must be a PNG, JPG, WEBP, or GIF file.";
  }
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 5 MB or smaller.";
  return "";
}

export function matchesImageType(bytes: Uint8Array, type: string) {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));

  switch (type) {
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(text(0, 6));
    case "image/webp":
      return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
    default:
      return false;
  }
}
