"use client";

import { cn } from "@/lib/utils";

export function AsyncRefreshOverlay({
  active,
  message = "Updating…",
  className,
}: {
  active: boolean;
  message?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden={!active}
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/35 backdrop-blur-[1px] transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      <div className="relative flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/95 px-4 py-2.5 text-sm text-foreground shadow-lg backdrop-blur-sm">
        <span className="ui-spinner shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}
