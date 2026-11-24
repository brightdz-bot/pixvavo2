import React, { useState, useEffect, useMemo } from 'react';
import {
  HEADING_FONTS,
  BODY_FONTS,
  DEFAULT_HEADING_FONT,
  DEFAULT_BODY_FONT,
  findFont,
  loadFonts
} from '../../data/fonts';
import { Store, WilayaRate, StoreApiConfig, PromoCoupon } from '../../types';
import { ALGERIA_WILAYAS, formatDZD } from '../../data/wilayas';
import {
  buildGoogleAppsScriptForStore,
  DEFAULT_WHATSAPP_CONFIRM_TEMPLATE,
  DEFAULT_WHATSAPP_SHIPPING_TEMPLATE
} from '../../services/integrations';
import { resizeImageToDataUrl, applyBrowserBranding } from '../../services/branding';
import { CUSTOM_DOMAIN_SQL_MIGRATION_SNIPPET } from '../../services/storage';
import { isValidCustomDomain, normalizeDomainHost } from '../../utils/urlRouting';
import {
  Palette,
  Truck,
  Store as StoreIcon,
  Save,
  CheckCircle2,
  Share2,
  Megaphone,
  Code2,
  Copy,
  Check,
  X,
  TicketPercent,
  Plus,
  Trash2,
  MessageSquareText,
  RotateCcw,
  Power,
  Image as ImageIcon,
  Upload,
  Globe,
  Database,
  AlertCircle
} from 'lucide-react';

interface Props {
  store: Store;
  apiConfig?: StoreApiConfig | null;
  needsDomainSql?: boolean;
  onDismissDomainSql?: () => void;
  onSaveSettings: (
    updatedStore: Store,
    apiExtras?: Pick<
      StoreApiConfig,
      'promoCoupons' | 'whatsappConfirmTemplate' | 'whatsappShippingTemplate' | 'faviconUrl'
    >
  ) => void;
  onSaveStoreExtras?: (
    patch: Partial<
      Pick<
        StoreApiConfig,
        'promoCoupons' | 'whatsappConfirmTemplate' | 'whatsappShippingTemplate' | 'faviconUrl'
      >
    >,
    successMsg?: string
  ) => Promise<void> | void;
}

const BRAND_PALETTES = [
  { name: 'الخشبي الفاخر', hex: '#754b2d' },
  { name: 'زمردي جزائري', hex: '#059669' },
  { name: 'أزرق ملكي', hex: '#1d4ed8' },
  { name: 'ذهبي عنبري', hex: '#d97706' },
  { name: 'ذهبي هادئ', hex: '#c8a15b' },
  { name: 'قرمزي خاطف', hex: '#be123c' },
  { name: 'أسود كلاسيكي', hex: '#0f172a' }
];

const TEMPLATE_VARIABLES = [
  { key: '{customerName}', label: 'اسم الزبون' },
  { key: '{orderNumber}', label: 'رقم الطلب' },
  { key: '{storeName}', label: 'اسم المتجر' },
  { key: '{bundle}', label: 'المنتج / الباقة' },
  { key: '{total}', label: 'المجموع' },
  { key: '{wilaya}', label: 'الولاية' },
  { key: '{commune}', label: 'البلدية' },
  { key: '{deliveryType}', label: 'طريقة التوصيل' },
  { key: '{shippingCost}', label: 'تكلفة الشحن' },
  { key: '{trackingCode}', label: 'رمز التتبع' },
  { key: '{storePhone}', label: 'هاتف المتجر' }
];

export const SettingsTab: React.FC<Props> = ({
  store,
  apiConfig,
  needsDomainSql = false,
  onDismissDomainSql,
  onSaveSettings,
  onSaveStoreExtras
}) => {
  const [name, setName] = useState(store.name);
  const [customDomain, setCustomDomain] = useState(store.customDomain || '');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [copiedDomainSql, setCopiedDomainSql] = useState(false);
  const [copiedPreviewLink, setCopiedPreviewLink] = useState(false);
  const [description, setDescription] = useState(store.description || '');
  const [announcementText, setAnnouncementText] = useState(
    store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام'
  );
  const [logoUrl, setLogoUrl] = useState(store.logoUrl || '');
  const [faviconUrl, setFaviconUrl] = useState(apiConfig?.faviconUrl || store.faviconUrl || '');
  const [brandingUploadError, setBrandingUploadError] = useState<string | null>(null);
  const [phone, setPhone] = useState(store.phone || '');
  const [defaultWhatsapp, setDefaultWhatsapp] = useState(store.defaultWhatsapp || '');
  const [defaultPixelId, setDefaultPixelId] = useState(store.defaultPixelId || '');
  const [googleSheetWebhook, setGoogleSheetWebhook] = useState(store.googleSheetWebhook || '');
  const [brandColor, setBrandColor] = useState(store.brandColor || '#754b2d');
  useEffect(() => {
    loadFonts([...HEADING_FONTS, ...BODY_FONTS]);
  }, []);
  const [headingFont, setHeadingFont] = useState(store.storefrontHeadingFont || DEFAULT_HEADING_FONT);
  const [bodyFont, setBodyFont] = useState(store.storefrontBodyFont || DEFAULT_BODY_FONT);
  const [storefrontTheme, setStorefrontTheme] = useState<'dark' | 'light'>(
    store.storefrontTheme === 'light' ? 'light' : 'dark'
  );
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(
    store.freeShippingThreshold || 0
  );
  const [customRates, setCustomRates] = useState<Record<string, WilayaRate>>(
    store.customWilayaRates || {}
  );
  const [ratesResetToDefaults, setRatesResetToDefaults] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Apps Script Code Modal
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Promo Coupons
  const [promoCoupons, setPromoCoupons] = useState<PromoCoupon[]>(
    apiConfig?.promoCoupons || []
  );
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'fixed' | 'percent'>('fixed');
  const [newCouponValue, setNewCouponValue] = useState<string>('300');
  const [newCouponMinOrder, setNewCouponMinOrder] = useState<string>('0');
  const [couponError, setCouponError] = useState<string | null>(null);

  // Custom WhatsApp Message Templates
  const [whatsappConfirmTemplate, setWhatsappConfirmTemplate] = useState<string>(
    apiConfig?.whatsappConfirmTemplate || ''
  );
  const [whatsappShippingTemplate, setWhatsappShippingTemplate] = useState<string>(
    apiConfig?.whatsappShippingTemplate || ''
  );
  const [activeTemplateField, setActiveTemplateField] = useState<'confirm' | 'shipping'>('confirm');

  useEffect(() => {
    setLogoUrl(store.logoUrl || '');
    setCustomDomain(store.customDomain || '');
  }, [store.id, store.logoUrl, store.customDomain]);

  useEffect(() => {
    if (apiConfig) {
      setPromoCoupons(apiConfig.promoCoupons || []);
      setWhatsappConfirmTemplate(apiConfig.whatsappConfirmTemplate || '');
      setWhatsappShippingTemplate(apiConfig.whatsappShippingTemplate || '');
      setFaviconUrl(apiConfig.faviconUrl || '');
    }
  }, [apiConfig?.storeId, apiConfig?.updatedAt]);

  const handleBrandingFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'favicon'
  ) => {
    setBrandingUploadError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setBrandingUploadError('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 4 ميغابايت.');
      return;
    }
    try {
      const dataUrl =
        target === 'favicon'
          ? await resizeImageToDataUrl(file, 128, true)
          : await resizeImageToDataUrl(file, 320, false);
      if (target === 'favicon') {
        setFaviconUrl(dataUrl);
      } else {
        setLogoUrl(dataUrl);
      }
    } catch {
      setBrandingUploadError('تعذر معالجة الصورة، جرب صورة أخرى أو الصق رابطاً مباشراً.');
    }
  };

  const handleWilayaRateChange = (wilayaId: string, field: 'home' | 'stop', fee: number) => {
    const base = ALGERIA_WILAYAS.find(w => w.id === wilayaId);
    setRatesResetToDefaults(false);
    setCustomRates(prev => {
      const existing = prev[wilayaId] || {
        home: (!ratesResetToDefaults ? store.customWilayaFees?.[wilayaId] : undefined) ?? base?.homeFee ?? 600,
        stop: base?.stopFee ?? 400
      };
      return {
        ...prev,
        [wilayaId]: {
          ...existing,
          [field]: Math.max(0, fee)
        }
      };
    });
  };

  const handleApplyDefaultWilayaTariff = () => {
    setCustomRates({});
    setRatesResetToDefaults(true);
  };

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '';

  const storeAppsScript = useMemo(
    () =>
      buildGoogleAppsScriptForStore(
        {
          name: name.trim() || store.name,
          phone: phone.trim() || store.phone,
          defaultWhatsapp: defaultWhatsapp.trim() || store.defaultWhatsapp,
          customDomain: customDomain.trim() || store.customDomain,
          subdomain: store.subdomain
        },
        currentOrigin
      ),
    [
      name,
      phone,
      defaultWhatsapp,
      customDomain,
      store.name,
      store.phone,
      store.defaultWhatsapp,
      store.customDomain,
      store.subdomain,
      currentOrigin
    ]
  );

  const handleCopyAppsScript = async () => {
    try {
      await navigator.clipboard?.writeText(storeAppsScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleAddCoupon = async () => {
    setCouponError(null);
    const cleanCode = newCouponCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const numericVal = Math.max(0, Number(newCouponValue) || 0);
    const minOrd = Math.max(0, Number(newCouponMinOrder) || 0);

    if (cleanCode.length < 3) {
      setCouponError('يرجى إدخال رمز كوبون صحيح (3 أحرف إنجليزية أو أرقام على الأقل، مثال: SAVE10)');
      return;
    }
    if (numericVal <= 0) {
      setCouponError('يرجى إدخال قيمة خصم أكبر من 0');
      return;
    }
    if (newCouponType === 'percent' && numericVal > 95) {
      setCouponError('نسبة الخصم المئوية لا يمكن أن تتجاوز 95%');
      return;
    }
    if (promoCoupons.some(c => c.code.toUpperCase() === cleanCode)) {
      setCouponError('هذا الكود موجود بالفعل، اختر رمزاً آخر');
      return;
    }

    const added: PromoCoupon = {
      id: 'cpn_' + Math.random().toString(36).substring(2, 8),
      code: cleanCode,
      type: newCouponType,
      value: numericVal,
      minOrder: minOrd,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    const nextList = [added, ...promoCoupons];
    setPromoCoupons(nextList);
    setNewCouponCode('');
    if (onSaveStoreExtras) {
      await onSaveStoreExtras({ promoCoupons: nextList }, `تم تفعيل كوبون الخصم "${cleanCode}"`);
    }
  };

  const handleToggleCoupon = async (couponId: string) => {
    const nextList = promoCoupons.map(c =>
      c.id === couponId ? { ...c, isActive: !c.isActive } : c
    );
    setPromoCoupons(nextList);
    if (onSaveStoreExtras) {
      await onSaveStoreExtras({ promoCoupons: nextList }, 'تم تحديث حالة الكوبون');
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    const nextList = promoCoupons.filter(c => c.id !== couponId);
    setPromoCoupons(nextList);
    if (onSaveStoreExtras) {
      await onSaveStoreExtras({ promoCoupons: nextList }, 'تم حذف الكوبون');
    }
  };

  const insertTemplateVar = (token: string) => {
    if (activeTemplateField === 'confirm') {
      const base = whatsappConfirmTemplate || DEFAULT_WHATSAPP_CONFIRM_TEMPLATE;
      setWhatsappConfirmTemplate(`${base}${base.endsWith('\n') || !base ? '' : ' '}${token}`);
    } else {
      const base = whatsappShippingTemplate || DEFAULT_WHATSAPP_SHIPPING_TEMPLATE;
      setWhatsappShippingTemplate(`${base}${base.endsWith('\n') || !base ? '' : ' '}${token}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError(null);
    const normalizedDomain = normalizeDomainHost(customDomain);
    if (customDomain.trim() && !isValidCustomDomain(normalizedDomain)) {
      setDomainError('صيغة النطاق غير صحيحة. اكتب النطاق بدون مسافات مثل: myshop.com');
      return;
    }
    const cleanLogo = logoUrl.trim();
    const cleanFavicon = faviconUrl.trim();
    const updated: Store = {
      ...store,
      name: name.trim(),
      customDomain: normalizedDomain,
      description: description.trim(),
      announcementText: announcementText.trim(),
      logoUrl: cleanLogo,
      faviconUrl: cleanFavicon,
      phone: phone.trim(),
      defaultWhatsapp: defaultWhatsapp.trim(),
      defaultPixelId: defaultPixelId.trim(),
      googleSheetWebhook: googleSheetWebhook.trim(),
      brandColor,
      storefrontTheme,
      storefrontHeadingFont: headingFont,
      storefrontBodyFont: bodyFont,
      freeShippingThreshold: Number(freeShippingThreshold) || 0,
      customWilayaRates: customRates,
      ...(ratesResetToDefaults ? { customWilayaFees: {} } : {}),
      updatedAt: new Date().toISOString()
    };
    setCustomDomain(normalizedDomain);
    onSaveSettings(updated, {
      promoCoupons,
      whatsappConfirmTemplate: whatsappConfirmTemplate.trim(),
      whatsappShippingTemplate: whatsappShippingTemplate.trim(),
      faviconUrl: cleanFavicon
    });
    applyBrowserBranding({
      title: name.trim(),
      iconUrl: cleanFavicon || cleanLogo
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const normalizedDomainPreview = normalizeDomainHost(customDomain);
  const storePreviewUrl = `${currentOrigin}/?store=${encodeURIComponent(store.subdomain)}`;

  const handleCopyPreviewUrl = () => {
    const targetUrl =
      normalizedDomainPreview && isValidCustomDomain(normalizedDomainPreview)
        ? `https://${normalizedDomainPreview}`
        : storePreviewUrl;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(targetUrl).catch(() => {});
    }
    setCopiedPreviewLink(true);
    window.setTimeout(() => setCopiedPreviewLink(false), 2000);
  };

  const handleCopyDomainSql = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(CUSTOM_DOMAIN_SQL_MIGRATION_SNIPPET).catch(() => {});
    }
    setCopiedDomainSql(true);
    window.setTimeout(() => setCopiedDomainSql(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          إعدادات المتجر والتكاملات وأسعار التوصيل
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          اضبط هوية متجرك، كود Google Apps Script، كوبونات الخصم، نصوص رسائل الواتساب التلقائية، وأسعار التوصيل لكل ولاية
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>تم حفظ جميع إعدادات المتجر بنجاح!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Store Brand & Announcement */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-emerald-600" />
            <span>البيانات الأساسية والشريط العلوي</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">اسم المتجر</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">هاتف المتجر الرئيسي</label>
              <input
                type="text"
                dir="ltr"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0798353165"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
              <Megaphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>نص الشريط الإعلاني العلوي (يظهر أعلى صفحات الهبوط)</span>
            </label>
            <input
              type="text"
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">الوصف المختصر للمتجر</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>

          {/* Multi-Store Independent Custom Domain */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-extrabold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  <span>النطاق الخاص المستقل لهذا المتجر</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  اربط كل متجر بنطاقه المستقل ليفتح تلقائياً بهويته وصفحاته عند زيارة الزبائن لذلك النطاق من نفس المنصة.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyPreviewUrl}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedPreviewLink ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedPreviewLink ? 'تم نسخ الرابط' : 'نسخ رابط المتجر'}</span>
              </button>
            </div>

            {domainError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{domainError}</span>
              </div>
            )}

            {needsDomainSql && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <Database className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>لتخزين النطاق الخاص في قاعدة البيانات، شغّل كود التفعيل السريع مرة واحدة فقط.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyDomainSql}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedDomainSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedDomainSql ? 'تم النسخ' : 'نسخ كود التفعيل'}</span>
                    </button>
                    {onDismissDomainSql && (
                      <button
                        type="button"
                        onClick={onDismissDomainSql}
                        className="p-1 text-amber-700 dark:text-amber-300 rounded-lg cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <pre
                  dir="ltr"
                  className="p-2.5 rounded-lg bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto"
                >
                  {CUSTOM_DOMAIN_SQL_MIGRATION_SNIPPET}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">اسم النطاق الخاص (اختياري)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={customDomain}
                  onChange={e => {
                    setDomainError(null);
                    setCustomDomain(e.target.value);
                  }}
                  placeholder="myshop.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  يُنسخ تلقائياً في روابط صفحات الهبوط الخاصة بهذا المتجر عند الحفظ.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-1.5 text-[11px]">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  قيَم الربط لدى مزوّد النطاق وإعدادات الاستضافة:
                </div>
                <div className="flex items-center justify-between gap-2 font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                  <span>A (@)</span>
                  <span className="font-bold">76.76.21.21</span>
                </div>
                <div className="flex items-center justify-between gap-2 font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                  <span>CNAME (www)</span>
                  <span className="font-bold">cname.vercel-dns.com</span>
                </div>
                <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/70 text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                  {normalizedDomainPreview && isValidCustomDomain(normalizedDomainPreview)
                    ? `https://${normalizedDomainPreview}`
                    : storePreviewUrl}
                </div>
              </div>
            </div>
          </div>

          {/* Store Header Logo + Google Chrome Tab Favicon */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-extrabold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>صورة المتجر (أعلى اليمين) وأيقونة تبويب Google Chrome</span>
              </h4>
              {brandingUploadError && (
                <span className="text-[11px] font-bold text-rose-600">{brandingUploadError}</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Store Top-Right Logo */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                      صورة المتجر (أعلى اليمين)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      تظهر في الشريط العلوي لمتجرك وصفحات الهبوط على اليمين بجانب الاسم.
                    </p>
                  </div>
                  <div
                    className="w-11 h-11 rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
                    style={{ backgroundColor: brandColor || '#754b2d' }}
                  >
                    {logoUrl.trim() ? (
                      <img
                        src={logoUrl.trim()}
                        alt="شعار المتجر"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{(name || 'B').slice(0, 1)}</span>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  dir="ltr"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/store-logo.png"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />

                <div className="flex items-center gap-2">
                  <label className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع صورة الشعار من الجهاز</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleBrandingFileUpload(e, 'logo')}
                      className="hidden"
                    />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      title="إزالة صورة المتجر"
                      className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/70 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Chrome Tab Favicon */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                      صورة تبويب Google Chrome (Favicon)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      تظهر في أعلى تبويب المتصفح بجانب عنوان المتجر.
                    </p>
                  </div>
                  {/* Mini Chrome tab preview */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs max-w-[140px] shrink-0">
                    {faviconUrl.trim() || logoUrl.trim() ? (
                      <img
                        src={faviconUrl.trim() || logoUrl.trim()}
                        alt="أيقونة التبويب"
                        className="w-4 h-4 rounded-sm object-cover shrink-0"
                      />
                    ) : (
                      <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">
                      {name || 'متجرك'}
                    </span>
                  </div>
                </div>

                <input
                  type="text"
                  dir="ltr"
                  value={faviconUrl}
                  onChange={e => setFaviconUrl(e.target.value)}
                  placeholder="https://example.com/favicon.png"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />

                <div className="flex items-center gap-2">
                  <label className="flex-1 py-2 px-3 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع أيقونة التبويب من الجهاز</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleBrandingFileUpload(e, 'favicon')}
                      className="hidden"
                    />
                  </label>
                  {faviconUrl && (
                    <button
                      type="button"
                      onClick={() => setFaviconUrl('')}
                      title="إزالة أيقونة التبويب"
                      className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/70 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Default Integrations + Embedded Google Apps Script Button */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600" />
                <span>الإعدادات الافتراضية للتكاملات (WhatsApp · Meta Pixel · Google Sheets)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تُطبق تلقائياً على أي صفحة هبوط لا تحدد لنفسها قيماً خاصة.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setScriptModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:opacity-95 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Code2 className="w-4 h-4 text-emerald-400 dark:text-white" />
              <span>عرض ونسخ كود Google Apps Script المحدّث</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">رقم واتساب الافتراضي (مع رمز الدولة)</label>
              <input
                type="text"
                dir="ltr"
                value={defaultWhatsapp}
                onChange={e => setDefaultWhatsapp(e.target.value)}
                placeholder="213798353165"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">معرف Meta / Facebook Pixel الافتراضي</label>
              <input
                type="text"
                dir="ltr"
                value={defaultPixelId}
                onChange={e => setDefaultPixelId(e.target.value)}
                placeholder="1130382356394829"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">رابط Google Sheets Webhook (اختياري)</label>
            <input
              type="url"
              dir="ltr"
              value={googleSheetWebhook}
              onChange={e => setGoogleSheetWebhook(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
            />
          </div>
        </div>

        {/* Promo Codes / Coupons Manager */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <TicketPercent className="w-4 h-4 text-emerald-600" />
                <span>إدارة كوبونات وأكواد الخصم (Promo Codes)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                فعّل أكواد خصم لزبائنك في صفحات الهبوط بنسبة مئوية أو بمبلغ ثابت بالدينار الجزائري.
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {promoCoupons.filter(c => c.isActive).length} كوبون نشط
            </span>
          </div>

          {couponError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
              {couponError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold mb-1">رمز الكوبون</label>
              <input
                type="text"
                dir="ltr"
                value={newCouponCode}
                onChange={e => setNewCouponCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold uppercase"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold mb-1">نوع الخصم</label>
              <select
                value={newCouponType}
                onChange={e => setNewCouponType(e.target.value as 'fixed' | 'percent')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
              >
                <option value="fixed">مبلغ ثابت (دج)</option>
                <option value="percent">نسبة مئوية (%)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold mb-1">
                {newCouponType === 'percent' ? 'النسبة (%)' : 'القيمة (دج)'}
              </label>
              <input
                type="number"
                min="1"
                value={newCouponValue}
                onChange={e => setNewCouponValue(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold mb-1">حد أدنى (دج)</label>
              <input
                type="number"
                min="0"
                step="500"
                value={newCouponMinOrder}
                onChange={e => setNewCouponMinOrder(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="button"
                onClick={handleAddCoupon}
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>
            </div>
          </div>

          {promoCoupons.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              لا توجد كوبونات خصم مضافة بعد. أنشئ أول كوبون أعلاه لتقديم خصومات لزبائنك.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {promoCoupons.map(c => (
                <div
                  key={c.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    c.isActive
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/70'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-70'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        {c.code}
                      </span>
                      <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        {c.type === 'percent' ? `خصم ${c.value}%` : `خصم ${formatDZD(c.value)}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {c.minOrder && c.minOrder > 0
                        ? `الحد الأدنى للطلب: ${formatDZD(c.minOrder)}`
                        : 'بدون حد أدنى للطلب'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleCoupon(c.id)}
                      title={c.isActive ? 'تعطيل الكوبون' : 'تفعيل الكوبون'}
                      className={`p-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                        c.isActive
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                          : 'border-slate-300 bg-white text-slate-500 dark:bg-slate-800'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCoupon(c.id)}
                      title="حذف الكوبون"
                      className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/70 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Automatic WhatsApp Message Templates */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-emerald-600" />
                <span>تخصيص نصوص رسائل الواتساب التلقائية</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تُستخدم هذه القوالب في أزرار تأكيد الطلب وتتبعه عبر واتساب، وكذلك عند الإرسال الآلي عبر WhatsApp API.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 block">
              اضغط على أي متغير لإدراجه في الرسالة المحددة ({activeTemplateField === 'confirm' ? 'رسالة التأكيد' : 'رسالة التتبع والشحن'}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertTemplateVar(v.key)}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span className="font-mono text-emerald-700 dark:text-emerald-400" dir="ltr">
                    {v.key}
                  </span>
                  <span className="text-slate-500">({v.label})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold">نص رسالة تأكيد الطلب الجديد</label>
                <button
                  type="button"
                  onClick={() => setWhatsappConfirmTemplate(DEFAULT_WHATSAPP_CONFIRM_TEMPLATE)}
                  className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>تعبئة الافتراضي</span>
                </button>
              </div>
              <textarea
                rows={6}
                onFocus={() => setActiveTemplateField('confirm')}
                value={whatsappConfirmTemplate}
                onChange={e => setWhatsappConfirmTemplate(e.target.value)}
                placeholder={DEFAULT_WHATSAPP_CONFIRM_TEMPLATE}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed ${
                  activeTemplateField === 'confirm'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/15'
                    : 'border-slate-300 dark:border-slate-700'
                } bg-white dark:bg-slate-800`}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold">نص رسالة الشحن ورمز التتبع</label>
                <button
                  type="button"
                  onClick={() => setWhatsappShippingTemplate(DEFAULT_WHATSAPP_SHIPPING_TEMPLATE)}
                  className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>تعبئة الافتراضي</span>
                </button>
              </div>
              <textarea
                rows={6}
                onFocus={() => setActiveTemplateField('shipping')}
                value={whatsappShippingTemplate}
                onChange={e => setWhatsappShippingTemplate(e.target.value)}
                placeholder={DEFAULT_WHATSAPP_SHIPPING_TEMPLATE}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed ${
                  activeTemplateField === 'shipping'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/15'
                    : 'border-slate-300 dark:border-slate-700'
                } bg-white dark:bg-slate-800`}
              />
            </div>
          </div>
        </div>

        {/* Storefront appearance: theme mode */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600" />
            <span>مظهر واجهة المتجر</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'dark', label: 'داكن فاخر', bg: '#0d0f0e', fg: '#efe9dc', line: '#2a2f2b' },
              { id: 'light', label: 'فاتح كلاسيكي', bg: '#fbf8f2', fg: '#2a2118', line: '#e6dccb' }
            ] as const).map(t => (
              <button
                type="button"
                key={t.id}
                onClick={() => setStorefrontTheme(t.id)}
                aria-pressed={storefrontTheme === t.id}
                className={`rounded-xl border p-3 text-right cursor-pointer transition-colors ${
                  storefrontTheme === t.id
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div
                  className="rounded-lg p-3 mb-2 space-y-2"
                  style={{ backgroundColor: t.bg, border: `1px solid ${t.line}` }}
                >
                  <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: t.fg }} />
                  <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: t.line }} />
                  <div className="h-5 w-16 rounded-full" style={{ backgroundColor: brandColor }} />
                </div>
                <span className="text-xs font-bold">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            يتغير مظهر الصفحة الرئيسية للمتجر بعد حفظ الإعدادات. لون التمييز يؤخذ من لون الهوية في الأسفل.
          </p>
        </div>

        {/* Storefront fonts */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600" />
            <span>خطوط واجهة المتجر</span>
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 text-xs font-semibold block">
              <span>خط العناوين</span>
              <select
                value={headingFont}
                onChange={e => setHeadingFont(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {HEADING_FONTS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold block">
              <span>خط النصوص</span>
              <select
                value={bodyFont}
                onChange={e => setBodyFont(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {BODY_FONTS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-1"
            dir="rtl"
          >
            <p
              className="text-xl font-bold"
              style={{ fontFamily: `${findFont(HEADING_FONTS, headingFont, DEFAULT_HEADING_FONT).family}, sans-serif` }}
            >
              منتجات مختارة بعناية، توصيل لكل الولايات
            </p>
            <p
              className="text-sm text-slate-500"
              style={{ fontFamily: `${findFont(BODY_FONTS, bodyFont, DEFAULT_BODY_FONT).family}, sans-serif` }}
            >
              الدفع عند الاستلام بعد معاينة المنتج، والتوصيل خلال أيام قليلة.
            </p>
          </div>
        </div>

        {/* Storefront Catalog Brand Color */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600" />
            <span>لون الهوية للواجهة الرئيسية للمتجر</span>
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {BRAND_PALETTES.map(p => (
              <button
                type="button"
                key={p.hex}
                onClick={() => setBrandColor(p.hex)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  brandColor === p.hex
                    ? 'border-slate-900 dark:border-white ring-2 ring-emerald-500/30 font-bold'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.hex }} />
                <span>{p.name}</span>
              </button>
            ))}
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-6 h-6 border-0 rounded cursor-pointer p-0 bg-transparent"
              />
              <span className="font-mono text-xs">{brandColor}</span>
            </div>
          </div>
        </div>

        {/* Dual Wilaya Delivery Fees (Home + Stop Desk) */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>أسعار التوصيل للمنزل ومكتب الشحن (58 ولاية)</span>
            </h3>
            <button
              type="button"
              onClick={handleApplyDefaultWilayaTariff}
              className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تطبيق التسعيرة الافتراضية المحدّثة</span>
            </button>
          </div>

          <div className="max-w-sm">
            <label className="block text-xs font-bold mb-1">
              حد التوصيل المجاني بالدينار (0 = معطّل):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="500"
                value={freeShippingThreshold}
                onChange={e => setFreeShippingThreshold(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
              />
              <span className="text-xs font-bold text-slate-500">دج</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pl-1">
              {ALGERIA_WILAYAS.map(w => {
                const homeFee =
                  customRates[w.id]?.home ??
                  (!ratesResetToDefaults ? store.customWilayaFees?.[w.id] : undefined) ??
                  w.homeFee;
                const stopFee = customRates[w.id]?.stop ?? w.stopFee;
                return (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <strong className="font-bold block truncate">
                        {w.code} - {w.nameAr}
                      </strong>
                      <span className="text-[10px] text-slate-400">{w.communes.length} بلدية</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20">
                        <span className="block text-[10px] text-slate-500 mb-0.5 text-center">للمنزل</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={homeFee}
                          onChange={e => handleWilayaRateChange(w.id, 'home', Number(e.target.value) || 0)}
                          className="w-full p-1.5 text-center font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                      <div className="w-20">
                        <span className="block text-[10px] text-slate-500 mb-0.5 text-center">Stop Desk</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={stopFee}
                          onChange={e => handleWilayaRateChange(w.id, 'stop', Number(e.target.value) || 0)}
                          className="w-full p-1.5 text-center font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>حفظ جميع الإعدادات</span>
          </button>
        </div>
      </form>

      {/* Google Apps Script Code Viewer Modal */}
      {scriptModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setScriptModalOpen(false);
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    كود الربط المحدّث الخاص بمتجر {name.trim() || store.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    مخصّص تلقائياً باسم متجرك ورقم واتسابه ونطاقه، ويشمل الطلبات المؤكدة والطلبات المتروكة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <strong className="block text-emerald-600 mb-0.5">1. فتح المحرر</strong>
                  <span>من ملف Google Sheet اختر Extensions ثم Apps Script.</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <strong className="block text-emerald-600 mb-0.5">2. اللصق والحفظ</strong>
                  <span>امسح الكود القديم، الصق الكود أدناه واضغط Ctrl+S.</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <strong className="block text-emerald-600 mb-0.5">3. النشر كـ Web App</strong>
                  <span>Deploy &gt; New deployment &gt; Web app بصلاحية Anyone ثم انسخ الرابط.</span>
                </div>
              </div>

              <div className="relative">
                <pre
                  dir="ltr"
                  className="p-4 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[360px] border border-slate-800"
                >
                  <code>{storeAppsScript}</code>
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/80">
              <button
                type="button"
                onClick={handleCopyAppsScript}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
              >
                {copiedScript ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedScript ? 'تم نسخ الكود بنجاح!' : 'نسخ كود Google Apps Script'}</span>
              </button>
              <button
                type="button"
                onClick={() => setScriptModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
