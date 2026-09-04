"use client";

import { cn } from "@/lib/utils";

export function GenerationErrorAlert({
  message,
  onDismiss,
  className,
}: {
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-red-900/60 bg-red-950/50 p-3 text-sm text-red-300",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 whitespace-pre-wrap">{message}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs text-red-400 underline-offset-2 hover:text-red-200 hover:underline"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
