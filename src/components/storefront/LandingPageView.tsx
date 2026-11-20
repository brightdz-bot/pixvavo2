import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useSpring } from 'motion/react';
import { Store, LandingPage, DeliveryType, OrderStatus } from '../../types';
import { ALGERIA_WILAYAS, formatDZD } from '../../data/wilayas';
import { storage } from '../../services/storage';
import { applyBrowserBranding } from '../../services/branding';
import {
  captureMetaAttributionCookies,
  trackMetaPixelPage,
  trackMetaPixelInitiateCheckout,
  trackMetaPixelPurchase,
  sendOrderToGoogleSheet,
  updateOrderInGoogleSheet,
  fetchOrderFromGoogleSheet,
  buildOrderConfirmationWhatsAppUrl,
  buildOrderTrackingWhatsAppUrl,
  triggerAutoOrderWhatsApp
} from '../../services/integrations';
import { validateAlgerianPhone, validateCustomerName } from '../../utils/orderValidation';
import { SmartImage } from '../common/SmartImage';
import {
  Search,
  ShoppingCart,
  ShoppingBag,
  Star,
  Flame,
  Check,
  Clock,
  Truck,
  PackageOpen,
  User as UserIcon,
  Phone,
  Home,
  Building2,
  CheckCircle2,
  Copy,
  ArrowRight,
  Receipt,
  AlertCircle,
  MessageCircle,
  X,
  ImageOff,
  Pencil,
  Tag,
  TicketPercent,
  MapPin
} from 'lucide-react';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

interface Props {
  store: Store;
  page: LandingPage;
  onBackToCatalog?: () => void;
}

interface TrackedOrderState {
  orderNumber: string;
  landingPageId?: string;
  customerFirstName: string;
  wilayaId?: string;
  wilayaName: string;
  commune?: string;
  deliveryType?: DeliveryType;
  bundleLabel: string;
  total: number;
  status: OrderStatus;
  trackingCode?: string;
}

export const LandingPageView: React.FC<Props> = ({
  store,
  page,
  onBackToCatalog
}) => {
  const { scrollYProgress } = useScroll();
  const smoothScrollProgress = useSpring(scrollYProgress, {
    stiffness: 320,
    damping: 32,
    restDelta: 0.001
  });

  const theme = page.theme;
  const offers = page.offers && page.offers.length > 0 ? page.offers : [];
  const defaultOffer = offers.find(o => o.isDefault) || offers[0];

  const allGallery = useMemo(() => {
    const imgs = [page.mainImage, ...(page.galleryImages || [])].filter(Boolean);
    return Array.from(new Set(imgs)).slice(0, 4);
  }, [page.mainImage, page.galleryImages]);

  const [activeImage, setActiveImage] = useState<string>(page.mainImage || allGallery[0] || '');
  const [imgError, setImgError] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>(defaultOffer?.id || '');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    (page.variants || []).forEach(v => {
      if (v.options && v.options.length > 0) init[v.name] = v.options[0];
    });
    return init;
  });

  // Checkout state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedWilayaId, setSelectedWilayaId] = useState('16');
  const [selectedCommune, setSelectedCommune] = useState('الجزائر الوسطى');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('home');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [botTrapField, setBotTrapField] = useState('');
  const formMountedAtRef = useRef<number>(Date.now());
  const submitLockRef = useRef<boolean>(false);

  // Automatic Abandoned Checkout Capture Session Refs
  const createAbandonedSessionId = () =>
    `AB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const abandonedSessionIdRef = useRef<string>(createAbandonedSessionId());
  const orderCompletedForSessionRef = useRef<boolean>(false);
  const lastAbandonedFingerprintRef = useRef<string>('');
  const abandonedTimerRef = useRef<number | null>(null);

  // Promo Coupon State
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    type: 'fixed' | 'percent';
    value: number;
    minOrder?: number;
    discount: number;
    reason: string;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);

  // Custom Store WhatsApp Templates & Public Pixel IDs Fallback
  const [waTemplates, setWaTemplates] = useState<{ confirm: string; shipping: string }>({
    confirm: '',
    shipping: ''
  });
  const [publicPixelIds, setPublicPixelIds] = useState<{ meta: string; tiktok: string }>({
    meta: '',
    tiktok: ''
  });
  const trackedPageViewKeyRef = useRef<string>('');
  const trackedInitiateCheckoutRef = useRef<boolean>(false);

  // Modals & Tracking Mode
  const [isTrackingMode, setIsTrackingMode] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchingOrder, setIsSearchingOrder] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrderState | null>(null);

  const [successModalData, setSuccessModalData] = useState<{
    orderNumber: string;
    bundleDetails: string;
    whatsappUrl: string;
    tracked: TrackedOrderState;
  } | null>(null);
  const [lastOrderWhatsappUrl, setLastOrderWhatsappUrl] = useState<string>('');

  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [orderPromptModalOpen, setOrderPromptModalOpen] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

  // Inline editing of bundle & destination in tracking view (for pending orders)
  const [isEditingTrackedOrder, setIsEditingTrackedOrder] = useState(false);
  const [editOfferChoices, setEditOfferChoices] = useState(offers);
  const [editOfferId, setEditOfferId] = useState('');
  const [editWilayaId, setEditWilayaId] = useState('16');
  const [editCommune, setEditCommune] = useState('');
  const [editDeliveryType, setEditDeliveryType] = useState<DeliveryType>('home');
  const [isSavingTrackedEdit, setIsSavingTrackedEdit] = useState(false);
  const [trackedEditError, setTrackedEditError] = useState<string | null>(null);
  const [trackedEditSuccess, setTrackedEditSuccess] = useState<string | null>(null);
  const [dbEditedInSession, setDbEditedInSession] = useState(false);
  const lastSheetSnapshotRef = useRef<{
    bundleLabel?: string;
    wilayaName?: string;
    commune?: string;
    deliveryType?: DeliveryType;
    total?: number;
  } | null>(null);

  const effectivePixelId =
    page.integrations?.pixelId?.trim() ||
    store.defaultPixelId?.trim() ||
    publicPixelIds.meta.trim();
  const effectiveTiktokPixelId =
    page.integrations?.tiktokPixelId?.trim() ||
    store.tiktokPixelId?.trim() ||
    publicPixelIds.tiktok.trim();
  const effectiveWhatsapp =
    page.integrations?.whatsappNumber?.trim() || store.defaultWhatsapp?.trim() || store.phone?.trim();
  const effectiveWebhook =
    page.integrations?.googleSheetWebhook?.trim() || store.googleSheetWebhook?.trim();

  useEffect(() => {
    setActiveImage(page.mainImage || allGallery[0] || '');
    setImgError(false);
  }, [page.id, page.mainImage, allGallery]);

  // Sync on page switch
  useEffect(() => {
    captureMetaAttributionCookies();
    setActiveImage(page.mainImage || allGallery[0] || '');
    setImgError(false);
    const def = page.offers.find(o => o.isDefault) || page.offers[0];
    setSelectedOfferId(def?.id || '');
    const initVars: Record<string, string> = {};
    (page.variants || []).forEach(v => {
      if (v.options && v.options.length > 0) initVars[v.name] = v.options[0];
    });
    setSelectedVariants(initVars);
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError(null);
    setIsTrackingMode(false);
    setSuccessModalData(null);
    setLastOrderWhatsappUrl('');
    setFormError(null);
    setIsEditingTrackedOrder(false);
    setTrackedEditError(null);
    setTrackedEditSuccess(null);
    trackedPageViewKeyRef.current = '';
    trackedInitiateCheckoutRef.current = false;
    formMountedAtRef.current = Date.now();
    setBotTrapField('');
    abandonedSessionIdRef.current = createAbandonedSessionId();
    orderCompletedForSessionRef.current = false;
    lastAbandonedFingerprintRef.current = '';
    if (abandonedTimerRef.current) {
      window.clearTimeout(abandonedTimerRef.current);
      abandonedTimerRef.current = null;
    }
  }, [page.id]);

  // Fire PageView + ViewContent once per page/pixel resolution (supports async public-settings fallback)
  useEffect(() => {
    const def = page.offers.find(o => o.isDefault) || page.offers[0];
    const trackKey = `${page.id}|${effectivePixelId}|${effectiveTiktokPixelId}`;
    if (trackedPageViewKeyRef.current === trackKey) return;
    if (!effectivePixelId && !effectiveTiktokPixelId && trackedPageViewKeyRef.current) return;
    trackedPageViewKeyRef.current = trackKey;
    trackMetaPixelPage(effectivePixelId, page.title, page.category, def?.price || 0, {
      storeId: store.id,
      contentId: page.id,
      tiktokPixelId: effectiveTiktokPixelId
    });
  }, [page.id, page.title, page.category, store.id, effectivePixelId, effectiveTiktokPixelId]);

  // Fetch non-secret custom WhatsApp templates, browser favicon & public Pixel IDs for store
  useEffect(() => {
    let active = true;
    const localCfg = storage.getLocalStoreApiConfig(store.id);
    if (localCfg) {
      setWaTemplates({
        confirm: localCfg.whatsappConfirmTemplate || '',
        shipping: localCfg.whatsappShippingTemplate || ''
      });
      setPublicPixelIds(prev => ({
        meta: localCfg.metaPixelId || prev.meta,
        tiktok: localCfg.tiktokPixelId || prev.tiktok
      }));
    }
    applyBrowserBranding({
      title: `${page.title} | ${store.name}`,
      iconUrl: localCfg?.faviconUrl || store.logoUrl
    });
    fetch(`/api/store/public-settings?storeId=${encodeURIComponent(store.id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!active || !data?.ok) return;
        setWaTemplates(prev => ({
          confirm: data.whatsappConfirmTemplate || prev.confirm,
          shipping: data.whatsappShippingTemplate || prev.shipping
        }));
        if (data.metaPixelId || data.tiktokPixelId) {
          setPublicPixelIds(prev => ({
            meta: data.metaPixelId || prev.meta,
            tiktok: data.tiktokPixelId || prev.tiktok
          }));
        }
        if (data.faviconUrl || store.logoUrl) {
          applyBrowserBranding({
            title: `${page.title} | ${store.name}`,
            iconUrl: data.faviconUrl || store.logoUrl
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [store.id, store.name, store.logoUrl, page.title]);

  // Sync commune list when wilaya changes
  const selectedWilaya = useMemo(
    () => ALGERIA_WILAYAS.find(w => w.id === selectedWilayaId) || ALGERIA_WILAYAS[15],
    [selectedWilayaId]
  );

  useEffect(() => {
    if (selectedWilaya.communes.length > 0 && !selectedWilaya.communes.includes(selectedCommune)) {
      setSelectedCommune(selectedWilaya.communes[0]);
    }
  }, [selectedWilaya]);

  const selectedOffer = useMemo(
    () => offers.find(o => o.id === selectedOfferId) || offers[0],
    [offers, selectedOfferId]
  );

  // Compute home and stop desk fee for selected wilaya considering store overrides
  const getDeliveryFeeForWilaya = (wilayaId: string, type: DeliveryType, subtotal: number) => {
    const w = ALGERIA_WILAYAS.find(x => x.id === wilayaId) || ALGERIA_WILAYAS[15];
    let fee = type === 'stop' ? w.stopFee : w.homeFee;
    const customRate = store.customWilayaRates?.[wilayaId];
    if (customRate && customRate[type] !== undefined) {
      fee = customRate[type];
    } else if (type === 'home' && store.customWilayaFees?.[wilayaId] !== undefined) {
      fee = store.customWilayaFees[wilayaId];
    }
    if (store.freeShippingThreshold > 0 && subtotal >= store.freeShippingThreshold) {
      fee = 0;
    }
    return fee;
  };

  const productPrice = selectedOffer?.price || 0;
  const activeDiscountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.minOrder && productPrice < appliedPromo.minOrder) return 0;
    const raw =
      appliedPromo.type === 'percent'
        ? Math.round((productPrice * Math.min(100, Math.max(0, appliedPromo.value))) / 100)
        : Math.max(0, appliedPromo.value);
    return Math.min(productPrice, raw);
  }, [appliedPromo, productPrice]);

  const discountedProductPrice = Math.max(0, productPrice - activeDiscountAmount);
  const homeFee = getDeliveryFeeForWilaya(selectedWilaya.id, 'home', discountedProductPrice);
  const stopFee = getDeliveryFeeForWilaya(selectedWilaya.id, 'stop', discountedProductPrice);
  const shippingCost = deliveryType === 'stop' ? stopFee : homeFee;
  const grandTotal = discountedProductPrice + shippingCost;

  const variantSummary = useMemo(() => {
    const vars = page.variants || [];
    if (vars.length === 0) return '';
    return vars
      .map(v => {
        const picked = selectedVariants[v.name] || v.options?.[0] || '';
        return picked ? `${v.name}: ${picked}` : '';
      })
      .filter(Boolean)
      .join(' • ');
  }, [page.variants, selectedVariants]);

  const buildAbandonedPayload = () => {
    const phoneCheck = validateAlgerianPhone(phone);
    if (
      !phoneCheck.valid ||
      isTrackingMode ||
      isSubmitting ||
      orderCompletedForSessionRef.current ||
      botTrapField.trim().length > 0
    ) {
      return null;
    }
    return {
      storeId: store.id,
      sessionId: abandonedSessionIdRef.current,
      customerPhone: phoneCheck.normalized,
      customerName: fullName.trim() || undefined,
      landingPageId: page.id,
      landingPageTitle: page.title,
      offerId: selectedOffer?.id,
      bundleLabel: selectedOffer?.title || page.title,
      variantLabel: variantSummary || undefined,
      wilayaId: selectedWilaya.id,
      wilayaName: selectedWilaya.nameAr,
      commune: selectedCommune || undefined,
      deliveryType,
      subtotal: discountedProductPrice,
      shippingFee: shippingCost,
      total: grandTotal,
      honeypot: botTrapField
    };
  };

  const triggerImmediateAbandonedCapture = () => {
    const payload = buildAbandonedPayload();
    if (!payload) return;
    const fingerprint = JSON.stringify([
      payload.customerPhone,
      payload.customerName || '',
      payload.offerId || '',
      payload.variantLabel || '',
      payload.wilayaId || '',
      payload.commune || '',
      payload.deliveryType,
      payload.total
    ]);
    if (fingerprint === lastAbandonedFingerprintRef.current) return;
    lastAbandonedFingerprintRef.current = fingerprint;
    void storage.captureAbandonedOrder(payload, effectiveWebhook);
  };

  // Debounced silent capture whenever customer enters a valid Algerian mobile number or updates form fields
  useEffect(() => {
    if (abandonedTimerRef.current) {
      window.clearTimeout(abandonedTimerRef.current);
      abandonedTimerRef.current = null;
    }
    const payload = buildAbandonedPayload();
    if (!payload) return;

    abandonedTimerRef.current = window.setTimeout(() => {
      triggerImmediateAbandonedCapture();
    }, 1800);

    return () => {
      if (abandonedTimerRef.current) {
        window.clearTimeout(abandonedTimerRef.current);
        abandonedTimerRef.current = null;
      }
    };
  }, [
    phone,
    fullName,
    selectedWilayaId,
    selectedCommune,
    deliveryType,
    selectedOfferId,
    variantSummary,
    discountedProductPrice,
    shippingCost,
    grandTotal,
    isTrackingMode,
    isSubmitting,
    botTrapField,
    effectiveWebhook
  ]);

  // Beacon fallback if customer closes tab or switches apps immediately after typing their phone
  const latestAbandonedPayloadRef = useRef<ReturnType<typeof buildAbandonedPayload>>(null);
  latestAbandonedPayloadRef.current = buildAbandonedPayload();

  useEffect(() => {
    const handleLeave = () => {
      const payload = latestAbandonedPayloadRef.current;
      if (!payload) return;
      storage.captureAbandonedOrderBeacon(payload);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleLeave();
      }
    };
    window.addEventListener('pagehide', handleLeave);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handleLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleApplyPromo = async () => {
    setPromoError(null);
    const clean = promoInput.trim().toUpperCase();
    if (!clean) {
      setPromoError('يرجى إدخال رمز الكوبون أولاً');
      return;
    }

    const validateLocally = () => {
      const localCfg = storage.getLocalStoreApiConfig(store.id);
      const list = localCfg?.promoCoupons || [];
      const found = list.find(c => String(c.code || '').trim().toUpperCase() === clean);
      if (!found) {
        return { valid: false, message: 'كود الخصم غير صحيح أو منتهي الصلاحية' };
      }
      if (!found.isActive) {
        return { valid: false, message: 'هذا الكوبون متوقف حالياً' };
      }
      if (found.minOrder && found.minOrder > 0 && productPrice < found.minOrder) {
        return {
          valid: false,
          message: `هذا الكوبون يتطلب حداً أدنى للطلب قدره ${formatDZD(found.minOrder)}`
        };
      }
      const discount =
        found.type === 'percent'
          ? Math.min(productPrice, Math.round((productPrice * found.value) / 100))
          : Math.min(productPrice, found.value);
      return {
        valid: true,
        code: found.code,
        type: found.type,
        value: found.value,
        minOrder: found.minOrder || 0,
        discount,
        reason:
          found.type === 'percent'
            ? `كوبون ${found.code} (${found.value}%)`
            : `كوبون ${found.code} (-${found.value} دج)`
      };
    };

    setIsValidatingPromo(true);
    try {
      const res = await fetch('/api/store/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, code: clean, subtotal: productPrice })
      });
      const data = await res.json();
      if (data?.valid) {
        setAppliedPromo({
          code: data.code,
          type: data.type,
          value: Number(data.value) || 0,
          discount: Number(data.discount) || 0,
          reason: data.reason || `كوبون ${data.code}`
        });
        setIsValidatingPromo(false);
        return;
      }
      if (data?.notFoundOnServer) {
        const localRes = validateLocally();
        if (localRes.valid && localRes.code) {
          setAppliedPromo({
            code: localRes.code,
            type: localRes.type!,
            value: localRes.value!,
            minOrder: localRes.minOrder,
            discount: localRes.discount!,
            reason: localRes.reason!
          });
          setIsValidatingPromo(false);
          return;
        }
        setPromoError(localRes.message || 'كود الخصم غير صحيح');
        setIsValidatingPromo(false);
        return;
      }
      setPromoError(data?.message || 'كود الخصم غير صالح');
    } catch {
      const localRes = validateLocally();
      if (localRes.valid && localRes.code) {
        setAppliedPromo({
          code: localRes.code,
          type: localRes.type!,
          value: localRes.value!,
          minOrder: localRes.minOrder,
          discount: localRes.discount!,
          reason: localRes.reason!
        });
      } else {
        setPromoError(localRes.message || 'تعذر التحقق من الكوبون حالياً');
      }
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 88;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  };

  const scrollToElementWhenReady = (id: string) => {
    if (typeof window === 'undefined') return;
    const startedAt = Date.now();
    const attempt = () => {
      const el = document.getElementById(id);
      if (el) {
        const offset = 88;
        const y = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        window.setTimeout(() => {
          const settled = document.getElementById(id);
          if (!settled) return;
          const nextY = settled.getBoundingClientRect().top + window.scrollY - offset;
          if (Math.abs(window.scrollY - nextY) > 24) {
            window.scrollTo({ top: Math.max(0, nextY), behavior: 'smooth' });
          }
        }, 260);
        return;
      }
      if (Date.now() - startedAt < 1000) {
        window.requestAnimationFrame(attempt);
      }
    };
    window.requestAnimationFrame(attempt);
  };

  useEffect(() => {
    if (isTrackingMode && trackedOrder?.orderNumber) {
      scrollToElementWhenReady('tracking-container');
    }
  }, [isTrackingMode, trackedOrder?.orderNumber]);

  const handleHeaderOrderClick = () => {
    if (isTrackingMode) {
      setNewOrderModalOpen(true);
    } else {
      scrollToElement('form-container');
    }
  };

  const resetToNewOrder = (targetSection: 'form-container' | 'offers-section' = 'form-container') => {
    setIsTrackingMode(false);
    setTrackedOrder(null);
    setLastOrderWhatsappUrl('');
    setNewOrderModalOpen(false);
    setOrderPromptModalOpen(false);
    setFullName('');
    setPhone('');
    setFormError(null);
    abandonedSessionIdRef.current = createAbandonedSessionId();
    orderCompletedForSessionRef.current = false;
    lastAbandonedFingerprintRef.current = '';
    scrollToElementWhenReady(targetSection);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    setFormError(null);

    // 1. Silent bot honeypot check
    if (botTrapField.trim().length > 0) {
      setFormError('تعذر تأكيد الطلب، يرجى إعادة تحميل الصفحة والمحاولة مجدداً');
      return;
    }

    // 2. Minimum human fill-time guard (blocks instant auto-submit bots)
    const fillTimeMs = Date.now() - formMountedAtRef.current;
    if (fillTimeMs < 1800) {
      setFormError('يرجى مراجعة بياناتك والتأكد منها ثم الضغط على تأكيد الطلب');
      return;
    }

    if (!selectedOffer) {
      setFormError('لا يوجد عرض متاح لهذه الصفحة حالياً');
      return;
    }

    // 3. Strict customer name & Algerian mobile validation
    const nameCheck = validateCustomerName(fullName);
    if (!nameCheck.valid) {
      setFormError(nameCheck.error || 'يرجى إدخال الاسم الكامل بشكل صحيح');
      return;
    }
    const phoneCheck = validateAlgerianPhone(phone);
    if (!phoneCheck.valid) {
      setFormError(
        phoneCheck.error || 'يرجى إدخال رقم هاتف جزائري حقيقي (10 أرقام يبدأ بـ 05 أو 06 أو 07)'
      );
      return;
    }
    const cleanName = nameCheck.cleaned;
    const cleanPhone = phoneCheck.normalized;

    if (!selectedCommune) {
      setFormError('يرجى اختيار البلدية');
      return;
    }

    // 4. Browser-side duplicate / rapid-spam cooldown guard (3 min per phone+page, max 4 per 30 min per store)
    const cooldownKey = `brightdz_order_cd_${store.id}`;
    const nowTs = Date.now();
    try {
      const rawHistory = localStorage.getItem(cooldownKey);
      const parsedHistory: Array<{ phone: string; pageId: string; ts: number }> = rawHistory
        ? JSON.parse(rawHistory)
        : [];
      const recent30m = Array.isArray(parsedHistory)
        ? parsedHistory.filter(item => item && nowTs - Number(item.ts || 0) < 30 * 60 * 1000)
        : [];
      const duplicateSamePhone = recent30m.find(
        item => item.phone === cleanPhone && item.pageId === page.id && nowTs - item.ts < 3 * 60 * 1000
      );
      if (duplicateSamePhone) {
        setFormError(
          'تم تسجيل طلبك بالفعل بهذا الرقم قبل قليل! لا حاجة لإعادة الإرسال، ويمكنك متابعة طلبك من خانة التتبع أعلاه.'
        );
        return;
      }
      if (recent30m.length >= 4) {
        setFormError(
          'تم إرسال عدة طلبات متتالية من هذا الجهاز خلال فترة قصيرة. يرجى الانتظار قليلاً أو التواصل معنا عبر واتساب.'
        );
        return;
      }
    } catch {
      // ignore storage errors
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    let res: Awaited<ReturnType<typeof storage.placeOrder>>;
    try {
      res = await storage.placeOrder({
        storeId: store.id,
        landingPageId: page.id,
        offerId: selectedOffer.id,
        customerName: cleanName,
        customerPhone: cleanPhone,
        wilayaId: selectedWilaya.id,
        wilayaName: selectedWilaya.nameAr,
        commune: selectedCommune,
        deliveryType,
        address: `${selectedWilaya.nameAr} - ${selectedCommune}${deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''}`,
        variantLabel: variantSummary || undefined,
        promoCode: appliedPromo?.code,
        discount: activeDiscountAmount,
        discountReason: appliedPromo?.reason,
        antiBot: { honeypot: botTrapField, fillTimeMs }
      });
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }

    if (!res.success || !res.order) {
      setFormError(res.error || 'تعذر تسجيل الطلب، يرجى التحقق من البيانات والمحاولة مجدداً');
      return;
    }

    // Record successful submission in browser cooldown cache
    try {
      const rawHistory = localStorage.getItem(cooldownKey);
      const parsedHistory: Array<{ phone: string; pageId: string; ts: number }> = rawHistory
        ? JSON.parse(rawHistory)
        : [];
      const recent = (Array.isArray(parsedHistory) ? parsedHistory : []).filter(
        item => item && nowTs - Number(item.ts || 0) < 30 * 60 * 1000
      );
      recent.push({ phone: cleanPhone, pageId: page.id, ts: nowTs });
      localStorage.setItem(cooldownKey, JSON.stringify(recent.slice(-10)));
    } catch {
      // ignore storage errors
    }

    const orderNum = res.order.orderNumber;
    // Mark current abandoned session as recovered & clean up from "الطلبات المتروكة" sheet
    if (abandonedTimerRef.current) {
      window.clearTimeout(abandonedTimerRef.current);
      abandonedTimerRef.current = null;
    }
    orderCompletedForSessionRef.current = true;
    void storage.markAbandonedOrderRecovered(
      store.id,
      abandonedSessionIdRef.current,
      orderNum,
      effectiveWebhook
    );

    const bundleDetails = `${selectedOffer.title}${variantSummary ? ` (${variantSummary})` : ''} (الكمية: ${selectedOffer.quantity})`;
    const finalTotalDisplay = activeDiscountAmount > 0 ? grandTotal : res.order.total;

    trackMetaPixelPurchase(effectivePixelId, bundleDetails, finalTotalDisplay, orderNum, {
      storeId: store.id,
      contentId: page.id,
      numItems: selectedOffer.quantity || 1,
      tiktokPixelId: effectiveTiktokPixelId,
      customerPhone: cleanPhone,
      customerName: cleanName,
      wilayaName: selectedWilaya.nameAr
    });

    triggerAutoOrderWhatsApp({
      storeId: store.id,
      storeName: store.name,
      phone: cleanPhone,
      orderNumber: orderNum,
      customerName: cleanName,
      bundleDetails,
      total: finalTotalDisplay,
      wilayaName: selectedWilaya.nameAr,
      commune: selectedCommune
    });

    sendOrderToGoogleSheet(effectiveWebhook, {
      orderId: orderNum,
      fullName: cleanName,
      phone: cleanPhone,
      wilaya: selectedWilaya.nameAr,
      commune: selectedCommune,
      deliveryType,
      orderDetails: bundleDetails,
      statusLabel: 'قيد التأكيد',
      shippingCost: res.order.shippingFee,
      productPrice,
      totalPrice: finalTotalDisplay,
      discount: activeDiscountAmount,
      discountReason: appliedPromo?.reason || '',
      trackingCode: ''
    });

    const whatsappUrl = buildOrderConfirmationWhatsAppUrl(
      effectiveWhatsapp,
      store.name,
      {
        orderNumber: orderNum,
        customerName: fullName.trim(),
        bundleDetails,
        deliveryType,
        shippingCost: res.order.shippingFee,
        total: finalTotalDisplay,
        wilayaName: selectedWilaya.nameAr,
        commune: selectedCommune
      },
      waTemplates.confirm
    );

    lastSheetSnapshotRef.current = null;
    setDbEditedInSession(false);
    setIsEditingTrackedOrder(false);
    setTrackedEditError(null);
    setTrackedEditSuccess(null);
    setSuccessModalData(null);
    setLastOrderWhatsappUrl(whatsappUrl);
    setTrackedOrder({
      orderNumber: orderNum,
      landingPageId: page.id,
      customerFirstName: fullName.trim().split(' ')[0],
      wilayaId: selectedWilaya.id,
      wilayaName: selectedWilaya.nameAr,
      commune: selectedCommune,
      deliveryType,
      bundleLabel: bundleDetails,
      total: finalTotalDisplay,
      status: 'new'
    });
    setIsTrackingMode(true);
    scrollToElementWhenReady('tracking-container');
  };

  const handleSearchOrder = async () => {
    setSearchError(null);
    const clean = searchInput.trim().toUpperCase();
    if (!clean) {
      setSearchError('يرجى إدخال رقم الطلب أولاً');
      return;
    }

    setIsSearchingOrder(true);
    const [dbData, sheetData] = await Promise.all([
      storage.trackOrder(clean),
      effectiveWebhook ? fetchOrderFromGoogleSheet(effectiveWebhook, clean) : Promise.resolve(null)
    ]);
    setIsSearchingOrder(false);

    if (!dbData && !sheetData) {
      setSearchError('لم يتم العثور على طلب بهذا الرقم، تأكد من كتابته بشكل صحيح');
      return;
    }

    const hasDbEditAfterCreate =
      Boolean(dbData?.updatedAt && dbData?.createdAt) &&
      new Date(dbData.updatedAt).getTime() - new Date(dbData.createdAt).getTime() > 2500;

    const sheetUpdatedTs = sheetData?.sheetUpdatedAt ? new Date(sheetData.sheetUpdatedAt).getTime() : 0;
    const dbUpdatedTs = dbData?.updatedAt ? new Date(dbData.updatedAt).getTime() : 0;
    const sheetIsNewerThanDb = sheetUpdatedTs > 0 && sheetUpdatedTs > dbUpdatedTs + 1000;

    if (sheetData) {
      lastSheetSnapshotRef.current = {
        bundleLabel: sheetData.bundleLabel,
        wilayaName: sheetData.wilayaName,
        commune: sheetData.commune,
        deliveryType: sheetData.deliveryType,
        total: sheetData.total
      };
    } else {
      lastSheetSnapshotRef.current = null;
    }

    const preferDbDetails = !sheetIsNewerThanDb && hasDbEditAfterCreate && Boolean(dbData);
    const resolvedWilayaName = preferDbDetails
      ? dbData?.wilayaName || sheetData?.wilayaName || ''
      : sheetData?.wilayaName || dbData?.wilayaName || '';
    const matchedWilaya =
      ALGERIA_WILAYAS.find(w => w.id === dbData?.wilayaId) ||
      ALGERIA_WILAYAS.find(w => w.nameAr === resolvedWilayaName);

    setDbEditedInSession(!sheetIsNewerThanDb && hasDbEditAfterCreate);
    setIsEditingTrackedOrder(false);
    setTrackedEditError(null);
    setTrackedEditSuccess(null);
    setTrackedOrder({
      orderNumber: dbData?.orderNumber || sheetData?.orderNumber || clean,
      landingPageId: dbData?.landingPageId || undefined,
      customerFirstName: dbData?.customerFirstName || sheetData?.customerFirstName || 'الزبون الكريم',
      wilayaId: matchedWilaya?.id || dbData?.wilayaId,
      wilayaName: resolvedWilayaName,
      commune: preferDbDetails ? dbData?.commune ?? sheetData?.commune : sheetData?.commune ?? dbData?.commune,
      deliveryType: preferDbDetails
        ? dbData?.deliveryType || sheetData?.deliveryType || 'home'
        : sheetData?.deliveryType || dbData?.deliveryType || 'home',
      bundleLabel: preferDbDetails
        ? dbData?.bundleLabel || sheetData?.bundleLabel || page.title
        : sheetData?.bundleLabel || dbData?.bundleLabel || page.title,
      total: preferDbDetails
        ? Number(dbData?.total || sheetData?.total || 0)
        : Number(sheetData?.total || dbData?.total || 0),
      status: (sheetData?.status || dbData?.status || 'new') as OrderStatus,
      trackingCode: sheetData?.trackingCode || dbData?.trackingCode
    });
    setIsTrackingMode(true);
    scrollToElementWhenReady('tracking-container');
  };

  const handleProceedToTrackingFromSuccess = () => {
    if (!successModalData) return;
    lastSheetSnapshotRef.current = null;
    setDbEditedInSession(false);
    setIsEditingTrackedOrder(false);
    setTrackedEditError(null);
    setTrackedEditSuccess(null);
    setLastOrderWhatsappUrl(successModalData.whatsappUrl);
    setTrackedOrder(successModalData.tracked);
    setSuccessModalData(null);
    setIsTrackingMode(true);
    scrollToElementWhenReady('tracking-container');
  };

  // Poll order status periodically while in tracking mode so DB or Google Sheet updates show live
  useEffect(() => {
    if (!isTrackingMode || !trackedOrder?.orderNumber) return;
    const timer = setInterval(async () => {
      const [fresh, sheetFresh] = await Promise.all([
        storage.trackOrder(trackedOrder.orderNumber),
        effectiveWebhook
          ? fetchOrderFromGoogleSheet(effectiveWebhook, trackedOrder.orderNumber)
          : Promise.resolve(null)
      ]);
      if (fresh || sheetFresh) {
        const prevSheet = lastSheetSnapshotRef.current;
        const sheetDetailsChanged = Boolean(
          sheetFresh &&
            prevSheet &&
            (sheetFresh.bundleLabel !== prevSheet.bundleLabel ||
              sheetFresh.wilayaName !== prevSheet.wilayaName ||
              sheetFresh.commune !== prevSheet.commune ||
              sheetFresh.deliveryType !== prevSheet.deliveryType ||
              sheetFresh.total !== prevSheet.total)
        );
        const sheetFreshTs = sheetFresh?.sheetUpdatedAt ? new Date(sheetFresh.sheetUpdatedAt).getTime() : 0;
        const dbFreshTs = fresh?.updatedAt ? new Date(fresh.updatedAt).getTime() : 0;
        const sheetStrictlyNewer = sheetFreshTs > 0 && sheetFreshTs > dbFreshTs + 1000;

        if (sheetFresh) {
          lastSheetSnapshotRef.current = {
            bundleLabel: sheetFresh.bundleLabel,
            wilayaName: sheetFresh.wilayaName,
            commune: sheetFresh.commune,
            deliveryType: sheetFresh.deliveryType,
            total: sheetFresh.total
          };
        }
        const useDbDetails =
          (!sheetStrictlyNewer && !sheetDetailsChanged && dbEditedInSession && Boolean(fresh)) || !sheetFresh;

        setTrackedOrder(prev => {
          if (!prev) return prev;
          const nextWilayaName = useDbDetails
            ? fresh?.wilayaName || sheetFresh?.wilayaName || prev.wilayaName
            : sheetFresh?.wilayaName || fresh?.wilayaName || prev.wilayaName;
          const matchedW =
            ALGERIA_WILAYAS.find(w => w.id === fresh?.wilayaId) ||
            ALGERIA_WILAYAS.find(w => w.nameAr === nextWilayaName);
          return {
            ...prev,
            landingPageId: fresh?.landingPageId || prev.landingPageId,
            bundleLabel: useDbDetails
              ? fresh?.bundleLabel || sheetFresh?.bundleLabel || prev.bundleLabel
              : sheetFresh?.bundleLabel || fresh?.bundleLabel || prev.bundleLabel,
            wilayaId: matchedW?.id || prev.wilayaId,
            wilayaName: nextWilayaName,
            commune: useDbDetails
              ? fresh?.commune ?? sheetFresh?.commune ?? prev.commune
              : sheetFresh?.commune ?? fresh?.commune ?? prev.commune,
            deliveryType: useDbDetails
              ? fresh?.deliveryType || sheetFresh?.deliveryType || prev.deliveryType
              : sheetFresh?.deliveryType || fresh?.deliveryType || prev.deliveryType,
            status: (sheetFresh?.status || fresh?.status || prev.status) as OrderStatus,
            trackingCode: sheetFresh?.trackingCode || fresh?.trackingCode || prev.trackingCode,
            total: useDbDetails
              ? Number(fresh?.total || sheetFresh?.total || prev.total)
              : Number(sheetFresh?.total || fresh?.total || prev.total)
          };
        });
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [isTrackingMode, trackedOrder?.orderNumber, effectiveWebhook, dbEditedInSession]);

  const editSelectedWilaya = useMemo(
    () => ALGERIA_WILAYAS.find(w => w.id === editWilayaId) || ALGERIA_WILAYAS[15],
    [editWilayaId]
  );

  const editSelectedOffer = useMemo(
    () => editOfferChoices.find(o => o.id === editOfferId) || editOfferChoices[0],
    [editOfferChoices, editOfferId]
  );

  const openTrackedOrderEditor = async () => {
    if (!trackedOrder) return;
    setTrackedEditError(null);
    setTrackedEditSuccess(null);

    let availableOffers = offers;
    if (trackedOrder.landingPageId && trackedOrder.landingPageId !== page.id) {
      const storePages = await storage.getLandingPages(store.id);
      const matchedPage = storePages.find(lp => lp.id === trackedOrder.landingPageId);
      availableOffers = matchedPage?.offers || [];
    }
    setEditOfferChoices(availableOffers);

    const matchedOffer =
      availableOffers.find(o => trackedOrder.bundleLabel === `${o.title} (الكمية: ${o.quantity})`) ||
      availableOffers.find(o => trackedOrder.bundleLabel.includes(o.title)) ||
      availableOffers[0];
    setEditOfferId(matchedOffer?.id || '');

    const matchedWilaya =
      ALGERIA_WILAYAS.find(w => w.id === trackedOrder.wilayaId) ||
      ALGERIA_WILAYAS.find(w => w.nameAr === trackedOrder.wilayaName) ||
      ALGERIA_WILAYAS[15];
    setEditWilayaId(matchedWilaya.id);
    setEditCommune(trackedOrder.commune || matchedWilaya.communes[0] || '');
    setEditDeliveryType(trackedOrder.deliveryType === 'stop' ? 'stop' : 'home');
    setIsEditingTrackedOrder(true);
  };

  const handleSaveTrackedOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackedOrder) return;
    setTrackedEditError(null);
    setIsSavingTrackedEdit(true);

    const res = await storage.updateOrderDetails({
      orderNumber: trackedOrder.orderNumber,
      offerId: editOfferId || undefined,
      wilayaId: editWilayaId,
      commune: editCommune,
      deliveryType: editDeliveryType
    });

    setIsSavingTrackedEdit(false);
    if (!res.success || !res.updated) {
      setTrackedEditError(res.error || 'تعذر حفظ التعديلات، حاول مرة أخرى');
      return;
    }

    const u = res.updated;
    setDbEditedInSession(true);
    if (lastSheetSnapshotRef.current) {
      lastSheetSnapshotRef.current = {
        bundleLabel: u.bundleLabel,
        wilayaName: u.wilayaName,
        commune: u.commune,
        deliveryType: u.deliveryType,
        total: u.total
      };
    }

    updateOrderInGoogleSheet(effectiveWebhook, {
      orderId: u.orderNumber,
      wilaya: u.wilayaName,
      commune: u.commune,
      deliveryType: u.deliveryType,
      orderDetails: u.bundleLabel,
      shippingCost: u.shippingFee,
      productPrice: u.subtotal
    });

    setTrackedOrder(prev =>
      prev
        ? {
            ...prev,
            bundleLabel: u.bundleLabel,
            wilayaId: u.wilayaId,
            wilayaName: u.wilayaName,
            commune: u.commune,
            deliveryType: u.deliveryType,
            total: u.total,
            status: u.status
          }
        : prev
    );
    setIsEditingTrackedOrder(false);
    setTrackedEditSuccess('تم تعديل العرض والوجهة بنجاح');
    setTimeout(() => setTrackedEditSuccess(null), 4000);
  };

  const handleCopyOrderNumber = () => {
    if (!trackedOrder?.orderNumber) return;
    navigator.clipboard?.writeText(trackedOrder.orderNumber).then(() => {
      setCopiedOrderId(true);
      setTimeout(() => setCopiedOrderId(false), 2000);
    });
  };

  const trackingStageIndex = (status: OrderStatus): number => {
    if (status === 'new') return 0;
    if (status === 'confirmed') return 1;
    if (status === 'shipping') return 2;
    if (status === 'delivered') return 3;
    return -1;
  };

  const mutedTextClass = theme.isDark ? 'text-slate-300' : 'text-slate-600';
  const subtleInputBg = theme.isDark ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-slate-900 border-slate-300';

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col transition-colors"
      style={{ backgroundColor: theme.bgColor, color: theme.textColor }}
    >
      {/* Top Announcement Bar */}
      <div
        className="text-xs sm:text-sm py-2 px-4 text-center font-bold tracking-wide text-white"
        style={{ backgroundColor: theme.primaryHoverColor }}
      >
        <span>{store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام'}</span>
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b shadow-sm relative"
        style={{
          backgroundColor: theme.isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          borderColor: theme.borderColor
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBackToCatalog && (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                onClick={onBackToCatalog}
                className="p-2 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 transition-opacity hover:opacity-80 cursor-pointer"
                style={{ borderColor: theme.borderColor, color: theme.textColor }}
                title="عرض كل منتجات المتجر"
              >
                <ArrowRight className="w-4 h-4" />
                <span className="hidden sm:inline">المتجر</span>
              </motion.button>
            )}
            <div
              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {store.logoUrl ? (
                <SmartImage
                  src={store.logoUrl}
                  alt={store.name}
                  eager
                  fallback={<span>{store.name.slice(0, 1)}</span>}
                  className="w-full h-full object-cover"
                />
              ) : (
                store.name.slice(0, 1)
              )}
            </div>
            <div className="flex flex-col truncate">
              <span className="font-black text-lg sm:text-xl tracking-tight leading-none truncate">
                {store.name}
              </span>
              <span className={`text-[11px] font-semibold truncate ${mutedTextClass}`}>
                {store.description ? store.description.slice(0, 42) : 'متجر الجودة والديكور العصري'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
              onClick={() => scrollToElement('track-search-section')}
              className="px-3 py-2 rounded-lg font-bold text-xs transition-shadow flex items-center gap-1.5 border whitespace-nowrap shrink-0 cursor-pointer hover:shadow-sm"
              style={{
                backgroundColor: theme.softTintColor,
                borderColor: theme.borderColor,
                color: theme.textColor
              }}
            >
              <Search className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} />
              <span className="hidden sm:inline">تتبع طلبك</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
              onClick={handleHeaderOrderClick}
              className="text-white px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-shadow shadow-md hover:shadow-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              style={{ backgroundColor: theme.primaryColor }}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>أطلب الآن</span>
            </motion.button>
          </div>
        </div>
        <motion.div
          aria-hidden="true"
          className="h-[2px] w-full origin-right opacity-85"
          style={{
            scaleX: smoothScrollProgress,
            backgroundColor: theme.primaryColor
          }}
        />
      </header>

      {/* Hero Section */}
      <section id="offers-section" className="relative pt-6 pb-12 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Media Showcase */}
            <div className="space-y-4">
              <div
                className="relative rounded-2xl overflow-hidden shadow-xl border-4 w-full h-[360px] sm:h-[440px] flex items-center justify-center"
                style={{ backgroundColor: theme.surfaceColor, borderColor: theme.surfaceColor }}
              >
                {page.badgeText && (
                  <span
                    className="absolute top-4 right-4 z-10 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1"
                    style={{ backgroundColor: theme.accentColor }}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>{page.badgeText}</span>
                  </span>
                )}
                {activeImage && !imgError ? (
                  <SmartImage
                    src={activeImage}
                    alt={page.title}
                    eager
                    onFinalError={() => setImgError(true)}
                    fallback={
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ImageOff className="w-10 h-10" />
                        <span className="text-xs">صورة المنتج</span>
                      </div>
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageOff className="w-10 h-10" />
                    <span className="text-xs">صورة المنتج</span>
                    {activeImage && (
                      <button
                        type="button"
                        onClick={() => setImgError(false)}
                        className="mt-1 px-3 py-1 rounded-lg border text-[11px] font-bold cursor-pointer"
                        style={{ borderColor: theme.borderColor, color: theme.primaryColor }}
                      >
                        إعادة تحميل الصورة
                      </button>
                    )}
                  </div>
                )}
              </div>

              {allGallery.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {allGallery.map((imgUrl, idx) => {
                    const isSelected = activeImage === imgUrl;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setActiveImage(imgUrl);
                          setImgError(false);
                        }}
                        className="relative rounded-xl overflow-hidden shadow-sm focus:outline-none cursor-pointer"
                        style={{
                          backgroundColor: theme.surfaceColor
                        }}
                      >
                        <SmartImage
                          src={imgUrl}
                          alt={`${page.title} ${idx + 1}`}
                          eager
                          fallback={
                            <div className="w-full h-16 flex items-center justify-center text-slate-300">
                              <ImageOff className="w-4 h-4" />
                            </div>
                          }
                          className={`w-full h-16 object-cover transition-opacity duration-200 ${
                            isSelected ? 'opacity-100' : 'opacity-75 hover:opacity-100'
                          }`}
                        />
                        {isSelected && (
                          <span
                            className="absolute inset-0 rounded-xl border-2 pointer-events-none"
                            style={{ borderColor: theme.primaryColor }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Product Details & Interactive Bundle Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-amber-500">
                  {[0, 1, 2, 3, 4].map(i => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                  <span className={`text-xs font-semibold mr-1 ${mutedTextClass}`}>
                    {page.category}
                  </span>
                </div>
                {page.stock <= 5 && (
                  <span
                    className="text-xs font-bold"
                    style={{ color: theme.accentColor }}
                  >
                    {page.stock === 0 ? 'نفد المخزون مؤقتاً' : `متبقي ${page.stock} قطع فقط`}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                {page.title}{' '}
                {page.highlightTitle && (
                  <span className="block sm:inline" style={{ color: theme.primaryColor }}>
                    {page.highlightTitle}
                  </span>
                )}
              </h1>

              <p className={`text-sm sm:text-base leading-relaxed ${mutedTextClass}`}>
                {page.description}
              </p>

              {/* Interactive Offer Cards */}
              <div className="space-y-2.5 pt-1">
                <label className="block text-xs font-bold">اختر العرض المناسب لك:</label>

                {offers.map(offer => {
                  const isActive = selectedOffer?.id === offer.id;
                  return (
                    <motion.div
                      key={offer.id}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                      onClick={() => setSelectedOfferId(offer.id)}
                      className="p-3.5 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-colors duration-200 relative overflow-hidden"
                      style={{
                        backgroundColor: isActive ? theme.softTintColor : theme.surfaceColor,
                        borderColor: isActive ? theme.primaryColor : theme.borderColor,
                        boxShadow: isActive ? '0 8px 20px -6px rgba(0, 0, 0, 0.12)' : 'none'
                      }}
                    >
                      {offer.badge && (
                        <span
                          className="absolute top-0 left-0 text-white text-[10px] px-2.5 py-0.5 rounded-br-lg font-bold"
                          style={{ backgroundColor: theme.accentColor }}
                        >
                          {offer.badge}
                        </span>
                      )}

                      <div className="flex items-center gap-3">
                        <div
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: theme.primaryColor }}
                        >
                          <AnimatePresence initial={false}>
                            {isActive && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: theme.primaryColor }}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                        <div>
                          <h4 className="font-bold text-xs sm:text-sm">{offer.title}</h4>
                          <p className={`text-[11px] ${mutedTextClass}`}>{offer.subtitle}</p>
                        </div>
                      </div>

                      <div className="text-left shrink-0 tabular-nums">
                        <span className="font-black text-sm sm:text-base block" style={{ color: theme.primaryColor }}>
                          {formatDZD(offer.price)}
                        </span>
                        {offer.comparePrice && offer.comparePrice > offer.price && (
                          <span className="text-[11px] text-slate-400 line-through block">
                            {formatDZD(offer.comparePrice)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* CTA Box */}
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: theme.softTintColor,
                  borderColor: theme.borderColor
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-xs font-bold ${mutedTextClass}`}>السعر المختار الآن:</span>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={productPrice}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                      className="text-2xl font-black tabular-nums inline-block"
                      style={{ color: theme.primaryColor }}
                    >
                      {formatDZD(productPrice)}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ y: -1.5 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                  onClick={() => scrollToElement('form-container')}
                  className="w-full py-3.5 px-6 rounded-xl text-white font-extrabold text-sm sm:text-base text-center shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>اضغط هنا لتأكيد الطلب والدفع عند الاستلام</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Customer Reviews Section (if configured on landing page) */}
      {(page.reviews || []).length > 0 && (
        <section
          className="py-10 border-t"
          style={{
            backgroundColor: theme.bgColor,
            borderColor: theme.borderColor
          }}
        >
          <div className="max-w-6xl mx-auto px-4 space-y-6">
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-1 text-amber-400">
                {[0, 1, 2, 3, 4].map(i => (
                  <Star key={i} className="w-4 h-4 fill-amber-400" />
                ))}
              </div>
              <h2 className="text-xl sm:text-2xl font-black">تقييمات وآراء زبائننا الكرام</h2>
              <p className={`text-xs ${mutedTextClass}`}>
                تجارب حقيقية لزبائن طلبوا واستلموا هذا المنتج عبر ولايات الوطن
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(page.reviews || []).map(rev => (
                <div
                  key={rev.id}
                  className="p-5 rounded-2xl border shadow-sm space-y-3"
                  style={{
                    backgroundColor: theme.surfaceColor,
                    borderColor: theme.borderColor
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white shrink-0"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        {rev.author.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-bold text-xs">{rev.author}</div>
                        {rev.wilaya && (
                          <div className={`text-[10px] flex items-center gap-0.5 ${mutedTextClass}`}>
                            <MapPin className="w-3 h-3" />
                            <span>{rev.wilaya}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                          key={idx}
                          className={`w-3.5 h-3.5 ${
                            idx < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">{rev.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Order Form & Tracking Section */}
      <section
        id="order-form"
        className="py-12 border-t flex-1"
        style={{
          backgroundColor: theme.surfaceColor,
          borderColor: theme.borderColor
        }}
      >
        <div className="max-w-3xl mx-auto px-4 min-h-[540px]">
          <AnimatePresence mode="wait" initial={false}>
          {!isTrackingMode ? (
            <motion.div
              key="checkout-mode"
              initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
              transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            >
              {/* Inline Order Search Box */}
              <div
                id="track-search-section"
                className="mb-10 rounded-2xl p-6 border shadow-sm text-center space-y-4"
                style={{
                  backgroundColor: theme.softTintColor,
                  borderColor: theme.borderColor
                }}
              >
                <div className="flex items-center justify-center gap-2 font-bold text-sm">
                  <Search className="w-4 h-4" style={{ color: theme.primaryColor }} />
                  <span>هل لديك طلب سابق وتريد تتبعه؟</span>
                </div>
                <div className="flex gap-2 max-w-md mx-auto">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearchOrder()}
                    placeholder="مثال: DZ-9821A4B2"
                    dir="ltr"
                    className={`w-full p-3 rounded-xl border text-sm text-center font-bold font-mono focus:outline-none transition-shadow ${subtleInputBg}`}
                  />
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSearchOrder}
                    disabled={isSearchingOrder}
                    className="text-white px-5 py-3 rounded-xl font-bold text-sm shrink-0 transition-opacity cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {isSearchingOrder ? 'بحث...' : 'بحث'}
                  </motion.button>
                </div>
                <AnimatePresence>
                  {searchError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                      className="text-xs font-bold text-rose-600"
                    >
                      {searchError}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Checkout Form Container */}
              <div
                id="form-container"
                className="rounded-3xl p-6 sm:p-8 border-2 shadow-xl"
                style={{
                  backgroundColor: theme.bgColor,
                  borderColor: theme.borderColor
                }}
              >
                <div className="text-center mb-8 space-y-2">
                  <span
                    className="inline-block px-3 py-1 rounded-full font-extrabold text-xs"
                    style={{
                      backgroundColor: theme.softTintColor,
                      color: theme.primaryColor
                    }}
                  >
                    الدفع عند الاستلام 100%
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black">استمارة طلب المنتج</h2>
                  <p className={`text-xs sm:text-sm ${mutedTextClass}`}>
                    يرجى ملء معلوماتك بدقة، وسيتصل بك فريقنا لتأكيد الطلب
                  </p>
                </div>

                <AnimatePresence>
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                      className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{formError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form
                  onSubmit={handleCheckoutSubmit}
                  onFocus={() => {
                    if (!trackedInitiateCheckoutRef.current) {
                      trackedInitiateCheckoutRef.current = true;
                      trackMetaPixelInitiateCheckout(
                        effectivePixelId,
                        selectedOffer?.title || page.title,
                        grandTotal,
                        {
                          storeId: store.id,
                          contentId: page.id,
                          numItems: selectedOffer?.quantity || 1
                        }
                      );
                    }
                  }}
                  className="space-y-5"
                >
                  {/* Invisible anti-bot honeypot field (kept inside viewport bounds so RTL mobile never overflows horizontally) */}
                  <div
                    aria-hidden="true"
                    className="sr-only opacity-0 pointer-events-none"
                  >
                    <label htmlFor="order_company_website">Website</label>
                    <input
                      id="order_company_website"
                      name="company_website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={botTrapField}
                      onChange={e => setBotTrapField(e.target.value)}
                    />
                  </div>

                  {/* Synced Offer Dropdown */}
                  <div>
                    <label className="block text-xs font-bold mb-2">العرض المختار:</label>
                    <select
                      value={selectedOffer?.id || ''}
                      onChange={e => setSelectedOfferId(e.target.value)}
                      className={`w-full p-3.5 rounded-xl border-2 font-bold text-sm focus:outline-none ${subtleInputBg}`}
                      style={{ borderColor: theme.borderColor }}
                    >
                      {offers.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.title} - {formatDZD(o.price)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Product Variants Selector (Colors / Sizes) */}
                  {(page.variants || []).length > 0 && (
                    <div className="space-y-3">
                      {(page.variants || []).map(v => {
                        const activeOpt = selectedVariants[v.name] || v.options?.[0] || '';
                        return (
                          <div key={v.id} className="space-y-1.5">
                            <label className="block text-xs font-bold flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} />
                              <span>
                                {v.name}:{' '}
                                <span style={{ color: theme.primaryColor }}>{activeOpt}</span>
                              </span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {v.options.map(opt => {
                                const isPicked = activeOpt === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() =>
                                      setSelectedVariants(prev => ({ ...prev, [v.name]: opt }))
                                    }
                                    className="px-3.5 py-2 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer"
                                    style={{
                                      borderColor: isPicked ? theme.primaryColor : theme.borderColor,
                                      backgroundColor: isPicked
                                        ? theme.softTintColor
                                        : theme.surfaceColor,
                                      color: isPicked ? theme.primaryColor : theme.textColor
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      الاسم الكامل <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        onBlur={triggerImmediateAbandonedCapture}
                        placeholder="مثال: محمد الأمين"
                        className={`w-full p-3.5 pr-10 rounded-xl border text-sm focus:outline-none ${subtleInputBg}`}
                      />
                      <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-4" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      رقم الهاتف <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onBlur={triggerImmediateAbandonedCapture}
                        placeholder="06XX XX XX XX"
                        className={`w-full p-3.5 pr-10 rounded-xl border text-sm text-right font-mono focus:outline-none ${subtleInputBg}`}
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-4" />
                    </div>
                  </div>

                  {/* Wilaya & Commune */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الولاية <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={selectedWilayaId}
                        onChange={e => setSelectedWilayaId(e.target.value)}
                        className={`w-full p-3.5 rounded-xl border text-sm focus:outline-none ${subtleInputBg}`}
                      >
                        {ALGERIA_WILAYAS.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.code} - {w.nameAr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        البلدية <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={selectedCommune}
                        onChange={e => setSelectedCommune(e.target.value)}
                        className={`w-full p-3.5 rounded-xl border text-sm focus:outline-none ${subtleInputBg}`}
                      >
                        {selectedWilaya.communes.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Home vs Stop Desk Radio Cards */}
                  <div>
                    <label className="block text-xs font-bold mb-2">
                      طريقة التوصيل <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <motion.label
                        whileTap={{ scale: 0.985 }}
                        transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                        className="flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition-colors duration-200"
                        style={{
                          backgroundColor: deliveryType === 'home' ? theme.softTintColor : theme.surfaceColor,
                          borderColor: deliveryType === 'home' ? theme.primaryColor : theme.borderColor
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="shipping-type"
                            value="home"
                            checked={deliveryType === 'home'}
                            onChange={() => setDeliveryType('home')}
                            className="accent-current"
                          />
                          <Home className="w-4 h-4 shrink-0" style={{ color: theme.primaryColor }} />
                          <span className="text-xs font-bold">توصيل للمنزل</span>
                        </div>
                        <span className="text-xs font-black tabular-nums" style={{ color: theme.primaryColor }}>
                          {homeFee === 0 ? 'مجاني' : formatDZD(homeFee)}
                        </span>
                      </motion.label>

                      <motion.label
                        whileTap={{ scale: 0.985 }}
                        transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                        className="flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition-colors duration-200"
                        style={{
                          backgroundColor: deliveryType === 'stop' ? theme.softTintColor : theme.surfaceColor,
                          borderColor: deliveryType === 'stop' ? theme.primaryColor : theme.borderColor
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="shipping-type"
                            value="stop"
                            checked={deliveryType === 'stop'}
                            onChange={() => setDeliveryType('stop')}
                            className="accent-current"
                          />
                          <Building2 className="w-4 h-4 shrink-0" style={{ color: theme.primaryColor }} />
                          <span className="text-xs font-bold">مكتب الشحن (Stop Desk)</span>
                        </div>
                        <span className="text-xs font-black tabular-nums" style={{ color: theme.primaryColor }}>
                          {stopFee === 0 ? 'مجاني' : formatDZD(stopFee)}
                        </span>
                      </motion.label>
                    </div>
                  </div>

                  {/* Promo Code / Coupon Field */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold flex items-center gap-1.5">
                      <TicketPercent className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} />
                      <span>هل لديك كوبون خصم؟ (اختياري)</span>
                    </label>
                    {appliedPromo ? (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            تم تطبيق {appliedPromo.reason} — خصم {formatDZD(activeDiscountAmount)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedPromo(null);
                            setPromoInput('');
                            setPromoError(null);
                          }}
                          className="text-rose-600 hover:underline text-[11px] font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={promoInput}
                          onChange={e => setPromoInput(e.target.value.toUpperCase())}
                          placeholder="أدخل رمز الكوبون (مثال: SAVE10)"
                          className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold uppercase focus:outline-none ${subtleInputBg}`}
                        />
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          disabled={isValidatingPromo}
                          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 cursor-pointer disabled:opacity-60"
                          style={{ backgroundColor: theme.primaryColor }}
                        >
                          {isValidatingPromo ? 'تحقق...' : 'تطبيق'}
                        </button>
                      </div>
                    )}
                    {promoError && (
                      <p className="text-[11px] font-bold text-rose-600">{promoError}</p>
                    )}
                  </div>

                  {/* Summary */}
                  <div
                    className="p-4 rounded-xl border space-y-2 text-xs sm:text-sm tabular-nums"
                    style={{
                      backgroundColor: theme.surfaceColor,
                      borderColor: theme.borderColor
                    }}
                  >
                    <div className={`flex justify-between ${mutedTextClass}`}>
                      <span>سعر المنتج/العرض:</span>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={productPrice}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                          className="font-bold inline-block"
                        >
                          {formatDZD(productPrice)}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    {activeDiscountAmount > 0 && appliedPromo && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>الخصم ({appliedPromo.code}):</span>
                        <span>- {formatDZD(activeDiscountAmount)}</span>
                      </div>
                    )}
                    <div className={`flex justify-between ${mutedTextClass}`}>
                      <span>مصاريف التوصيل ({selectedWilaya.nameAr}):</span>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={`${selectedWilaya.id}-${shippingCost}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                          className="font-bold inline-block"
                          style={{ color: theme.primaryColor }}
                        >
                          {shippingCost === 0 ? 'مجاني' : formatDZD(shippingCost)}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    <div
                      className="pt-2 border-t flex justify-between text-base font-extrabold"
                      style={{ borderColor: theme.borderColor }}
                    >
                      <span>المجموع الكلي للدفع:</span>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={grandTotal}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                          className="text-xl inline-block"
                          style={{ color: theme.primaryColor }}
                        >
                          {formatDZD(grandTotal)}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  </div>

                  <motion.button
                    type="submit"
                    whileHover={{ y: -1.5 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                    disabled={isSubmitting || page.stock <= 0}
                    className="w-full py-4 px-6 rounded-xl text-white font-black text-base sm:text-lg shadow-xl hover:shadow-2xl transition-shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>
                      {isSubmitting
                        ? 'جاري تأكيد طلبك...'
                        : page.stock <= 0
                        ? 'الكمية غير متوفرة حالياً'
                        : 'تأكيد الطلب الآن (الدفع عند الاستلام)'}
                    </span>
                  </motion.button>
                </form>
              </div>
            </motion.div>
          ) : (
            /* Order Tracking Container */
            trackedOrder && (
              <motion.div
                key={`tracking-mode-${trackedOrder.orderNumber}`}
                id="tracking-container"
                initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
                className="rounded-3xl p-6 sm:p-8 border-2 shadow-xl space-y-6"
                style={{
                  backgroundColor: theme.bgColor,
                  borderColor: theme.borderColor
                }}
              >
                <div className="text-center space-y-2 border-b pb-6" style={{ borderColor: theme.borderColor }}>
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"
                  >
                    <CheckCircle2 className="w-7 h-7" />
                  </motion.div>
                  {trackedOrder.status === 'new' && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                      <Check className="w-3.5 h-3.5" />
                      <span>تم تسجيل طلبك بنجاح!</span>
                    </div>
                  )}
                  <h2 className="text-2xl font-black">تفاصيل وتتبع طلبك</h2>
                  <p className={`text-xs ${mutedTextClass}`}>
                    شكراً لثقتك بـ {store.name}. يمكنك متابعة حالة طلبك أدناه
                  </p>
                </div>

                <div
                  className="p-4 rounded-2xl space-y-2.5 text-xs sm:text-sm border"
                  style={{
                    backgroundColor: theme.softTintColor,
                    borderColor: theme.borderColor
                  }}
                >
                  <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: theme.borderColor }}>
                    <span className={mutedTextClass}>رقم الطلب:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono" style={{ color: theme.primaryColor }}>
                        {trackedOrder.orderNumber}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyOrderNumber}
                        className="px-2 py-0.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: theme.surfaceColor,
                          borderColor: theme.borderColor,
                          color: theme.primaryColor
                        }}
                      >
                        {copiedOrderId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrderId ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-2 border-b pb-2" style={{ borderColor: theme.borderColor }}>
                    <span className={mutedTextClass}>المنتج / العرض:</span>
                    <span className="font-bold text-left">{trackedOrder.bundleLabel}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 border-b pb-2" style={{ borderColor: theme.borderColor }}>
                    <span className={mutedTextClass}>الوجهة والتوصيل:</span>
                    <span className="font-bold text-left">
                      {trackedOrder.wilayaName}
                      {trackedOrder.commune ? ` - ${trackedOrder.commune}` : ''} (
                      {trackedOrder.deliveryType === 'stop' ? 'مكتب الشحن' : 'للمنزل'})
                    </span>
                  </div>
                  {trackedOrder.trackingCode && (
                    <div className="flex justify-between border-b pb-2" style={{ borderColor: theme.borderColor }}>
                      <span className={mutedTextClass}>رمز تتبع شركة الشحن:</span>
                      <span className="font-bold font-mono" style={{ color: theme.primaryColor }}>
                        {trackedOrder.trackingCode}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className={mutedTextClass}>المبلغ الإجمالي:</span>
                    <span className="font-bold tabular-nums" style={{ color: theme.primaryColor }}>
                      {formatDZD(trackedOrder.total)}
                    </span>
                  </div>

                  <AnimatePresence>
                    {trackedEditSuccess && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                        className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold text-center"
                      >
                        {trackedEditSuccess}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence mode="wait" initial={false}>
                  {trackedOrder.status === 'new' && !isEditingTrackedOrder && (
                    <motion.div
                      key="edit-order-trigger"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                      className="pt-2 border-t"
                      style={{ borderColor: theme.borderColor }}
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.985 }}
                        onClick={openTrackedOrderEditor}
                        className="w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-shadow hover:shadow-xs cursor-pointer"
                        style={{
                          backgroundColor: theme.surfaceColor,
                          borderColor: theme.primaryColor,
                          color: theme.primaryColor
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل المنتج / العرض أو الوجهة والتوصيل</span>
                      </motion.button>
                    </motion.div>
                  )}

                  {trackedOrder.status === 'new' && isEditingTrackedOrder && (
                    <motion.form
                      key="edit-order-form"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                      onSubmit={handleSaveTrackedOrderEdit}
                      className="pt-3 border-t space-y-3"
                      style={{ borderColor: theme.borderColor }}
                    >
                      {trackedEditError && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                          {trackedEditError}
                        </div>
                      )}

                      {editOfferChoices.length > 0 && (
                        <div>
                          <label className="block text-xs font-bold mb-1">المنتج / العرض</label>
                          <select
                            value={editOfferId}
                            onChange={e => setEditOfferId(e.target.value)}
                            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold ${subtleInputBg}`}
                          >
                            {editOfferChoices.map(o => (
                              <option key={o.id} value={o.id}>
                                {o.title} (الكمية: {o.quantity}) — {formatDZD(o.price)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold mb-1">الولاية</label>
                          <select
                            value={editWilayaId}
                            onChange={e => {
                              const nextWId = e.target.value;
                              setEditWilayaId(nextWId);
                              const nextW = ALGERIA_WILAYAS.find(w => w.id === nextWId);
                              if (nextW && nextW.communes.length > 0) {
                                setEditCommune(nextW.communes[0]);
                              }
                            }}
                            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold ${subtleInputBg}`}
                          >
                            {ALGERIA_WILAYAS.map(w => (
                              <option key={w.id} value={w.id}>
                                {w.code} - {w.nameAr}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold mb-1">البلدية</label>
                          <select
                            value={editCommune}
                            onChange={e => setEditCommune(e.target.value)}
                            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold ${subtleInputBg}`}
                          >
                            {editSelectedWilaya.communes.map(c => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold mb-1">طريقة التوصيل</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditDeliveryType('home')}
                            className="p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer"
                            style={{
                              borderColor: editDeliveryType === 'home' ? theme.primaryColor : theme.borderColor,
                              backgroundColor: editDeliveryType === 'home' ? theme.surfaceColor : 'transparent'
                            }}
                          >
                            <span>للمنزل</span>
                            <span className="tabular-nums" style={{ color: theme.primaryColor }}>
                              {formatDZD(
                                getDeliveryFeeForWilaya(
                                  editSelectedWilaya.id,
                                  'home',
                                  editSelectedOffer?.price ?? trackedOrder.total
                                )
                              )}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditDeliveryType('stop')}
                            className="p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer"
                            style={{
                              borderColor: editDeliveryType === 'stop' ? theme.primaryColor : theme.borderColor,
                              backgroundColor: editDeliveryType === 'stop' ? theme.surfaceColor : 'transparent'
                            }}
                          >
                            <span>مكتب الشحن</span>
                            <span className="tabular-nums" style={{ color: theme.primaryColor }}>
                              {formatDZD(
                                getDeliveryFeeForWilaya(
                                  editSelectedWilaya.id,
                                  'stop',
                                  editSelectedOffer?.price ?? trackedOrder.total
                                )
                              )}
                            </span>
                          </button>
                        </div>
                      </div>

                      {editSelectedOffer && (
                        <div
                          className="flex justify-between items-center text-xs font-extrabold pt-1"
                          style={{ color: theme.primaryColor }}
                        >
                          <span>المجموع بعد التعديل:</span>
                          <span className="tabular-nums">
                            {formatDZD(
                              editSelectedOffer.price +
                                getDeliveryFeeForWilaya(
                                  editSelectedWilaya.id,
                                  editDeliveryType,
                                  editSelectedOffer.price
                                )
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={isSavingTrackedEdit}
                          className="flex-1 py-2.5 px-3 rounded-xl text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: theme.primaryColor }}
                        >
                          {isSavingTrackedEdit ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingTrackedOrder(false);
                            setTrackedEditError(null);
                          }}
                          className="px-4 py-2.5 rounded-xl border font-bold text-xs cursor-pointer"
                          style={{
                            backgroundColor: theme.surfaceColor,
                            borderColor: theme.borderColor
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    </motion.form>
                  )}
                  </AnimatePresence>
                </div>

                {trackedOrder.status === 'cancelled' ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
                    تم إلغاء هذا الطلب. يمكنك إنشاء طلب جديد في أي وقت.
                  </div>
                ) : (
                  <div className="space-y-6 pt-2 px-2">
                    <h3 className="font-bold text-sm">مراحل سير الطلب:</h3>
                    {[
                      {
                        title: 'قيد التأكيد',
                        desc: 'تم استلام طلبك وبانتظار اتصال فريق المبيعات لتأكيد البيانات.',
                        icon: Clock
                      },
                      {
                        title: 'التأكيد',
                        desc: 'تم تأكيد الطلب بنجاح وتحويله لتجهيز المنتجات.',
                        icon: Check
                      },
                      {
                        title: 'في شركة التوصيل',
                        desc: 'الطلب في طريقه إليك مع شركة الشحن لعنوانك.',
                        icon: Truck
                      },
                      {
                        title: 'التسليم',
                        desc: 'تم استلام طلبك ومعاينته ودفع ثمنه بنجاح.',
                        icon: PackageOpen
                      }
                    ].map((stage, idx) => {
                      const activeIdx = trackingStageIndex(trackedOrder.status);
                      const isDone = idx <= activeIdx;
                      const Icon = stage.icon;
                      return (
                        <motion.div
                          key={stage.title}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.22, delay: idx * 0.06, ease: EASE_OUT_EXPO }}
                          className="flex items-start gap-4"
                        >
                          <motion.div
                            initial={false}
                            animate={{ scale: isDone ? [0.88, 1.08, 1] : 1 }}
                            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm transition-colors duration-200"
                            style={
                              isDone
                                ? { backgroundColor: theme.primaryColor, color: '#ffffff' }
                                : { backgroundColor: '#e2e8f0', color: '#64748b' }
                            }
                          >
                            <Icon className="w-4 h-4" />
                          </motion.div>
                          <div className="space-y-0.5">
                            <h4 className={`font-bold text-sm ${isDone ? '' : 'text-slate-400'}`}>
                              {stage.title}
                            </h4>
                            <p className={`text-xs ${isDone ? mutedTextClass : 'text-slate-400'}`}>
                              {stage.desc}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 space-y-2.5">
                  {trackedOrder.status === 'new' && effectiveWhatsapp && (
                    <motion.a
                      whileHover={{ y: -1.5 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                      href={
                        lastOrderWhatsappUrl ||
                        buildOrderConfirmationWhatsAppUrl(
                          effectiveWhatsapp,
                          store.name,
                          {
                            orderNumber: trackedOrder.orderNumber,
                            customerName: trackedOrder.customerFirstName,
                            bundleDetails: trackedOrder.bundleLabel,
                            deliveryType: trackedOrder.deliveryType || 'home',
                            shippingCost: 0,
                            total: trackedOrder.total,
                            wilayaName: trackedOrder.wilayaName,
                            commune: trackedOrder.commune || ''
                          },
                          waTemplates.confirm
                        )
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-3.5 bg-[#25D366] hover:bg-emerald-600 text-white font-extrabold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>تأكيد الطلب الآن عبر واتساب</span>
                    </motion.a>
                  )}

                  <motion.a
                    whileHover={{ y: -1.5 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                    href={buildOrderTrackingWhatsAppUrl(
                      effectiveWhatsapp,
                      store.name,
                      {
                        orderNumber: trackedOrder.orderNumber,
                        customerName: trackedOrder.customerFirstName,
                        bundleDetails: trackedOrder.bundleLabel,
                        total: trackedOrder.total,
                        status: trackedOrder.status,
                        trackingCode: trackedOrder.trackingCode
                      },
                      waTemplates.shipping
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className={`w-full py-3 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm ${
                      trackedOrder.status === 'new'
                        ? 'border hover:shadow-xs'
                        : 'bg-[#25D366] hover:bg-emerald-600 text-white shadow-md'
                    }`}
                    style={
                      trackedOrder.status === 'new'
                        ? {
                            backgroundColor: theme.surfaceColor,
                            borderColor: theme.borderColor,
                            color: theme.textColor
                          }
                        : undefined
                    }
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>تواصل معنا عبر واتساب لمتابعة الطلب</span>
                  </motion.a>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.985 }}
                    onClick={() => setOrderPromptModalOpen(true)}
                    className="w-full py-3 rounded-xl font-bold text-sm transition-shadow hover:shadow-xs border cursor-pointer"
                    style={{
                      backgroundColor: theme.surfaceColor,
                      borderColor: theme.borderColor
                    }}
                  >
                    إجراء طلب جديد أو بحث آخر
                  </motion.button>
                </div>
              </motion.div>
            )
          )}
          </AnimatePresence>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 border-t text-center space-y-3"
        style={{
          backgroundColor: theme.primaryHoverColor,
          borderColor: theme.primaryColor,
          color: '#f8fafc'
        }}
      >
        <div className="max-w-6xl mx-auto px-4 space-y-2">
          <div className="font-black text-lg">{store.name}</div>
          <p className="text-xs opacity-75">
            جميع الحقوق محفوظة © {new Date().getFullYear()} - {store.name}
          </p>
        </div>
      </footer>

      {/* Success Modal */}
      <AnimatePresence>
        {successModalData && (
          <motion.div
            key="success-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              key="success-modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, y: 10, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0.4, rotate: -15, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 24, delay: 0.06 }}
                className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"
              >
                <Check className="w-8 h-8" />
              </motion.div>
              <h3 className="text-2xl font-black">تم تسجيل طلبك بنجاح!</h3>

              <div className="bg-slate-50 p-4 rounded-2xl text-right space-y-2 border border-slate-100 text-sm">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-slate-500 font-medium">رقم الطلب:</span>
                  <span className="font-bold font-mono" style={{ color: theme.primaryColor }}>
                    {successModalData.orderNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-slate-500 font-medium">المنتج / العرض:</span>
                  <span className="font-bold text-xs">{successModalData.bundleDetails}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">حالة الطلب:</span>
                  <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold">
                    قيد التأكيد
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs text-slate-500 font-medium">
                  اضغط هنا لإرسال تأكيد الطلب عبر الواتساب:
                </p>
                <motion.a
                  whileHover={{ y: -1.5 }}
                  whileTap={{ scale: 0.98 }}
                  href={successModalData.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3.5 bg-[#25D366] hover:bg-emerald-600 text-white font-extrabold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>تأكيد الطلب الآن عبر واتساب</span>
                </motion.a>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleProceedToTrackingFromSuccess}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm cursor-pointer"
              >
                الانتقال لمتابعة مراحل التتبع
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smart Header New Order Modal */}
      <AnimatePresence>
        {newOrderModalOpen && (
          <motion.div
            key="new-order-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={e => {
              if (e.target === e.currentTarget) setNewOrderModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              key="new-order-modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 14, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, y: 8, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: theme.softTintColor, color: theme.primaryColor }}
              >
                <ShoppingCart className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black">تأكيد طلب جديد</h3>
              <p className="text-sm text-slate-600">
                هل أنت متأكد من رغبتك في الانتقال لطلب منتج جديد وإضافته؟
              </p>
              <div className="flex flex-col gap-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => resetToNewOrder('form-container')}
                  className="w-full text-white py-2.5 rounded-xl font-bold text-sm shadow-md cursor-pointer"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  الانتقال إلى صفحة الطلب
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => resetToNewOrder('offers-section')}
                  className="w-full py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                  style={{ backgroundColor: theme.softTintColor, color: theme.primaryColor }}
                >
                  اختر الباقة المناسبة
                </motion.button>
                <button
                  type="button"
                  onClick={() => setNewOrderModalOpen(false)}
                  className="w-full text-slate-500 hover:text-slate-700 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Prompt Modal (Copy Order Number / New Order / Stay Tracking) */}
      <AnimatePresence>
        {orderPromptModalOpen && trackedOrder && (
          <motion.div
            key="order-prompt-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={e => {
              if (e.target === e.currentTarget) setOrderPromptModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              key="order-prompt-modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 14, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, y: 8, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4"
            >
              <button
                type="button"
                onClick={() => setOrderPromptModalOpen(false)}
                className="float-left text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: theme.softTintColor, color: theme.primaryColor }}
              >
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black">معلومات طلبك الحالي</h3>
              <p className="text-xs text-slate-500">
                رقم الطلب الخاص بك (احتفظ به لتتبع طلبك لاحقاً):
              </p>

              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: theme.softTintColor, borderColor: theme.borderColor }}
              >
                <span className="font-black text-base tracking-wider font-mono" style={{ color: theme.primaryColor }}>
                  {trackedOrder.orderNumber}
                </span>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={handleCopyOrderNumber}
                  className="text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer min-w-[82px] justify-center"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copiedOrderId ? 'copied' : 'copy'}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.14 }}
                      className="flex items-center gap-1"
                    >
                      {copiedOrderId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedOrderId ? 'تم النسخ' : 'نسخ الرقم'}</span>
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => resetToNewOrder('form-container')}
                  className="w-full text-white py-2.5 rounded-xl font-bold text-sm shadow-md cursor-pointer"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  إجراء طلب جديد
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setOrderPromptModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                >
                  تتبع طلبه (البقاء على صفحة التتبع)
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
