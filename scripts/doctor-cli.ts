import {
  checkAllDependencies,
  formatDependencySummary,
} from "@/lib/services/dependency-checker";

async function main() {
  const deps = await checkAllDependencies();
  console.log("\nDiffuseCut Doctor\n");
  for (const d of deps) {
    const icon = d.status === "ok" ? "OK" : d.status === "warning" ? "WARN" : "FAIL";
    console.log(`[${icon}] ${d.label}: ${d.message}`);
    if (d.installHint && d.status !== "ok") {
      console.log(`      → ${d.installHint}`);
    }
  }
  console.log("\n" + formatDependencySummary(deps) + "\n");
  const appFailed = deps.some(
    (d) => d.requiredFor.includes("app") && d.status === "missing"
  );
  process.exit(appFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
