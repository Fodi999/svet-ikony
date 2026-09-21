/**
 * Development-only QA probe (never imported in production builds): counts
 * streamed tile requests and decoded response bytes by kind so imagery /
 * terrain / 3D Tiles cost can be compared per scenario. Exposed on
 * `window.__earthProbe`. Bytes are decoded body sizes (gzip is not visible to
 * XHR/fetch), so treat them as an upper bound of transferred bytes.
 */
export type ProbeKind = 'imagery' | 'imagery-meta' | 'terrain' | '3dtiles' | 'glb-marker' | 'local' | 'other';
type Entry = { url: string; kind: ProbeKind; bytes: number; t: number };

export function classify(url: string): ProbeKind {
  const target = new URL(url, location.href);
  if (target.host === location.host) return /\/markers\/sacred\//.test(target.pathname) ? 'glb-marker' : 'local';
  if (/\.terrain$|layer\.json$|CesiumWorldTerrain/i.test(target.pathname)) return 'terrain';
  if (/\.(b3dm|cmpt|i3dm|subtree|pnts|glb)$|tileset\.json$/i.test(target.pathname)) return '3dtiles';
  if (/\/tile\/v1\/viewport$/.test(target.pathname)) return 'imagery-meta';
  if (/2dtiles|virtualearth|googleapis|\.(jpe?g|png|webp)$/i.test(target.href)) return 'imagery';
  return 'other';
}

export function installDevProbe() {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
  const w = window as Window & { __earthProbe?: unknown };
  if (w.__earthProbe) return;
  const entries: Entry[] = [];
  const record = (url: string, bytes: number) => entries.push({ url, kind: classify(url), bytes, t: performance.now() });
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const href = String(url);
    this.addEventListener('loadend', () => {
      const response = this.response as Blob | ArrayBuffer | string | null;
      const bytes = response instanceof Blob ? response.size : response instanceof ArrayBuffer ? response.byteLength : typeof response === 'string' ? response.length : 0;
      record(href, this.status >= 200 && this.status < 400 ? bytes : 0);
    });
    return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const response = await fetchOriginal(input, init);
    void response.clone().arrayBuffer().then(buffer => record(href, buffer.byteLength), () => record(href, 0));
    return response;
  };
  w.__earthProbe = {
    reset() { entries.length = 0; },
    entries: () => entries,
    summary() {
      const out: Record<string, { requests: number; bytes: number }> = {};
      for (const entry of entries) {
        const bucket = (out[entry.kind] ??= { requests: 0, bytes: 0 });
        bucket.requests++;
        bucket.bytes += entry.bytes;
      }
      return out;
    },
    hosts() {
      const hosts: Record<string, number> = {};
      for (const entry of entries) {
        const host = new URL(entry.url, location.href).host;
        hosts[host] = (hosts[host] ?? 0) + 1;
      }
      return hosts;
    },
  };
}
