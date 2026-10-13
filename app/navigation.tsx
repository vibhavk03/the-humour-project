"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
      {[{ href: "/", label: "Home Feed" }, { href: "/your-posts", label: "Your Posts" }, { href: "/generate", label: "Generate" }].map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={pathname === href ? "page" : undefined}
          className={`flex-1 rounded-md px-3 py-3 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 ${pathname === href ? "bg-zinc-950 text-white" : href === "/generate" ? "bg-sky-50 text-sky-900 hover:bg-sky-100" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
