/** Pure helpers for scripts/dev.mjs. Keep this file importable from tests. */

export function shouldEnableTurbopack({ isProd, argv = [], env = {} }) {
  if (isProd) return false;
  if (argv.includes("--turbo")) return true;
  const flag = String(env.DIFFUSECUT_TURBO ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export function isTurbopackManifestRace(text) {
  if (!text) return false;
  return (
    text.includes("_buildManifest.js.tmp") &&
    (text.includes("ENOENT") || text.includes("no such file or directory"))
  );
}
