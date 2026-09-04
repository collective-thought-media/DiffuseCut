"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProjectNav } from "@/components/project/ProjectNav";

const LAST_PROJECT_KEY = "diffusecut-last-project-id";

export function AppProjectNav() {
  const pathname = usePathname();
  const pathProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_PROJECT_KEY);
      if (stored) setLastProjectId(stored);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  useEffect(() => {
    if (!pathProjectId) return;
    try {
      window.localStorage.setItem(LAST_PROJECT_KEY, pathProjectId);
      setLastProjectId(pathProjectId);
    } catch {
      /* ignore storage errors */
    }
  }, [pathProjectId]);

  const showNav =
    pathname === "/" || pathname.startsWith("/projects/");

  if (!showNav) return null;

  return <ProjectNav projectId={pathProjectId ?? lastProjectId} />;
}
