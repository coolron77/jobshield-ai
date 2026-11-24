import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// HTTPS-only protections (upgrade-insecure-requests, HSTS) must not apply when the
// production build is run over plain http://localhost (e.g. `npm start` locally),
// or the browser upgrades redirects to https and fails. They stay on for Vercel
// and for any deployment whose NEXT_PUBLIC_SITE_URL is https.
const enforceHttps = !isDev && (process.env.VERCEL === "1" || (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"));

function supabaseOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    const { origin, host } = new URL(url);
    return `${origin} wss://${host}`;
  } catch {
    return "";
  }
}

// Next.js injects small inline scripts for hydration, so script-src keeps
// 'unsafe-inline'. Everything else is locked down. 'unsafe-eval' is dev-only
// (React Fast Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins()}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(enforceHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(enforceHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
