"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  return (
    <header className="border-b border-zinc-200 bg-white px-6 text-zinc-950">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-4 py-4">
        <Link href="/" className="text-sm font-semibold">The Humour Project</Link>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
          {[{ href: "/", label: "Home Feed" }, { href: "/your-posts", label: "Your Posts" }, { href: "/generate", label: "Generate" }].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={pathname === href ? "page" : undefined}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${pathname === href ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
