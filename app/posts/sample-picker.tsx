"use client";

import { useState } from "react";
import { SAMPLES } from "@/app/trial/samples";

const PAGE_SIZE = 8;

export function SamplePicker({ selectedId, onSelect, disabled = false }: { selectedId: string | null; onSelect: (id: string) => void; disabled?: boolean }) {
  const [filter, setFilter] = useState<"all" | "images" | "gifs">("all");
  const [page, setPage] = useState(1);
  const filtered = SAMPLES.filter(sample => filter === "all" || (sample.mimeType === "image/gif") === (filter === "gifs"));
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  return (
    <section aria-label="Meme templates" className="space-y-4">
      <div role="group" aria-label="Filter templates" className="flex flex-wrap gap-2">
        {([['all', 'All'], ['images', 'Images'], ['gifs', 'GIFs']] as const).map(([value, label]) => (
          <button key={value} type="button" disabled={disabled} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }} className="comic-reaction cursor-pointer rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50">{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(sample => (
          <button key={sample.id} type="button" disabled={disabled} aria-pressed={selectedId === sample.id} onClick={() => onSelect(sample.id)} className={`cursor-pointer overflow-hidden rounded-sm border-2 border-ink text-left transition-colors hover:bg-pink-light focus-visible:bg-pink-light disabled:cursor-wait ${selectedId === sample.id ? 'bg-pink-light shadow-[3px_3px_0_#660033]' : 'bg-card'}`}>
            <div className="relative border-b-2 border-ink bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/samples/${sample.id}${sample.mimeType === "image/gif" ? "" : "?preview=1"}`} alt={sample.description} loading="lazy" className="h-28 w-full object-contain" />
              {sample.mimeType === "image/gif" ? <span className="comic-stamp absolute right-1 top-1">GIF</span> : null}
            </div>
            <span className="flex min-h-12 items-center justify-between gap-2 p-2 text-xs font-bold"><span>{sample.label}</span>{selectedId === sample.id ? <span aria-label="Selected">✓</span> : null}</span>
          </button>
        ))}
      </div>
      <nav aria-label="Template gallery pages" className="flex items-center justify-between gap-3 text-xs">
        <button type="button" disabled={disabled || page === 1} onClick={() => setPage(current => current - 1)} className="comic-button comic-button-secondary">Previous</button>
        <span aria-live="polite">{page} / {pageCount}</span>
        <button type="button" disabled={disabled || page === pageCount} onClick={() => setPage(current => current + 1)} className="comic-button comic-button-secondary">Next</button>
      </nav>
    </section>
  );
}
