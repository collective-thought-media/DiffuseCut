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

/** After git pull, npm start must rebuild if the last production build is from an older commit. */
export function productionBuildNeedsRebuild({
  hasBuild,
  builtRev,
  currentRev,
}) {
  if (!hasBuild) return true;
  if (!currentRev) return false;
  if (!builtRev) return true;
  return builtRev !== currentRev;
}
