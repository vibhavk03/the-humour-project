// Only accept the feed page and UUID post anchors; never redirect to arbitrary URLs.
export function getFeedReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/(?:\?page=[1-9]\d{0,4})?#post-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : "/";
}
