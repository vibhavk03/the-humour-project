"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AuthControls } from "./auth-controls";

export function AccountMenu({ name, email, photoUrl }: { name: string; email: string; photoUrl: string | null }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  useEffect(() => {
    function outsideClick(event: PointerEvent) {
      if (details.current && !details.current.contains(event.target as Node)) details.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current?.open) {
        details.current.open = false;
        summary.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outsideClick);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outsideClick);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details ref={details} className="relative shrink-0">
      <summary ref={summary} aria-label={`Account for ${name}`} className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-200 p-1.5 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-950 sm:pr-3 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{name}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="hidden h-4 w-4 text-zinc-500 sm:block"><path d="m5 8 5 5 5-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="absolute right-0 z-20 mt-3 w-64 max-w-[calc(100vw-3rem)] space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
        <div className="space-y-1 border-b border-zinc-100 pb-3">
          <p className="text-xs text-zinc-500">Signed in as</p>
          <p className="break-words text-sm font-semibold">{name}</p>
          <p className="break-all text-sm text-zinc-500">{email}</p>
        </div>
        <Link href="/profile" prefetch={false} onClick={() => { if (details.current) details.current.open = false; }} className="block rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50">Edit Profile</Link>
        <AuthControls isSignedIn />
      </div>
    </details>
  );
}
