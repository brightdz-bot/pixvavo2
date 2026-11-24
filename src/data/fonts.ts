export interface FontOption {
  id: string;
  label: string;
  family: string;
  /** Google Fonts css2 `family=` value (without the leading "family=") */
  google: string;
}

export const HEADING_FONTS: FontOption[] = [
  { id: 'reem-kufi', label: 'Reem Kufi (كوفي هندسي)', family: "'Reem Kufi'", google: 'Reem+Kufi:wght@500;600;700' },
  { id: 'noto-kufi', label: 'Noto Kufi Arabic', family: "'Noto Kufi Arabic'", google: 'Noto+Kufi+Arabic:wght@500;600;700' },
  { id: 'amiri', label: 'Amiri (نسخ كلاسيكي)', family: "'Amiri'", google: 'Amiri:wght@400;700' },
  { id: 'el-messiri', label: 'El Messiri', family: "'El Messiri'", google: 'El+Messiri:wght@500;600;700' },
  { id: 'readex', label: 'Readex Pro (عصري)', family: "'Readex Pro'", google: 'Readex+Pro:wght@400;500;600;700' },
  { id: 'cairo', label: 'Cairo', family: "'Cairo'", google: 'Cairo:wght@500;700;900' },
  { id: 'tajawal', label: 'Tajawal', family: "'Tajawal'", google: 'Tajawal:wght@500;700;800' }
];

export const BODY_FONTS: FontOption[] = [
  { id: 'plex-arabic', label: 'IBM Plex Sans Arabic', family: "'IBM Plex Sans Arabic'", google: 'IBM+Plex+Sans+Arabic:wght@400;500;600;700' },
  { id: 'cairo', label: 'Cairo', family: "'Cairo'", google: 'Cairo:wght@400;600;700' },
  { id: 'tajawal', label: 'Tajawal', family: "'Tajawal'", google: 'Tajawal:wght@400;500;700' },
  { id: 'almarai', label: 'Almarai', family: "'Almarai'", google: 'Almarai:wght@400;700' },
  { id: 'readex', label: 'Readex Pro', family: "'Readex Pro'", google: 'Readex+Pro:wght@400;500;600' },
  { id: 'noto-naskh', label: 'Noto Naskh Arabic (نسخ)', family: "'Noto Naskh Arabic'", google: 'Noto+Naskh+Arabic:wght@400;500;600;700' }
];

export const DEFAULT_HEADING_FONT = 'reem-kufi';
export const DEFAULT_BODY_FONT = 'plex-arabic';

export const findFont = (list: FontOption[], id: string | undefined, fallbackId: string): FontOption =>
  list.find(f => f.id === id) || list.find(f => f.id === fallbackId)!;

export const googleFontsHref = (fonts: FontOption[]): string =>
  `https://fonts.googleapis.com/css2?${Array.from(new Set(fonts.map(f => f.google)))
    .map(g => `family=${g}`)
    .join('&')}&display=swap`;

/** Injects (once per href) a stylesheet link for the given fonts. */
export const loadFonts = (fonts: FontOption[]): void => {
  if (typeof document === 'undefined') return;
  const href = googleFontsHref(fonts);
  if (document.querySelector(`link[data-sf-fonts="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-sf-fonts', href);
  document.head.appendChild(link);
};
