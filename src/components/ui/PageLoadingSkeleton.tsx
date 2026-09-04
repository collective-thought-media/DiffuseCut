export function PageLoadingSkeleton() {
  return (
    <div className="ui-fade-in space-y-8">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-900" />
        <div className="h-8 w-56 animate-pulse rounded-md bg-neutral-900" />
      </div>
      <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="h-6 w-44 animate-pulse rounded bg-neutral-800" />
        <div className="h-9 animate-pulse rounded-md bg-neutral-950" />
        <div className="h-28 animate-pulse rounded-md bg-neutral-950" />
      </div>
    </div>
  );
}
