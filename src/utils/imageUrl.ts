/**
 * Image URL normalization & Facebook In-App Browser resilience helpers.
 */

export function normalizeImageUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  // Protocol-relative URL -> HTTPS (check before single-slash relative path)
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // Data URLs, blob URLs, and same-origin relative paths stay untouched
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./')
  ) {
    return trimmed;
  }

  let url = trimmed;

  // Upgrade http:// to https:// (Facebook In-App Browser strictly blocks mixed-content http images)
  if (/^http:\/\//i.test(url)) {
    url = url.replace(/^http:\/\//i, 'https://');
  }

  // Google Drive share links -> direct lh3 image URL
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }
  const driveOpenMatch = url.match(/drive\.google\.com\/(?:open|uc)\?[^#]*\bid=([a-zA-Z0-9_-]+)/i);
  if (driveOpenMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${driveOpenMatch[1]}`;
  }

  // Dropbox share links -> direct raw image
  if (/dropbox\.com\//i.test(url)) {
    url = url.replace(/([?&])dl=0\b/i, '$1raw=1');
    if (!/[?&]raw=1\b/i.test(url)) {
      url += url.includes('?') ? '&raw=1' : '?raw=1';
    }
  }

  return url;
}

export function isExternalHttpUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/image-proxy')) return false;
  return /^https?:\/\//i.test(url);
}

export function buildProxiedImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function isFacebookInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram/i.test(ua);
}
