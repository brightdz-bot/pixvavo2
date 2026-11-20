const RESERVED_ROOT_PATHS = new Set([
  '',
  'banana',
  'admin',
  'api',
  'assets',
  'index.html',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml'
]);

export function normalizeSlug(raw?: string | null): string {
  if (!raw) return '';
  let val = String(raw).trim();
  try {
    val = decodeURIComponent(val);
  } catch {
    // Keep raw string if percent-encoding is malformed
  }
  return val.replace(/^\/+|\/+$/g, '').trim().toLowerCase();
}

export function extractLandingSlugFromLocation(loc?: Location): string | null {
  try {
    const target = loc || (typeof window !== 'undefined' ? window.location : undefined);
    if (!target) return null;

    // 1. Clean path format (preferred for Meta Ads / TikTok Ads): /p/<slug>
    const rawPath = (target.pathname || '/').replace(/\/+$/, '');
    const segments = rawPath.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const prefix = segments[0].toLowerCase();
      if (prefix === 'p' || prefix === 'page' || prefix === 'product') {
        const slug = normalizeSlug(segments[1]);
        if (slug) return slug;
      }
    }

    // 2. Backwards-compatible query param format: /?p=<slug>
    const params = new URLSearchParams(target.search || '');
    const qSlug = normalizeSlug(params.get('p') || params.get('page') || params.get('slug'));
    if (qSlug) return qSlug;

    // 3. Hash fallback format: #/p/<slug>
    const rawHash = (target.hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (rawHash) {
      const hSegs = rawHash.split('/').filter(Boolean);
      if (
        hSegs.length >= 2 &&
        (hSegs[0].toLowerCase() === 'p' ||
          hSegs[0].toLowerCase() === 'page' ||
          hSegs[0].toLowerCase() === 'product')
      ) {
        const hSlug = normalizeSlug(hSegs[1]);
        if (hSlug) return hSlug;
      }
    }

    // 4. Direct root slug fallback: /<slug> (excluding reserved routes & static files)
    if (segments.length === 1) {
      const single = normalizeSlug(segments[0]);
      if (single && !RESERVED_ROOT_PATHS.has(single) && !single.includes('.')) {
        return single;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function buildLandingPagePath(slug: string): string {
  const clean = normalizeSlug(slug);
  return clean ? `/p/${encodeURIComponent(clean)}` : '/';
}

export function buildLandingPageUrl(slug: string, origin?: string): string {
  const base = (
    origin || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/+$/, '');
  return `${base}${buildLandingPagePath(slug)}`;
}
