export function PageIntro({ title, eyebrow, children, compact = false }: { title: string; eyebrow: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`comic-intro ${compact ? "comic-intro-compact" : ""}`}>
      <p className="comic-eyebrow">{eyebrow}</p>
      <h1 className="comic-heading comic-title">{title}</h1>
      <p className="max-w-xl text-base leading-7 text-muted">{children}</p>
    </div>
  );
}
