"use client";

import { useEffect, useId, useRef, useState } from "react";
import { loadAuthorProfile, type AuthorProfile } from "./author-profile-data";

export function AuthorProfilePopover({ authorId, authorName }: { authorId: string; authorName: string | null }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const pending = useRef(false);
  const suppressFocusOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const name = profile?.name || authorName || "Campus contributor";
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  function cancelTimers() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  function close() {
    cancelTimers();
    panel.current?.hidePopover();
  }

  async function fetchProfile() {
    if (pending.current || profile) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await loadAuthorProfile(authorId);
      if (alive.current) { setProfile(result); setPhotoFailed(false); }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : "Profile details are unavailable right now.");
    } finally {
      pending.current = false;
      if (alive.current) setLoading(false);
    }
  }

  function show() {
    cancelTimers();
    const bounds = button.current?.getBoundingClientRect();
    if (!bounds || !panel.current) return;
    const width = Math.min(288, window.innerWidth - 24);
    // Keep the card inside the viewport, including near the last grid column.
    const height = Math.min(320, window.innerHeight - 24);
    setPosition({
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - height - 12)),
    });
    panel.current.showPopover();
    void fetchProfile();
  }

  function scheduleClose() {
    cancelTimers();
    // Leave enough time to move from the name into the popover.
    closeTimer.current = setTimeout(() => {
      if (!panel.current?.contains(document.activeElement) && document.activeElement !== button.current) close();
    }, 220);
  }

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelTimers(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => panel.current?.hidePopover();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return (
    <div className="min-w-0 text-sm font-bold">
      <span>By </span>
      <button ref={button} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        onPointerEnter={event => { if (event.pointerType !== "touch") { suppressFocusOpen.current = false; cancelTimers(); hoverTimer.current = setTimeout(show, 150); } }}
        onPointerLeave={scheduleClose} onFocus={event => { if (!suppressFocusOpen.current && !panel.current?.contains(event.relatedTarget)) show(); }}
        onBlur={event => { if (!panel.current?.contains(event.relatedTarget)) { suppressFocusOpen.current = false; scheduleClose(); } }}
        onClick={() => { suppressFocusOpen.current = false; show(); }}
        className="cursor-pointer break-words rounded-sm text-left underline decoration-ink/30 underline-offset-4 transition-colors hover:bg-pink-light hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
      >{authorName || "Campus contributor"}</button>
      <div ref={panel} id={id} popover="auto" role="dialog" aria-label={`About ${name}`}
        onBeforeToggle={event => {
          if (event.newState === "closed") { suppressFocusOpen.current = true; cancelTimers(); }
        }}
        onToggle={event => setOpen(event.currentTarget.matches(":popover-open"))}
        onPointerEnter={cancelTimers} onPointerLeave={scheduleClose}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== button.current) scheduleClose(); }}
        style={position}
        className="comic-panel fixed m-0 max-h-[calc(100svh-1.5rem)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto bg-green-light p-5 text-ink"
      >
        <button type="button" aria-label="Close profile" onClick={() => {
          // Mobile browsers may restore focus with relatedTarget=null. Do not
          // interpret that programmatic focus as a new request to open.
          suppressFocusOpen.current = true;
          close();
          button.current?.focus({ preventScroll: true });
        }}
          className="absolute right-1 top-1 z-10 flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-sm text-xl hover:bg-pink-light focus-visible:outline-2 focus-visible:outline-ink">×</button>
        <div className="flex flex-col items-center gap-3 pt-4 text-center">
          {profile?.photoUrl && !photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photoUrl} alt={`${name}’s profile photo`} width={96} height={96} onError={() => setPhotoFailed(true)} className="h-24 w-24 rounded-full border-2 border-ink bg-pink-light object-cover" />
          ) : <div aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-ink bg-pink-light text-3xl font-bold">{initials}</div>}
          <h3 className="w-full break-words text-lg font-bold">{name}</h3>
          {loading ? <p role="status" className="text-xs font-normal text-muted">Loading profile…</p> : null}
          {profile && (!profile.photoUrl || photoFailed) ? <p className="text-xs font-normal text-muted">{photoFailed ? "Profile photo unavailable." : null}</p> : null}
          {error ? <div className="space-y-2 text-xs font-normal"><p role="alert">{error}</p><button type="button" onClick={() => void fetchProfile()} className="cursor-pointer rounded-sm px-2 py-1 font-bold underline hover:bg-pink-light">Try again</button></div> : null}
        </div>
      </div>
    </div>
  );
}
