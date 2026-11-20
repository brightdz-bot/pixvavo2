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

/**
 * Normalizes a merchant custom domain into a bare lowercase hostname without
 * protocol, path, port, or leading "www." (e.g. "https://www.MyShop.com/" -> "myshop.com").
 */
export function normalizeDomainHost(raw?: string | null): string {
  if (!raw) return '';
  let host = String(raw).trim().toLowerCase();
  if (!host) return '';
  host = host.replace(/^https?:\/\//i, '');
  host = host.split('/')[0].split('?')[0].split('#')[0];
  host = host.split(':')[0];
  host = host.replace(/\.+$/, '');
  host = host.replace(/^www\./i, '');
  return host.trim();
}

export function isValidCustomDomain(raw?: string | null): boolean {
  const host = normalizeDomainHost(raw);
  if (!host || host.length > 253) return false;
  if (!host.includes('.')) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host);
}

/**
 * Returns true if the hostname belongs to local dev or default hosting platforms
 * (Vercel, Cloud Run, Firebase, localhost) rather than a merchant's independent custom domain.
 */
export function isPlatformDefaultHost(hostname?: string | null): boolean {
  const host = normalizeDomainHost(hostname);
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.run.app') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev')
  ) {
    return true;
  }
  return false;
}

export function extractStoreSubdomainFromLocation(loc?: Location): string | null {
  try {
    const target = loc || (typeof window !== 'undefined' ? window.location : undefined);
    if (!target) return null;
    const params = new URLSearchParams(target.search || '');
    const raw = (params.get('store') || params.get('s') || '').trim().toLowerCase();
    if (!raw) return null;
    const clean = raw.replace(/[^a-z0-9-]/g, '');
    return clean.length >= 2 ? clean : null;
  } catch {
    return null;
  }
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

export function buildStoreBaseOrigin(customDomain?: string, fallbackOrigin?: string): string {
  const normalized = normalizeDomainHost(customDomain);
  if (normalized && isValidCustomDomain(normalized)) {
    return `https://${normalized}`;
  }
  return (
    fallbackOrigin || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/+$/, '');
}

export function buildLandingPageUrl(
  slug: string,
  origin?: string,
  options?: { customDomain?: string; storeSubdomain?: string; includeStoreQueryFallback?: boolean }
): string {
  const normalizedDomain = normalizeDomainHost(options?.customDomain);
  const hasCustomDomain = Boolean(normalizedDomain && isValidCustomDomain(normalizedDomain));
  const base = hasCustomDomain
    ? `https://${normalizedDomain}`
    : (origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const path = buildLandingPagePath(slug);
  if (!hasCustomDomain && options?.includeStoreQueryFallback && options?.storeSubdomain) {
    return `${base}${path}?store=${encodeURIComponent(options.storeSubdomain)}`;
  }
  return `${base}${path}`;
}
