import type { DependencyStatus, DependencyStatusValue } from "@/types";
import { Badge } from "@/components/ui/button";

function statusVariant(
  status: DependencyStatusValue
): "success" | "warning" | "error" | "default" | "info" {
  if (status === "ok") return "success";
  if (status === "info") return "info";
  if (status === "warning") return "warning";
  if (status === "missing") return "error";
  return "default";
}

function statusLabel(dep: DependencyStatus): string {
  if (dep.status === "ok") return "ready";
  if (dep.status === "info") return dep.optional ? "optional" : "info";
  if (dep.status === "warning") return "attention";
  if (dep.status === "missing") return "missing";
  return dep.status;
}

export function DependencyRow({ dep }: { dep: DependencyStatus }) {
  const hintIsInformational = dep.status === "info";

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{dep.label}</span>
        <Badge variant={statusVariant(dep.status)}>{statusLabel(dep)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{dep.message}</p>
      {dep.detectedVersion && (
        <p className="text-xs text-muted-foreground">{dep.detectedVersion}</p>
      )}
      {dep.installHint && dep.status !== "ok" && (
        <p
          className={
            hintIsInformational
              ? "text-xs text-muted-foreground"
              : "text-xs text-amber-200/80"
          }
        >
          {dep.installHint}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {dep.optional
          ? `Optional for: ${dep.requiredFor.join(", ")}`
          : `Required for: ${dep.requiredFor.join(", ")}`}
      </p>
    </div>
  );
}

export function DependencyChecklist({ deps }: { deps: DependencyStatus[] }) {
  return (
    <div className="space-y-3">
      {deps.map((dep) => (
        <DependencyRow key={dep.id} dep={dep} />
      ))}
    </div>
  );
}
