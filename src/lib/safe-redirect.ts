/** Only allow same-site relative paths as post-login redirect targets (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("://")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next.slice(0, 512);
}
