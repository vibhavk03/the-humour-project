"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="comic-panel comic-nav">
      {[{ href: "/", label: "Home Feed" }, { href: "/your-posts", label: "Your Posts" }, { href: "/generate", label: "Generate" }].map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={pathname === href ? "page" : undefined}
          className={`comic-tab ${href === "/generate" ? "comic-tab-create" : ""}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
