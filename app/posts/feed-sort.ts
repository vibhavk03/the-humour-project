export const HOME_FEED_FILTERS = [
  { value: "all", label: "All" },
  { value: "newest", label: "Newest first" },
  { value: "top", label: "Top voted" },
  { value: "unrated", label: "Not rated" },
] as const;
export type HomeFeedSort = typeof HOME_FEED_FILTERS[number]["value"];
export function isHomeFeedSort(value: unknown): value is HomeFeedSort {
  return HOME_FEED_FILTERS.some(filter => filter.value === value);
}
export function homeFeedHref(sort: HomeFeedSort) {
  return sort === "all" ? "/#community-feed" : `/?sort=${sort}#community-feed`;
}

