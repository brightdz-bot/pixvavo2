import React, { useState, useEffect } from 'react';
import { Store, LandingPage, OrderStatus } from '../../types';
import { storage } from '../../services/storage';
import { useAuth } from '../../services/authContext';
import { formatDZD } from '../../data/wilayas';
import { LandingPageView } from './LandingPageView';
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

  useEffect(() => {
    if (initialSlug) setActivePageSlug(initialSlug);
  }, [initialSlug]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        let s = await storage.getStoreBySubdomain(subdomain);
        if (!s) {
          const primaryRes = await storage.getPrimaryStoreDetailed();
          if (primaryRes.error) {
            if (mounted) {
              setLoadError(
                'تعذر الاتصال بقاعدة البيانات أو الجداول غير محدثة. تأكد من تنفيذ ملف السكيمة/الترحيل في Supabase SQL Editor.'
              );
            }
            return;
          }
          s = primaryRes.store;
        }
        if (!mounted) return;
        if (!s) {
          setStore(null);
          return;
        }
        setStore(s);
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

  const openLandingPage = (slug: string) => {
    setActivePageSlug(slug);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('p', slug);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore history errors inside sandboxed iframes
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeLandingPage = () => {
    setActivePageSlug(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      window.history.replaceState({}, '', url.toString());
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
    const data = await storage.trackOrder(clean);
    setIsTrackingLoading(false);
    if (!data) {
      setTrackError('لم يتم العثور على طلب بهذا الرقم');
    } else {
      setTrackedResult(data);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7] text-[#432818]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[#754b2d] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold">جارٍ تحميل المتجر...</p>
        </div>
      </div>
    );
  }

  if (loadError || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7] p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#e8d5b7] shadow-lg space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-600 mx-auto" />
          <h1 className="text-xl font-black text-slate-900">
            {loadError ? 'تعذر تحميل المتجر' : 'المتجر قيد التجهيز حالياً'}
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            {loadError || 'نعمل حالياً على تجهيز المنتجات والعروض، يرجى العودة لاحقاً.'}
          </p>
        </div>
      </div>
    );
  }

  // If a landing page slug is active, render the full dedicated LandingPageView!
  const activePage = activePageSlug
    ? pages.find(p => p.slug.toLowerCase() === activePageSlug.toLowerCase())
    : null;

  if (activePage) {
    return (
      <LandingPageView
        store={store}
        page={activePage}
        onBackToCatalog={closeLandingPage}
      />
    );
  }

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
    <div dir="rtl" className="min-h-screen bg-[#fdfbf7] text-[#2c1810] flex flex-col">
      {/* Top Announcement Bar */}
      <div
        className="text-white text-xs py-2 px-4 text-center font-bold"
        style={{ backgroundColor: store.brandColor || '#754b2d' }}
      >
        {store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام'}
      </div>

      {/* Store Catalog Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#e8d5b7]">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shadow-sm shrink-0"
              style={{ backgroundColor: store.brandColor || '#754b2d' }}
            >
              {store.name.slice(0, 1)}
            </div>
            <div className="truncate">
              <h1 className="font-black text-lg sm:text-xl leading-none truncate">{store.name}</h1>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {store.description || 'عروض وصفحات منتجات جاهزة للطلب الفوري'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setTrackOpen(true)}
              className="px-3 py-2 rounded-xl bg-[#f7f1e5] border border-[#e8d5b7] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" style={{ color: store.brandColor }} />
              <span>تتبع طلبك</span>
            </button>
          </div>
        </div>
      </header>

      {/* Storefront Body */}
      <main className="max-w-6xl mx-auto w-full px-4 py-8 flex-1 space-y-8">
        {/* Search & Category Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCat === cat
                    ? 'text-white shadow-sm'
                    : 'bg-white border border-[#e8d5b7] text-slate-700 hover:bg-[#f7f1e5]'
                }`}
                style={selectedCat === cat ? { backgroundColor: store.brandColor || '#754b2d' } : undefined}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن منتج أو عرض..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#e8d5b7] bg-white text-xs focus:outline-none"
            />
          </div>
        </div>

        {/* Landing Pages Grid */}
        {filteredPages.length === 0 ? (
          <div className="p-12 rounded-3xl bg-white border border-[#e8d5b7] text-center space-y-3">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
            <h2 className="text-lg font-bold">لا توجد عروض متاحة حالياً</h2>
            <p className="text-xs text-slate-500">
              يرجى التحقق مجدداً قريباً لاكتشاف أحدث المنتجات والعروض.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPages.map(lp => {
              const lowestOffer = lp.offers.reduce(
                (min, o) => (o.price < min ? o.price : min),
                lp.offers[0]?.price || 0
              );
              const defaultOffer = lp.offers.find(o => o.isDefault) || lp.offers[0];
              return (
                <div
                  key={lp.id}
                  onClick={() => openLandingPage(lp.slug)}
                  className="group rounded-2xl overflow-hidden border bg-white shadow-sm hover:shadow-xl transition-all cursor-pointer flex flex-col"
                  style={{ borderColor: lp.theme.borderColor || '#e8d5b7' }}
                >
                  <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                    {lp.badgeText && (
                      <span
                        className="absolute top-3 right-3 z-10 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow"
                        style={{ backgroundColor: lp.theme.accentColor }}
                      >
                        {lp.badgeText}
                      </span>
                    )}
                    {lp.mainImage ? (
                      <img
                        src={lp.mainImage}
                        alt={lp.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageOff className="w-10 h-10" />
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                        <span>{lp.category}</span>
                        <span>{lp.offers.length} باقات عرض</span>
                      </div>
                      <h3 className="font-black text-base leading-snug text-slate-900">
                        {lp.title}{' '}
                        {lp.highlightTitle && (
                          <span style={{ color: lp.theme.primaryColor }}>{lp.highlightTitle}</span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {lp.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="tabular-nums">
                        <span className="text-[10px] text-slate-400 block">ابتداءً من</span>
                        <span className="text-lg font-black" style={{ color: lp.theme.primaryColor }}>
                          {formatDZD(lowestOffer)}
                        </span>
                        {defaultOffer?.comparePrice && (
                          <span className="text-[11px] text-slate-400 line-through mr-1.5">
                            {formatDZD(defaultOffer.comparePrice)}
                          </span>
                        )}
                      </div>

                      <span
                        className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                        style={{ backgroundColor: lp.theme.primaryColor }}
                      >
                        <span>عرض الصفحة والطلب</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Track Order Modal */}
      {trackOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl border border-[#e8d5b7]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">تتبع حالة طلبك</h3>
              <button
                onClick={() => setTrackOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTrackSearch} className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={trackQuery}
                onChange={e => setTrackQuery(e.target.value)}
                placeholder="DZ-9821A4B2"
                className="flex-1 p-3 rounded-xl border border-slate-300 text-center font-mono font-bold text-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={isTrackingLoading}
                className="px-5 py-3 rounded-xl text-white font-bold text-sm"
                style={{ backgroundColor: store.brandColor || '#754b2d' }}
              >
                {isTrackingLoading ? 'بحث...' : 'تتبع'}
              </button>
            </form>

            {trackError && <p className="text-xs font-bold text-rose-600 text-center">{trackError}</p>}

            {trackedResult && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="bg-[#f7f1e5] p-3.5 rounded-xl text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم الطلب:</span>
                    <strong className="font-mono">{trackedResult.orderNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الطلب:</span>
                    <strong>{trackedResult.bundleLabel}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الولاية:</span>
                    <strong>
                      {trackedResult.wilayaName}
                      {trackedResult.commune ? ` - ${trackedResult.commune}` : ''}
                    </strong>
                  </div>
                  {trackedResult.trackingCode && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">رمز الشحن:</span>
                      <strong className="font-mono">{trackedResult.trackingCode}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">الإجمالي:</span>
                    <strong className="tabular-nums">{formatDZD(trackedResult.total)}</strong>
                  </div>
                </div>

                {trackedResult.status === 'cancelled' ? (
                  <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold text-center">
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
                        <div key={s.label} className="flex flex-col items-center gap-1.5">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center ${
                              active ? 'text-white' : 'bg-slate-100 text-slate-400'
                            }`}
                            style={active ? { backgroundColor: store.brandColor || '#754b2d' } : undefined}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className={`text-[11px] font-bold ${active ? 'text-slate-900' : 'text-slate-400'}`}>
                            {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
