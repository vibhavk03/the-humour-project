export function HeaderWidth({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 py-4">
      {children}
    </div>
  );
}
