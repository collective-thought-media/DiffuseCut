/** SMPTE-style timecode HH:MM:SS:FF from timeline frame index. */
export function formatSmpteTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const f = Math.max(0, Math.floor(frame));
  const ff = f % safeFps;
  const totalSec = Math.floor(f / safeFps);
  const ss = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mm = totalMin % 60;
  const hh = Math.floor(totalMin / 60);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const padFf = String(ff).padStart(2, "0");
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${padFf}`;
}

export function formatTimelineDurationSeconds(
  totalFrames: number,
  fps: number
): string {
  const sec = totalFrames / Math.max(1, fps);
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
