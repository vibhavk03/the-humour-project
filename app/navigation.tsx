"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation({ embedded = false, showCreate = true }: { embedded?: boolean; showCreate?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className={embedded ? "flex flex-wrap items-center gap-2 border-t border-ink/15 pt-4" : "comic-panel comic-nav"}>
      {[{ href: "/", label: "Home Feed" }, { href: "/your-posts", label: "Your Posts" }, ...(showCreate ? [{ href: "/generate", label: "Generate" }] : [])].map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={pathname === href ? "page" : undefined}
          className={embedded ? `rounded-sm border-2 border-ink px-3 py-2 text-sm font-bold text-ink transition-colors focus-visible:outline-offset-4 ${pathname === href ? "bg-pink shadow-[2px_2px_0_#660033] hover:bg-pink" : "bg-paper hover:bg-pink-light"}` : `comic-tab ${href === "/generate" ? "comic-tab-create" : ""}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
