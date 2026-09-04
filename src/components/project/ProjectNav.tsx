"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type ProjectTab = {
  segment: string;
  label: string;
};

const projectTabs: ProjectTab[] = [
  { segment: "", label: "Dashboard" },
  { segment: "characters", label: "Characters" },
  { segment: "locations", label: "Locations" },
  { segment: "storyboard", label: "Storyboard" },
  { segment: "render", label: "Render" },
  { segment: "finishing", label: "Finishing" },
  { segment: "export", label: "Export" },
  { segment: "settings", label: "Project Settings" },
];

export function ProjectNav({ projectId }: { projectId?: string | null }) {
  const pathname = usePathname();
  const base = projectId ? `/projects/${projectId}` : null;

  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      <Link
        href="/"
        className={cn(
          "rounded-md px-3 py-1.5 text-sm transition",
          pathname === "/"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-neutral-900 hover:text-foreground"
        )}
      >
        Projects
      </Link>
      {projectTabs.map((tab) => {
        if (!base) {
          return (
            <span
              key={tab.segment || "dashboard"}
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-muted-foreground/40"
              title="Open or create a project first"
            >
              {tab.label}
            </span>
          );
        }

        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active =
          tab.segment === ""
            ? pathname === base
            : pathname.startsWith(`${base}/${tab.segment}`);

        return (
          <Link
            key={tab.segment || "dashboard"}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-neutral-900 hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
