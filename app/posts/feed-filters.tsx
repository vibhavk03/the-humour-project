import Link from "next/link";

import { HOME_FEED_FILTERS, homeFeedHref, type HomeFeedSort } from "./feed-sort";
export { homeFeedHref, type HomeFeedSort } from "./feed-sort";

export function FeedFilters({ sort, signedIn }: { sort: HomeFeedSort; signedIn: boolean }) {
  return <div className="space-y-2">
    <nav aria-label="Filter community feed" className="flex flex-wrap gap-2">
      {HOME_FEED_FILTERS.filter(filter => signedIn || filter.value !== "unrated").map(filter => {
        const className = `rounded-full border-2 border-ink px-4 py-2 text-xs font-bold text-ink transition-colors ${sort === filter.value ? "bg-pink" : "bg-paper hover:bg-pink-light"}`;
        return <Link key={filter.value} href={homeFeedHref(filter.value)} prefetch={false} scroll={false} aria-current={sort === filter.value ? "page" : undefined} className={className}>{filter.label}</Link>;
      })}
    </nav>
  </div>;
}
