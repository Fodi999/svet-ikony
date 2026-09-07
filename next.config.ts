import type { NextConfig } from 'next';

/**
 * Phase 1D.2 production security headers. Gated on NODE_ENV === 'production'
 * so `next dev` is never affected (a CSP without 'unsafe-eval' would break
 * React's dev-mode stack-trace eval, and OpenNext's local dev flow has no
 * need for these anyway) -- `next build`/`next start` always set
 * NODE_ENV=production themselves, so this is the same invariant Phase
 * 1B.2 relies on for the mock-auth exclusion in svetikony-admin.
 *
 * Baseline CSP, not nonce-based -- checked directly against a real local
 * `next build && next start` response (curled it, inspected the raw
 * HTML), same as svetikony-admin's own investigation: Next.js App
 * Router's RSC payload streaming injects several inline
 * `<script>self.__next_f.push(...)</script>` tags with per-request-varying
 * content, which cannot be hash-allowlisted; a real nonce-based CSP would
 * require Proxy-generated nonces plus forcing every page into dynamic
 * rendering (see node_modules/next/dist/docs/01-app/02-guides/content-
 * security-policy.md), which would undo this app's static
 * generation/ISR -- a materially larger, separate effort, not a one-line
 * fix. `script-src`/`style-src` therefore carry 'unsafe-inline'
 * (style-src also for real inline `style={{...}}` uses -- color-scheme /
 * PWA safe-area-inset -- on <html>/<body>, which have no hash mechanism
 * of their own). This is a real, disclosed residual risk: with
 * 'unsafe-inline' present, a successful HTML-injection vulnerability
 * elsewhere could still run inline script. `img-src` allows any https:
 * host, not just 'self' -- this matches lib/media/resolver.ts's
 * resolveMediaUrl() and this file's own images.remotePatterns above
 * (hostname: '**'), both of which already treat any absolute HTTPS image
 * URL as trusted by design; a stricter img-src would only break real
 * media previews, not add security this app doesn't already forgo.
 * No analytics/embedded iframes/third-party scripts exist anywhere in
 * this codebase (grepped directly), so connect-src/frame-src/script-src
 * need no external origins beyond 'self'.
 */
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // No known legitimate embedding use case anywhere in this codebase
      // (grepped for iframe/embed usage -- none). If church sites ever
      // need to embed a specific page, this must change to an explicit
      // allowlist of those origins, not a blanket allow.
      "frame-ancestors 'none'",
      "frame-src 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // camera/microphone/geolocation/payment/usb are unused anywhere in this
  // codebase (checked directly) -- denied as defense in depth. Deliberately
  // NOT restricting clipboard-write: components/site/IconPhotoCatalog.tsx
  // really does call navigator.clipboard.writeText() for its "copy link"
  // action, found by checking before restricting rather than assuming.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // No includeSubDomains/preload -- subdomain ownership across
  // svetikony.com is not confirmed from this repo, and preload is a
  // hard-to-reverse commitment. Safe to send unconditionally within this
  // production-only block: browsers only ever honor HSTS on a response
  // actually received over HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=15552000' },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' }
    ]
  },
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
