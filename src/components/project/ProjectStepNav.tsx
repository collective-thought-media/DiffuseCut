"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const FLOW = [
  { segment: "", label: "Dashboard" },
  { segment: "characters", label: "Characters" },
  { segment: "locations", label: "Locations" },
  { segment: "storyboard", label: "Storyboard" },
  { segment: "render", label: "Render" },
  { segment: "export", label: "Export" },
] as const;

export function ProjectStepNav({
  projectId,
  currentSegment,
}: {
  projectId: string;
  /** Empty string for the project dashboard. */
  currentSegment: string;
}) {
  const index = FLOW.findIndex((step) => step.segment === currentSegment);
  if (index === -1) return null;

  const prev = index > 0 ? FLOW[index - 1] : null;
  const next = index < FLOW.length - 1 ? FLOW[index + 1] : null;
  const base = `/projects/${projectId}`;

  function hrefFor(segment: string) {
    return segment ? `${base}/${segment}` : base;
  }

  if (!prev && !next) return null;

  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        {prev ? (
          <Link href={hrefFor(prev.segment)}>
            <Button type="button" variant="outline">
              Previous
            </Button>
          </Link>
        ) : null}
      </div>
      <div>
        {next ? (
          <Link href={hrefFor(next.segment)}>
            <Button type="button">Next</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
