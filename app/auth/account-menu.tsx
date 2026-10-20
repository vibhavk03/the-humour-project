"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AuthControls } from "./auth-controls";
import { Avatar } from "@/app/profile/avatar";

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
      <summary ref={summary} aria-label={`Account for ${name}`} className="flex cursor-pointer list-none items-center gap-2 comic-account rounded-full p-1.5 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:pr-3 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink text-sm font-semibold text-ink">
          <Avatar photoUrl={photoUrl} initials={name.charAt(0).toUpperCase()} />
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{name}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="hidden h-4 w-4 text-muted sm:block"><path d="m5 8 5 5 5-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="absolute right-0 z-20 mt-3 w-64 max-w-[calc(100vw-3rem)] comic-panel space-y-4 p-4">
        <div className="space-y-1 border-b border-ink-soft pb-3">
          <p className="text-xs text-muted">Signed in as</p>
          <p className="break-words text-sm font-semibold">{name}</p>
          <p className="break-all text-sm text-muted">{email}</p>
        </div>
        <Link href="/profile" prefetch={false} onClick={() => { if (details.current) details.current.open = false; }} className="comic-button comic-button-secondary w-full">Edit Profile</Link>
        <AuthControls isSignedIn />
      </div>
    </details>
  );
}
