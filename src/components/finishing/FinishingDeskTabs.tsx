"use client";

import { cn } from "@/lib/utils";

export type FinishingDeskTab = "overlays" | "score" | "dialog" | "sfx";

interface FinishingDeskTabsProps {
  activeTab: FinishingDeskTab;
  onChange: (tab: FinishingDeskTab) => void;
}

export function FinishingDeskTabs({
  activeTab,
  onChange,
}: FinishingDeskTabsProps) {
  const tabs: { id: FinishingDeskTab; label: string }[] = [
    { id: "overlays", label: "Text Overlays" },
    { id: "score", label: "Musical Score" },
    { id: "sfx", label: "Sound Effects" },
    { id: "dialog", label: "Dialog" },
  ];

  return (
    <div className="flex gap-1 border-b border-neutral-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn(
            "rounded-t-md px-3 py-2 text-sm transition",
            activeTab === tab.id
              ? "border border-b-0 border-neutral-800 bg-neutral-900 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
