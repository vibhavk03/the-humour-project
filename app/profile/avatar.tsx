"use client";

import { useState } from "react";

function AvatarImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={128} height={128} ref={image => { if (image?.complete && image.naturalWidth > 0) setLoaded(true); }} onLoad={() => setLoaded(true)} onError={() => setLoaded(false)}
      className={`absolute inset-0 h-full w-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`} />
  );
}

export function Avatar({ photoUrl, initials }: { photoUrl: string | null; initials: string }) {
  return <span className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
    <span>{initials}</span>
    {photoUrl ? <AvatarImage key={photoUrl} src={photoUrl} /> : null}
  </span>;
}
