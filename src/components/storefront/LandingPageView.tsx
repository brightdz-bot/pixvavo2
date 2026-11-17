import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Store, LandingPage, DeliveryType, OrderStatus } from '../../types';
import { ALGERIA_WILAYAS, formatDZD } from '../../data/wilayas';
import { storage } from '../../services/storage';
import {
  trackMetaPixelPage,
  trackMetaPixelPurchase,
  sendOrderToGoogleSheet,
  updateOrderInGoogleSheet,
  fetchOrderFromGoogleSheet,
  buildOrderConfirmationWhatsAppUrl,
  buildOrderTrackingWhatsAppUrl
} from '../../services/integrations';
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
  Pencil
} from 'lucide-react';

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

  // Checkout state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedWilayaId, setSelectedWilayaId] = useState('16');
  const [selectedCommune, setSelectedCommune] = useState('الجزائر الوسطى');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('home');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const effectivePixelId = page.integrations?.pixelId?.trim() || store.defaultPixelId?.trim();
  const effectiveWhatsapp =
    page.integrations?.whatsappNumber?.trim() || store.defaultWhatsapp?.trim() || store.phone?.trim();
  const effectiveWebhook =
    page.integrations?.googleSheetWebhook?.trim() || store.googleSheetWebhook?.trim();

  // Sync on page switch
  useEffect(() => {
    setActiveImage(page.mainImage || allGallery[0] || '');
    setImgError(false);
    const def = page.offers.find(o => o.isDefault) || page.offers[0];
    setSelectedOfferId(def?.id || '');
    setIsTrackingMode(false);
    setSuccessModalData(null);
    setFormError(null);
    setIsEditingTrackedOrder(false);
    setTrackedEditError(null);
    setTrackedEditSuccess(null);
    trackMetaPixelPage(effectivePixelId, page.title, page.category, def?.price || 0);
  }, [page.id]);

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
  const homeFee = getDeliveryFeeForWilaya(selectedWilaya.id, 'home', productPrice);
  const stopFee = getDeliveryFeeForWilaya(selectedWilaya.id, 'stop', productPrice);
  const shippingCost = deliveryType === 'stop' ? stopFee : homeFee;
  const grandTotal = productPrice + shippingCost;

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 88;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

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
    setNewOrderModalOpen(false);
    setOrderPromptModalOpen(false);
    setFullName('');
    setPhone('');
    setFormError(null);
    setTimeout(() => scrollToElement(targetSection), 60);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedOffer) {
      setFormError('لا يوجد عرض متاح لهذه الصفحة حالياً');
      return;
    }
    if (fullName.trim().length < 2) {
      setFormError('يرجى إدخال الاسم الكامل بشكل صحيح');
      return;
    }
    const cleanPhone = phone.replace(/[\s\-\.]/g, '');
    if (!/^(\+213|00213|0)[0-9]{8,9}$/.test(cleanPhone)) {
      setFormError('يرجى إدخال رقم هاتف جزائري صحيح (10 أرقام يبدأ بـ 05 أو 06 أو 07)');
      return;
    }
    if (!selectedCommune) {
      setFormError('يرجى اختيار البلدية');
      return;
    }

    setIsSubmitting(true);
    const res = await storage.placeOrder({
      storeId: store.id,
      landingPageId: page.id,
      offerId: selectedOffer.id,
      customerName: fullName.trim(),
      customerPhone: cleanPhone,
      wilayaId: selectedWilaya.id,
      wilayaName: selectedWilaya.nameAr,
      commune: selectedCommune,
      deliveryType,
      address: `${selectedWilaya.nameAr} - ${selectedCommune}${deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''}`
    });
    setIsSubmitting(false);

    if (!res.success || !res.order) {
      setFormError(res.error || 'تعذر تسجيل الطلب، يرجى التحقق من البيانات والمحاولة مجدداً');
      return;
    }

    const orderNum = res.order.orderNumber;
    const bundleDetails = `${selectedOffer.title} (الكمية: ${selectedOffer.quantity})`;

    trackMetaPixelPurchase(effectivePixelId, bundleDetails, res.order.total, orderNum);

    sendOrderToGoogleSheet(effectiveWebhook, {
      orderId: orderNum,
      fullName: fullName.trim(),
      phone: cleanPhone,
      wilaya: selectedWilaya.nameAr,
      commune: selectedCommune,
      deliveryType,
      orderDetails: bundleDetails,
      statusLabel: 'قيد التأكيد',
      shippingCost: res.order.shippingFee,
      productPrice: res.order.subtotal,
      totalPrice: res.order.total,
      discount: 0,
      discountReason: '',
      trackingCode: ''
    });

    const whatsappUrl = buildOrderConfirmationWhatsAppUrl(effectiveWhatsapp, store.name, {
      orderNumber: orderNum,
      customerName: fullName.trim(),
      bundleDetails,
      deliveryType,
      shippingCost: res.order.shippingFee,
      total: res.order.total,
      wilayaName: selectedWilaya.nameAr,
      commune: selectedCommune
    });

    setSuccessModalData({
      orderNumber: orderNum,
      bundleDetails,
      whatsappUrl,
      tracked: {
        orderNumber: orderNum,
        landingPageId: page.id,
        customerFirstName: fullName.trim().split(' ')[0],
        wilayaId: selectedWilaya.id,
        wilayaName: selectedWilaya.nameAr,
        commune: selectedCommune,
        deliveryType,
        bundleLabel: bundleDetails,
        total: res.order.total,
        status: 'new'
      }
    });
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
    setTimeout(() => scrollToElement('tracking-container'), 80);
  };

  const handleProceedToTrackingFromSuccess = () => {
    if (!successModalData) return;
    lastSheetSnapshotRef.current = null;
    setDbEditedInSession(false);
    setIsEditingTrackedOrder(false);
    setTrackedEditError(null);
    setTrackedEditSuccess(null);
    setTrackedOrder(successModalData.tracked);
    setSuccessModalData(null);
    setIsTrackingMode(true);
    setTimeout(() => scrollToElement('tracking-container'), 80);
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
      className="min-h-screen flex flex-col transition-colors"
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
        className="sticky top-0 z-40 backdrop-blur-md border-b shadow-sm"
        style={{
          backgroundColor: theme.isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          borderColor: theme.borderColor
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBackToCatalog && (
              <button
                type="button"
                onClick={onBackToCatalog}
                className="p-2 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 transition-opacity hover:opacity-80"
                style={{ borderColor: theme.borderColor, color: theme.textColor }}
                title="عرض كل منتجات المتجر"
              >
                <ArrowRight className="w-4 h-4" />
                <span className="hidden sm:inline">المتجر</span>
              </button>
            )}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {store.name.slice(0, 1)}
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
            <button
              type="button"
              onClick={() => scrollToElement('track-search-section')}
              className="px-3 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 border whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: theme.softTintColor,
                borderColor: theme.borderColor,
                color: theme.textColor
              }}
            >
              <Search className="w-3.5 h-3.5" style={{ color: theme.primaryColor }} />
              <span className="hidden sm:inline">تتبع طلبك</span>
            </button>
            <button
              type="button"
              onClick={handleHeaderOrderClick}
              className="text-white px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              style={{ backgroundColor: theme.primaryColor }}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>أطلب الآن</span>
            </button>
          </div>
        </div>
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
                  <img
                    src={activeImage}
                    alt={page.title}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageOff className="w-10 h-10" />
                    <span className="text-xs">صورة المنتج</span>
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
                        className="rounded-xl overflow-hidden shadow-sm focus:outline-none transition border-2"
                        style={{
                          backgroundColor: theme.surfaceColor,
                          borderColor: isSelected ? theme.primaryColor : 'transparent'
                        }}
                      >
                        <img
                          src={imgUrl}
                          alt={`${page.title} ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-16 object-cover"
                        />
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
                    <div
                      key={offer.id}
                      onClick={() => setSelectedOfferId(offer.id)}
                      className="p-3.5 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all relative overflow-hidden"
                      style={{
                        backgroundColor: isActive ? theme.softTintColor : theme.surfaceColor,
                        borderColor: isActive ? theme.primaryColor : theme.borderColor,
                        boxShadow: isActive ? '0 4px 12px rgba(0, 0, 0, 0.08)' : 'none'
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
                          {isActive && (
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: theme.primaryColor }}
                            />
                          )}
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
                    </div>
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
                  <span
                    className="text-2xl font-black tabular-nums"
                    style={{ color: theme.primaryColor }}
                  >
                    {formatDZD(productPrice)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => scrollToElement('form-container')}
                  className="w-full py-3.5 px-6 rounded-xl text-white font-extrabold text-sm sm:text-base text-center shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>اضغط هنا لتأكيد الطلب والدفع عند الاستلام</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Order Form & Tracking Section */}
      <section
        id="order-form"
        className="py-12 border-t flex-1"
        style={{
          backgroundColor: theme.surfaceColor,
          borderColor: theme.borderColor
        }}
      >
        <div className="max-w-3xl mx-auto px-4">
          {!isTrackingMode ? (
            <>
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
                    className={`w-full p-3 rounded-xl border text-sm text-center font-bold font-mono focus:outline-none ${subtleInputBg}`}
                  />
                  <button
                    type="button"
                    onClick={handleSearchOrder}
                    disabled={isSearchingOrder}
                    className="text-white px-5 py-3 rounded-xl font-bold text-sm shrink-0 transition cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {isSearchingOrder ? 'بحث...' : 'بحث'}
                  </button>
                </div>
                {searchError && (
                  <p className="text-xs font-bold text-rose-600">{searchError}</p>
                )}
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

                {formError && (
                  <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleCheckoutSubmit} className="space-y-5">
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
                      <label
                        className="flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition"
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
                      </label>

                      <label
                        className="flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition"
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
                      </label>
                    </div>
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
                      <span className="font-bold">{formatDZD(productPrice)}</span>
                    </div>
                    <div className={`flex justify-between ${mutedTextClass}`}>
                      <span>مصاريف التوصيل ({selectedWilaya.nameAr}):</span>
                      <span className="font-bold" style={{ color: theme.primaryColor }}>
                        {shippingCost === 0 ? 'مجاني' : formatDZD(shippingCost)}
                      </span>
                    </div>
                    <div
                      className="pt-2 border-t flex justify-between text-base font-extrabold"
                      style={{ borderColor: theme.borderColor }}
                    >
                      <span>المجموع الكلي للدفع:</span>
                      <span className="text-xl" style={{ color: theme.primaryColor }}>
                        {formatDZD(grandTotal)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || page.stock <= 0}
                    className="w-full py-4 px-6 rounded-xl text-white font-black text-base sm:text-lg shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* Order Tracking Container */
            trackedOrder && (
              <div
                id="tracking-container"
                className="rounded-3xl p-6 sm:p-8 border-2 shadow-xl space-y-6"
                style={{
                  backgroundColor: theme.bgColor,
                  borderColor: theme.borderColor
                }}
              >
                <div className="text-center space-y-2 border-b pb-6" style={{ borderColor: theme.borderColor }}>
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
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
                  <div className="flex justify-between border-b pb-2" style={{ borderColor: theme.borderColor }}>
                    <span className={mutedTextClass}>رقم الطلب:</span>
                    <span className="font-bold font-mono" style={{ color: theme.primaryColor }}>
                      {trackedOrder.orderNumber}
                    </span>
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

                  {trackedEditSuccess && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold text-center">
                      {trackedEditSuccess}
                    </div>
                  )}

                  {trackedOrder.status === 'new' && !isEditingTrackedOrder && (
                    <div className="pt-2 border-t" style={{ borderColor: theme.borderColor }}>
                      <button
                        type="button"
                        onClick={openTrackedOrderEditor}
                        className="w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        style={{
                          backgroundColor: theme.surfaceColor,
                          borderColor: theme.primaryColor,
                          color: theme.primaryColor
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل المنتج / العرض أو الوجهة والتوصيل</span>
                      </button>
                    </div>
                  )}

                  {trackedOrder.status === 'new' && isEditingTrackedOrder && (
                    <form
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
                    </form>
                  )}
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
                        <div key={stage.title} className="flex items-start gap-4">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm"
                            style={
                              isDone
                                ? { backgroundColor: theme.primaryColor, color: '#ffffff' }
                                : { backgroundColor: '#e2e8f0', color: '#64748b' }
                            }
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="space-y-0.5">
                            <h4 className={`font-bold text-sm ${isDone ? '' : 'text-slate-400'}`}>
                              {stage.title}
                            </h4>
                            <p className={`text-xs ${isDone ? mutedTextClass : 'text-slate-400'}`}>
                              {stage.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 space-y-2.5">
                  <a
                    href={buildOrderTrackingWhatsAppUrl(effectiveWhatsapp, store.name, {
                      orderNumber: trackedOrder.orderNumber,
                      customerName: trackedOrder.customerFirstName,
                      bundleDetails: trackedOrder.bundleLabel,
                      total: trackedOrder.total,
                      status: trackedOrder.status,
                      trackingCode: trackedOrder.trackingCode
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 bg-[#25D366] hover:bg-emerald-600 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>تواصل معنا عبر واتساب لمتابعة الطلب</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setOrderPromptModalOpen(true)}
                    className="w-full py-3 rounded-xl font-bold text-sm transition border cursor-pointer"
                    style={{
                      backgroundColor: theme.surfaceColor,
                      borderColor: theme.borderColor
                    }}
                  >
                    إجراء طلب جديد أو بحث آخر
                  </button>
                </div>
              </div>
            )
          )}
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
      {successModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
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
              <a
                href={successModalData.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 bg-[#25D366] hover:bg-emerald-600 text-white font-extrabold rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md"
              >
                <MessageCircle className="w-5 h-5" />
                <span>تأكيد الطلب الآن عبر واتساب</span>
              </a>
            </div>

            <button
              type="button"
              onClick={handleProceedToTrackingFromSuccess}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-sm cursor-pointer"
            >
              الانتقال لمتابعة مراحل التتبع
            </button>
          </div>
        </div>
      )}

      {/* Smart Header New Order Modal */}
      {newOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4">
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
              <button
                type="button"
                onClick={() => resetToNewOrder('form-container')}
                className="w-full text-white py-2.5 rounded-xl font-bold text-sm shadow-md cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                الانتقال إلى صفحة الطلب
              </button>
              <button
                type="button"
                onClick={() => resetToNewOrder('offers-section')}
                className="w-full py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                style={{ backgroundColor: theme.softTintColor, color: theme.primaryColor }}
              >
                اختر الباقة المناسبة
              </button>
              <button
                type="button"
                onClick={() => setNewOrderModalOpen(false)}
                className="w-full text-slate-500 hover:text-slate-700 py-1.5 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Prompt Modal (Copy Order Number / New Order / Stay Tracking) */}
      {orderPromptModalOpen && trackedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4">
            <button
              type="button"
              onClick={() => setOrderPromptModalOpen(false)}
              className="float-left text-slate-400 hover:text-slate-600"
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
              <button
                type="button"
                onClick={handleCopyOrderNumber}
                className="text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedOrderId ? 'تم النسخ' : 'نسخ الرقم'}</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => resetToNewOrder('form-container')}
                className="w-full text-white py-2.5 rounded-xl font-bold text-sm shadow-md cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                إجراء طلب جديد
              </button>
              <button
                type="button"
                onClick={() => setOrderPromptModalOpen(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
              >
                تتبع طلبه (البقاء على صفحة التتبع)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
