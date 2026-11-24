import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Store, LandingPage, OrderStatus } from '../../types';
import {
  HEADING_FONTS,
  BODY_FONTS,
  DEFAULT_HEADING_FONT,
  DEFAULT_BODY_FONT,
  findFont,
  loadFonts
} from '../../data/fonts';
import { storage } from '../../services/storage';
import { useAuth } from '../../services/authContext';
import {
  captureMetaAttributionCookies,
  fetchOrderFromGoogleSheet,
  trackMetaPixelStorefrontVisit
} from '../../services/integrations';
import { formatDZD } from '../../data/wilayas';
import { LandingPageView } from './LandingPageView';
import { applyBrowserBranding } from '../../services/branding';
import { buildLandingPagePath, normalizeSlug } from '../../utils/urlRouting';
import { SmartImage } from '../common/SmartImage';
import {
  Search,
  ShoppingBag,
  ArrowLeft,
  Clock,
  Check,
  Truck,
  PackageOpen,
  AlertCircle,
  X,
  ImageOff
} from 'lucide-react';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

interface Props {
  subdomain: string;
  initialSlug?: string | null;
}

export const PublicStorefront: React.FC<Props> = ({
  subdomain,
  initialSlug
}) => {
  const { isSupabaseMode } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [activePageSlug, setActivePageSlug] = useState<string | null>(initialSlug || null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Catalog search & order tracker modal
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('الكل');
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackQuery, setTrackQuery] = useState('');
  const [trackedResult, setTrackedResult] = useState<any | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [faviconUrl, setFaviconUrl] = useState('');
  const [logoImgError, setLogoImgError] = useState(false);

  useEffect(() => {
    setActivePageSlug(initialSlug || null);
  }, [initialSlug]);

  useEffect(() => {
    captureMetaAttributionCookies();
    let mounted = true;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const resolved = await storage.resolveStoreForRequest({
          hostname: typeof window !== 'undefined' ? window.location.hostname : '',
          subdomainHint: subdomain
        });
        if (resolved.error) {
          if (mounted) {
            setLoadError(
              'تعذر الاتصال بقاعدة البيانات أو الجداول غير محدثة. تأكد من تنفيذ ملف السكيمة/الترحيل في Supabase SQL Editor.'
            );
          }
          return;
        }
        const s = resolved.store;
        if (!mounted) return;
        if (!s) {
          setStore(null);
          return;
        }
        setStore(s);
        setLogoImgError(false);
        const localCfg = storage.getLocalStoreApiConfig(s.id);
        if (mounted && localCfg?.faviconUrl) {
          setFaviconUrl(localCfg.faviconUrl);
        }
        const initialPixel = s.defaultPixelId?.trim() || localCfg?.metaPixelId?.trim() || '';
        if (initialPixel && !initialSlug) {
          trackMetaPixelStorefrontVisit(initialPixel);
        }
        fetch(`/api/store/public-settings?storeId=${encodeURIComponent(s.id)}`)
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (!mounted || !data?.ok) return;
            if (data.faviconUrl) {
              setFaviconUrl(data.faviconUrl);
            }
            if (!initialPixel && data.metaPixelId && !initialSlug) {
              trackMetaPixelStorefrontVisit(data.metaPixelId);
            }
          })
          .catch(() => {});
        const lps = await storage.getLandingPages(s.id);
        if (mounted) {
          setPages(lps.filter(p => p.isPublished));
        }
      } catch (err) {
        console.error('Failed to load storefront:', err);
        if (mounted) setLoadError('تعذر تحميل واجهة المتجر. تحقق من الاتصال ومن تنفيذ الترحيل في Supabase وأعد المحاولة.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [subdomain, isSupabaseMode]);

  useEffect(() => {
    if (!store) return;
    const targetSlug = normalizeSlug(activePageSlug);
    const activeLp = targetSlug
      ? pages.find(p => normalizeSlug(p.slug) === targetSlug)
      : null;
    applyBrowserBranding({
      title: activeLp ? `${activeLp.title} | ${store.name}` : store.name,
      iconUrl: faviconUrl || store.logoUrl
    });
  }, [store, faviconUrl, activePageSlug, pages]);

  const openLandingPage = (slug: string) => {
    setActivePageSlug(slug);
    try {
      const url = new URL(window.location.href);
      url.pathname = buildLandingPagePath(slug);
      url.searchParams.delete('p');
      window.history.pushState({}, '', url.toString());
    } catch {
      // ignore history errors inside sandboxed iframes
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeLandingPage = () => {
    setActivePageSlug(null);
    try {
      const url = new URL(window.location.href);
      url.pathname = '/';
      url.searchParams.delete('p');
      window.history.pushState({}, '', url.toString());
    } catch {
      // ignore
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTrackSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackedResult(null);
    const clean = trackQuery.trim().toUpperCase();
    if (!clean) {
      setTrackError('يرجى إدخال رقم الطلب');
      return;
    }
    setIsTrackingLoading(true);
    const sheetWebhook = store?.googleSheetWebhook;
    const [data, sheetData] = await Promise.all([
      storage.trackOrder(clean),
      sheetWebhook ? fetchOrderFromGoogleSheet(sheetWebhook, clean) : Promise.resolve(null)
    ]);
    setIsTrackingLoading(false);
    if (!data && !sheetData) {
      setTrackError('لم يتم العثور على طلب بهذا الرقم');
    } else {
      const hasDbEditAfterCreate =
        Boolean(data?.updatedAt && data?.createdAt) &&
        new Date(data.updatedAt).getTime() - new Date(data.createdAt).getTime() > 2500;
      const preferDb = hasDbEditAfterCreate && Boolean(data);
      setTrackedResult({
        orderNumber: data?.orderNumber || sheetData?.orderNumber || clean,
        customerFirstName: data?.customerFirstName || sheetData?.customerFirstName,
        wilayaName: preferDb
          ? data?.wilayaName || sheetData?.wilayaName || ''
          : sheetData?.wilayaName || data?.wilayaName || '',
        commune: preferDb ? data?.commune ?? sheetData?.commune : sheetData?.commune ?? data?.commune,
        deliveryType: preferDb
          ? data?.deliveryType || sheetData?.deliveryType || 'home'
          : sheetData?.deliveryType || data?.deliveryType || 'home',
        bundleLabel: preferDb
          ? data?.bundleLabel || sheetData?.bundleLabel || ''
          : sheetData?.bundleLabel || data?.bundleLabel || '',
        total: preferDb
          ? Number(data?.total || sheetData?.total || 0)
          : Number(sheetData?.total || data?.total || 0),
        status: sheetData?.status || data?.status || 'new',
        trackingCode: sheetData?.trackingCode || data?.trackingCode
      });
    }
  };

  const headFontId = store?.storefrontHeadingFont;
  const bodyFontId = store?.storefrontBodyFont;
  const hasStore = Boolean(store);
  useEffect(() => {
    if (!hasStore) return;
    loadFonts([
      findFont(HEADING_FONTS, headFontId, DEFAULT_HEADING_FONT),
      findFont(BODY_FONTS, bodyFontId, DEFAULT_BODY_FONT)
    ]);
  }, [hasStore, headFontId, bodyFontId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sf-ink)] text-[color:var(--sf-ivory)] sf-dark">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[color:var(--sf-gold)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold">جارٍ تحميل المتجر...</p>
        </div>
      </div>
    );
  }

  if (loadError || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sf-ink)] p-6 text-center sf-dark">
        <div className="max-w-md w-full bg-[var(--sf-panel)] rounded-md p-8 border border-[color:var(--sf-line)] space-y-4 text-[color:var(--sf-ivory)]">
          <AlertCircle className="w-12 h-12 text-[color:var(--sf-gold)] mx-auto" />
          <h1 className="text-xl font-bold text-[color:var(--sf-ivory)]">
            {loadError ? 'تعذر تحميل المتجر' : 'المتجر قيد التجهيز حالياً'}
          </h1>
          <p className="text-xs text-[color:var(--sf-mute)] leading-relaxed">
            {loadError || 'نعمل حالياً على تجهيز المنتجات والعروض، يرجى العودة لاحقاً.'}
          </p>
        </div>
      </div>
    );
  }

  // If a landing page slug is active, render the full dedicated LandingPageView!
  const normalizedTargetSlug = normalizeSlug(activePageSlug);
  const basePage = normalizedTargetSlug
    ? pages.find(p => normalizeSlug(p.slug) === normalizedTargetSlug)
    : null;
  // A/B test: a stable random share of visitors (per browser) sees the variant page.
  let activePage = basePage;
  const abCfg = basePage?.integrations?.ab;
  const abVariant = abCfg?.variantSlug
    ? pages.find(p => normalizeSlug(p.slug) === normalizeSlug(abCfg.variantSlug) && p.id !== basePage?.id)
    : null;
  if (basePage && abVariant) {
    const abKey = `ab_${basePage.id}`;
    let side: string | null = null;
    try {
      side = localStorage.getItem(abKey);
      if (side !== 'A' && side !== 'B') {
        const share = Math.min(100, Math.max(0, Number(abCfg?.splitToB ?? 50)));
        side = Math.random() * 100 < share ? 'B' : 'A';
        localStorage.setItem(abKey, side);
      }
    } catch {
      side = 'A';
    }
    if (side === 'B') activePage = abVariant;
  }

  const sfHeadFont = findFont(HEADING_FONTS, store.storefrontHeadingFont, DEFAULT_HEADING_FONT);
  const sfBodyFont = findFont(BODY_FONTS, store.storefrontBodyFont, DEFAULT_BODY_FONT);
  const sfIsDark = store.storefrontTheme !== 'light';
  const sfThemeClass = sfIsDark ? 'sf-dark' : 'sf-light';
  const rawAccent = /^#[0-9a-fA-F]{6}$/.test(store.brandColor || '') ? store.brandColor : '';
  // Untouched legacy brown reads poorly on dark: fall back to the theme's own accent.
  const customAccent = rawAccent && rawAccent.toLowerCase() !== '#754b2d' ? rawAccent : '';
  const sfAccent = customAccent || (sfIsDark ? '#c8a15b' : '#754b2d');
  const sfLuma =
    (0.299 * parseInt(sfAccent.slice(1, 3), 16) +
      0.587 * parseInt(sfAccent.slice(3, 5), 16) +
      0.114 * parseInt(sfAccent.slice(5, 7), 16)) / 255;
  const sfVars = {
    '--sf-gold': sfAccent,
    '--sf-on-accent': sfLuma > 0.6 ? '#0d0f0e' : '#ffffff',
    '--sf-font-head': sfHeadFont.family,
    '--sf-font-body': sfBodyFont.family
  } as React.CSSProperties;

  const categories = ['الكل', ...Array.from(new Set(pages.map(p => p.category)))];
  const filteredPages = pages.filter(p => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCat === 'الكل' || p.category === selectedCat;
    return matchesSearch && matchesCat;
  });

  const statusStageIndex = (st: OrderStatus) => {
    if (st === 'new') return 0;
    if (st === 'confirmed') return 1;
    if (st === 'shipping') return 2;
    if (st === 'delivered') return 3;
    return -1;
  };

  return (
    <MotionConfig reducedMotion="user">
        {activePage ? (
          <div key={`lp-${activePage.id}`}>
            <LandingPageView
              store={store}
              page={activePage}
              onBackToCatalog={closeLandingPage}
            />
          </div>
        ) : (
          <div
            key="catalog-view"
            dir="rtl"
            className={`min-h-screen w-full max-w-full overflow-x-clip bg-[var(--sf-ink)] text-[color:var(--sf-ivory)] flex flex-col ${sfThemeClass}`}
            style={sfVars}
          >
            {/* Top Announcement Bar */}
            <div
              className="text-[color:var(--sf-on-accent)] text-xs py-2 px-4 text-center font-bold"
              style={{ backgroundColor: 'var(--sf-gold)' }}
            >
              {store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام'}
            </div>

            {/* Store Catalog Header */}
            <header className="sticky top-0 z-30 bg-[var(--sf-ink)]/90 backdrop-blur-md border-b border-[color:var(--sf-line)] transition-shadow duration-200">
              <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-[color:var(--sf-on-accent)] font-black shrink-0"
                    style={{ backgroundColor: 'var(--sf-gold)' }}
                  >
                    {store.logoUrl && !logoImgError ? (
                      <SmartImage
                        src={store.logoUrl}
                        alt={store.name}
                        eager
                        onFinalError={() => setLogoImgError(true)}
                        fallback={<span>{store.name.slice(0, 1)}</span>}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      store.name.slice(0, 1)
                    )}
                  </div>
                  <div className="truncate">
                    <h1 className="font-bold text-xl sm:text-2xl leading-none truncate">{store.name}</h1>
                    <p className="text-[11px] text-[color:var(--sf-mute)] mt-1 truncate">
                      {store.description || 'عروض وصفحات منتجات جاهزة للطلب الفوري'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <motion.button
                    type="button"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                    onClick={() => setTrackOpen(true)}
                    className="px-3.5 py-2 rounded-full border border-[color:var(--sf-line)] text-[color:var(--sf-ivory)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:border-[color:var(--sf-gold)] transition-colors duration-200"
                  >
                    <Search className="w-3.5 h-3.5" style={{ color: 'var(--sf-gold)' }} />
                    <span>تتبع طلبك</span>
                  </motion.button>
                </div>
              </div>
            </header>

            {/* Storefront Body */}
            <main className="max-w-6xl mx-auto w-full px-4 py-8 flex-1 space-y-8">
              {/* Search & Category Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {categories.map(cat => {
                    const isSelected = selectedCat === cat;
                    return (
                      <motion.button
                        key={cat}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setSelectedCat(cat)}
                        className={`relative px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                          isSelected
                            ? 'text-[color:var(--sf-on-accent)]'
                            : 'border border-[color:var(--sf-line)] text-[color:var(--sf-mute)] hover:text-[color:var(--sf-ivory)] hover:border-[color:var(--sf-gold)]'
                        }`}
                      >
                        {isSelected && (
                          <motion.span
                            layoutId="storefront-category-pill"
                            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                            className="absolute inset-0 rounded-full"
                            style={{ backgroundColor: 'var(--sf-gold)' }}
                          />
                        )}
                        <span className="relative z-10">{cat}</span>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-[color:var(--sf-mute)] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ابحث عن منتج أو عرض..."
                    className="w-full pr-10 pl-4 py-2.5 rounded-full border border-[color:var(--sf-line)] bg-[var(--sf-panel)] text-[color:var(--sf-ivory)] placeholder:text-[color:var(--sf-mute)] text-xs focus:outline-none focus:border-[color:var(--sf-gold)] transition-colors duration-200"
                  />
                </div>
              </div>

              {/* Landing Pages Grid */}
              <AnimatePresence mode="wait" initial={false}>
                {filteredPages.length === 0 ? (
                  <motion.div
                    key="empty-catalog"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                    className="p-12 rounded-md border border-[color:var(--sf-line)] text-center space-y-3"
                  >
                    <ShoppingBag className="w-12 h-12 text-[color:var(--sf-line)] mx-auto" />
                    <h2 className="text-lg font-bold text-[color:var(--sf-ivory)]">لا توجد عروض متاحة حالياً</h2>
                    <p className="text-xs text-[color:var(--sf-mute)]">
                      يرجى التحقق مجدداً قريباً لاكتشاف أحدث المنتجات والعروض.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="catalog-grid"
                    layout
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      {filteredPages.map(lp => {
                        const lowestOffer = lp.offers.reduce(
                          (min, o) => (o.price < min ? o.price : min),
                          lp.offers[0]?.price || 0
                        );
                        const defaultOffer = lp.offers.find(o => o.isDefault) || lp.offers[0];
                        return (
                          <motion.div
                            key={lp.id}
                            layout
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 6 }}
                            whileHover={{ y: -4 }}
                            whileTap={{ scale: 0.985 }}
                            transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                            onClick={() => openLandingPage(lp.slug)}
                            className="group overflow-hidden cursor-pointer flex flex-col"
                            style={{ borderColor: 'var(--sf-line)' }}
                          >
                            <div className="relative aspect-[4/5] bg-[var(--sf-panel)] overflow-hidden rounded-sm border border-[color:var(--sf-line)] group-hover:border-[color:var(--sf-gold)] transition-colors duration-300">
                              {lp.badgeText && (
                                <span
                                  className="absolute top-3 right-3 z-10 text-[color:var(--sf-on-accent)] text-[11px] font-bold px-2.5 py-1 rounded-full"
                                  style={{ backgroundColor: 'var(--sf-gold)' }}
                                >
                                  {lp.badgeText}
                                </span>
                              )}
                              {lp.mainImage ? (
                                <SmartImage
                                  src={lp.mainImage}
                                  alt={lp.title}
                                  eager
                                  fallback={
                                    <div className="w-full h-full flex items-center justify-center text-[color:var(--sf-line)]">
                                      <ImageOff className="w-10 h-10" />
                                    </div>
                                  }
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[color:var(--sf-line)]">
                                  <ImageOff className="w-10 h-10" />
                                </div>
                              )}
                            </div>

                            <div className="pt-4 flex-1 flex flex-col justify-between space-y-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] text-[color:var(--sf-mute)] font-medium">
                                  <span>{lp.category}</span>
                                  <span>{lp.offers.length} باقات عرض</span>
                                </div>
                                <h3 className="font-bold text-lg leading-snug text-[color:var(--sf-ivory)]">
                                  {lp.title}{' '}
                                  {lp.highlightTitle && (
                                    <span style={{ color: 'var(--sf-gold)' }}>{lp.highlightTitle}</span>
                                  )}
                                </h3>
                                <p className="text-xs text-[color:var(--sf-mute)] line-clamp-2 leading-relaxed">
                                  {lp.description}
                                </p>
                              </div>

                              <div className="pt-3 border-t border-[color:var(--sf-line)] flex items-center justify-between gap-3">
                                <div className="tabular-nums">
                                  <span className="text-[10px] text-[color:var(--sf-mute)] block">ابتداءً من</span>
                                  <span className="text-lg font-black" style={{ color: 'var(--sf-gold)' }}>
                                    {formatDZD(lowestOffer)}
                                  </span>
                                  {defaultOffer?.comparePrice && (
                                    <span className="text-[11px] text-[color:var(--sf-mute)] line-through mr-1.5">
                                      {formatDZD(defaultOffer.comparePrice)}
                                    </span>
                                  )}
                                </div>

                                <span
                                  className="px-4 py-2.5 rounded-full text-[color:var(--sf-on-accent)] text-xs font-bold flex items-center gap-1.5 shrink-0"
                                  style={{ backgroundColor: 'var(--sf-gold)' }}
                                >
                                  <span>عرض الصفحة والطلب</span>
                                  <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-1" />
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* Track Order Modal */}
            <AnimatePresence>
              {trackOpen && (
                <motion.div
                  key="track-modal-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={e => {
                    if (e.target === e.currentTarget) setTrackOpen(false);
                  }}
                  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                >
                  <motion.div
                    key="track-modal-card"
                    initial={{ opacity: 0, scale: 0.94, y: 16, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.96, y: 10, filter: 'blur(4px)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="bg-[var(--sf-panel)] text-[color:var(--sf-ivory)] rounded-md p-6 sm:p-8 max-w-lg w-full space-y-5 border border-[color:var(--sf-line)]"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold">تتبع حالة طلبك</h3>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setTrackOpen(false)}
                        className="p-1.5 rounded-lg text-[color:var(--sf-mute)] hover:bg-[color:var(--sf-line)] transition-colors cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </motion.button>
                    </div>

                    <form onSubmit={handleTrackSearch} className="flex gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={trackQuery}
                        onChange={e => setTrackQuery(e.target.value)}
                        placeholder="DZ-9821A4B2"
                        className="flex-1 p-3 rounded-full border border-[color:var(--sf-line)] bg-[var(--sf-ink)] text-[color:var(--sf-ivory)] text-center font-mono font-bold text-sm focus:outline-none focus:border-[color:var(--sf-gold)]"
                      />
                      <motion.button
                        type="submit"
                        whileTap={{ scale: 0.96 }}
                        disabled={isTrackingLoading}
                        className="px-5 py-3 rounded-full text-[color:var(--sf-on-accent)] font-bold text-sm cursor-pointer disabled:opacity-60 transition-opacity"
                        style={{ backgroundColor: 'var(--sf-gold)' }}
                      >
                        {isTrackingLoading ? 'بحث...' : 'تتبع'}
                      </motion.button>
                    </form>

                    <AnimatePresence mode="wait">
                      {trackError && (
                        <motion.p
                          key="track-error"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                          className="text-xs font-bold text-rose-600 text-center"
                        >
                          {trackError}
                        </motion.p>
                      )}

                      {trackedResult && (
                        <motion.div
                          key={`tracked-${trackedResult.orderNumber}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                          className="space-y-4 pt-2 border-t border-[color:var(--sf-line)]"
                        >
                          <div className="bg-[var(--sf-ink)] p-3.5 rounded-md text-xs space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-[color:var(--sf-mute)]">رقم الطلب:</span>
                              <strong className="font-mono">{trackedResult.orderNumber}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[color:var(--sf-mute)]">الطلب:</span>
                              <strong>{trackedResult.bundleLabel}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[color:var(--sf-mute)]">الوجهة والتوصيل:</span>
                              <strong>
                                {trackedResult.wilayaName}
                                {trackedResult.commune ? ` - ${trackedResult.commune}` : ''} (
                                {trackedResult.deliveryType === 'stop' ? 'مكتب الشحن' : 'للمنزل'})
                              </strong>
                            </div>
                            {trackedResult.trackingCode && (
                              <div className="flex justify-between">
                                <span className="text-[color:var(--sf-mute)]">رمز الشحن:</span>
                                <strong className="font-mono">{trackedResult.trackingCode}</strong>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-[color:var(--sf-mute)]">الإجمالي:</span>
                              <strong className="tabular-nums">{formatDZD(trackedResult.total)}</strong>
                            </div>
                          </div>

                          {trackedResult.status === 'cancelled' ? (
                            <div className="p-3 rounded-xl bg-rose-950/50 text-rose-300 text-xs font-bold text-center">
                              تم إلغاء هذا الطلب
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-2 text-center">
                              {[
                                { label: 'قيد التأكيد', icon: Clock },
                                { label: 'التأكيد', icon: Check },
                                { label: 'في التوصيل', icon: Truck },
                                { label: 'التسليم', icon: PackageOpen }
                              ].map((s, i) => {
                                const active = i <= statusStageIndex(trackedResult.status);
                                const Icon = s.icon;
                                return (
                                  <motion.div
                                    key={s.label}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: i * 0.055, ease: EASE_OUT_EXPO }}
                                    className="flex flex-col items-center gap-1.5"
                                  >
                                    <motion.div
                                      initial={false}
                                      animate={{ scale: active ? [0.85, 1.08, 1] : 1 }}
                                      transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-200 ${
                                        active ? 'text-[color:var(--sf-on-accent)]' : 'bg-[var(--sf-ink)] text-[color:var(--sf-mute)]'
                                      }`}
                                      style={active ? { backgroundColor: 'var(--sf-gold)' } : undefined}
                                    >
                                      <Icon className="w-4 h-4" />
                                    </motion.div>
                                    <span className={`text-[11px] font-bold ${active ? 'text-[color:var(--sf-ivory)]' : 'text-[color:var(--sf-mute)]'}`}>
                                      {s.label}
                                    </span>
                                  </motion.div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
    </MotionConfig>
  );
};
