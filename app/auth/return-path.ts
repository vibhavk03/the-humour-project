// Only accept the trial or feed post anchors; never redirect to arbitrary URLs.
export function getFeedReturnPath(value: unknown): string {
  if (value === "/try" || value === "/generate") return value;
  return typeof value === "string" && /^\/(?:\?page=[1-9]\d{0,4})?#post-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : "/";
}
