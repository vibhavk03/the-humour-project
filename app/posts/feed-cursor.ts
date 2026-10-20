import { isHomeFeedSort, type HomeFeedSort } from "./feed-sort";
import type { FeedPost } from "./feed-data";

export type FeedCursor = { id: string; createdAt: string; pinnedId: string | null; sort?: HomeFeedSort; score?: number };

export function makeFeedCursor(posts: FeedPost[], pinnedId: string | null = posts.find(post => post.crowdPick)?.id ?? null, sort: HomeFeedSort = "all") {
  const last = posts.at(-1);
  return last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.created_at, pinnedId, ...(sort !== "all" ? { sort } : {}), ...(sort === "top" ? { score: last.rankScore ?? last.score } : {}) })).toString("base64url") : null;
}

export function parseFeedCursor(raw: string | null): FeedCursor | null {
  if (!raw || raw.length > 512 || !/^[\w-]+$/.test(raw)) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Strictly validate values interpolated into PostgREST filters.
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (!value || typeof value.id !== "string" || !uuid.test(value.id) ||
      typeof value.createdAt !== "string" || !timestamp.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) ||
      (value.pinnedId !== null && (typeof value.pinnedId !== "string" || !uuid.test(value.pinnedId)))) return null;
    if (value.sort !== undefined && !isHomeFeedSort(value.sort)) return null;
    if (value.sort === "top" && !Number.isSafeInteger(value.score)) return null;
    return { id: value.id, createdAt: value.createdAt, pinnedId: value.pinnedId, ...(value.sort !== undefined ? { sort: value.sort } : {}), ...(value.sort === "top" ? { score: value.score } : {}) };
  } catch { return null; }
}
