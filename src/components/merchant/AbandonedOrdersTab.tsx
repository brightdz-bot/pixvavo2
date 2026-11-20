import React, { useMemo, useState } from 'react';
import {
  AbandonedOrder,
  AbandonedOrderStatus,
  DeliveryType,
  LandingPage,
  Store,
  StoreApiConfig
} from '../../types';
import { ALGERIA_WILAYAS, formatDZD } from '../../data/wilayas';
import {
  ABANDONED_STAGE_LABELS,
  DEFAULT_WHATSAPP_ABANDONED_TEMPLATE,
  buildAbandonedReminderWhatsAppUrl
} from '../../services/integrations';
import { ABANDONED_SQL_MIGRATION_SNIPPET } from '../../services/storage';
import { validateAlgerianPhone, validateCustomerName } from '../../utils/orderValidation';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Home,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserX,
  X,
  XCircle
} from 'lucide-react';

export interface ConvertAbandonedPayload {
  abandoned: AbandonedOrder;
  customerName: string;
  customerPhone: string;
  landingPageId: string;
  offerId: string;
  wilayaId: string;
  wilayaName: string;
  commune: string;
  deliveryType: DeliveryType;
  confirmImmediately: boolean;
}

interface Props {
  store: Store;
  abandonedOrders: AbandonedOrder[];
  landingPages: LandingPage[];
  apiConfig: StoreApiConfig | null;
  isLoading?: boolean;
  isSyncingSheet: boolean;
  lastSyncError: string | null;
  needsSqlMigration: boolean;
  onDismissSyncError: () => void;
  onDismissSqlNotice: () => void;
  onSyncWithSheet: () => Promise<void>;
  onUpdateStatus: (item: AbandonedOrder, status: AbandonedOrderStatus) => Promise<void>;
  onDeleteItems: (items: AbandonedOrder[]) => Promise<void>;
  onConvertToOrder: (payload: ConvertAbandonedPayload) => Promise<{ success: boolean; error?: string }>;
  onSaveReminderTemplate: (template: string) => Promise<void>;
  onOpenOrderByNumber?: (orderNumber: string) => void;
}

const TEMPLATE_VARIABLES = [
  { key: '{customerName}', label: 'اسم الزبون' },
  { key: '{product}', label: 'المنتج' },
  { key: '{offer}', label: 'العرض' },
  { key: '{total}', label: 'المجموع' },
  { key: '{wilaya}', label: 'الولاية والبلدية' },
  { key: '{storeName}', label: 'اسم المتجر' }
];

function formatRelativeArabicTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} س`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `منذ ${diffDays} ي`;
  try {
    return new Date(ts).toLocaleDateString('ar-DZ', {
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export const AbandonedOrdersTab: React.FC<Props> = ({
  store,
  abandonedOrders,
  landingPages,
  apiConfig,
  isLoading = false,
  isSyncingSheet,
  lastSyncError,
  needsSqlMigration,
  onDismissSyncError,
  onDismissSqlNotice,
  onSyncWithSheet,
  onUpdateStatus,
  onDeleteItems,
  onConvertToOrder,
  onSaveReminderTemplate,
  onOpenOrderByNumber
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | AbandonedOrderStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlDetails, setShowSqlDetails] = useState(false);

  // Delete confirmation dialog state
  const [deleteTargets, setDeleteTargets] = useState<AbandonedOrder[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // WhatsApp Template Modal state
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(
    apiConfig?.whatsappAbandonedTemplate || DEFAULT_WHATSAPP_ABANDONED_TEMPLATE
  );
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Convert to Confirmed Order Modal state
  const [convertingItem, setConvertingItem] = useState<AbandonedOrder | null>(null);
  const [convName, setConvName] = useState('');
  const [convPhone, setConvPhone] = useState('');
  const [convPageId, setConvPageId] = useState('');
  const [convOfferId, setConvOfferId] = useState('');
  const [convWilayaId, setConvWilayaId] = useState('16');
  const [convCommune, setConvCommune] = useState('');
  const [convDeliveryType, setConvDeliveryType] = useState<DeliveryType>('home');
  const [convConfirmNow, setConvConfirmNow] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // KPIs
  const metrics = useMemo(() => {
    const openItems = abandonedOrders.filter(a => a.status === 'new' || a.status === 'contacted');
    const newCount = abandonedOrders.filter(a => a.status === 'new').length;
    const contactedCount = abandonedOrders.filter(a => a.status === 'contacted').length;
    const recoveredCount = abandonedOrders.filter(a => a.status === 'recovered').length;
    const dismissedCount = abandonedOrders.filter(a => a.status === 'dismissed').length;
    const pendingValue = openItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const totalCount = abandonedOrders.length;
    const recoveryRate = totalCount > 0 ? Math.round((recoveredCount / totalCount) * 100) : 0;
    return {
      totalCount,
      openCount: openItems.length,
      newCount,
      contactedCount,
      recoveredCount,
      dismissedCount,
      pendingValue,
      recoveryRate
    };
  }, [abandonedOrders]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return abandonedOrders.filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        item.customerName,
        item.customerPhone,
        item.wilayaName,
        item.commune,
        item.landingPageTitle,
        item.bundleLabel,
        item.variantLabel,
        item.recoveredOrderNumber
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [abandonedOrders, statusFilter, searchQuery]);

  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every(item => selectedIds.includes(item.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(i => i.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleCopyPhone = (id: string, phone: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(phone).catch(() => {});
    }
    setCopiedPhoneId(id);
    window.setTimeout(() => {
      setCopiedPhoneId(prev => (prev === id ? null : prev));
    }, 1600);
  };

  const handleCopySql = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(ABANDONED_SQL_MIGRATION_SNIPPET).catch(() => {});
    }
    setCopiedSql(true);
    window.setTimeout(() => setCopiedSql(false), 2000);
  };

  const openTemplateModal = () => {
    setTemplateDraft(apiConfig?.whatsappAbandonedTemplate?.trim() || DEFAULT_WHATSAPP_ABANDONED_TEMPLATE);
    setTemplateModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    setIsSavingTemplate(true);
    await onSaveReminderTemplate(templateDraft.trim());
    setIsSavingTemplate(false);
    setTemplateModalOpen(false);
  };

  const openConvertModal = (item: AbandonedOrder) => {
    const matchedPage =
      landingPages.find(p => p.id === item.landingPageId) ||
      landingPages.find(
        p => item.landingPageTitle && p.title.trim() === item.landingPageTitle.trim()
      ) ||
      landingPages[0];

    const matchedOffer =
      matchedPage?.offers.find(o => o.id === item.offerId) ||
      matchedPage?.offers.find(o => item.bundleLabel && o.title.trim() === item.bundleLabel.trim()) ||
      matchedPage?.offers.find(o => o.isDefault) ||
      matchedPage?.offers[0];

    const matchedWilaya =
      ALGERIA_WILAYAS.find(w => w.id === item.wilayaId) ||
      ALGERIA_WILAYAS.find(
        w => item.wilayaName && (w.nameAr === item.wilayaName || item.wilayaName.includes(w.nameAr))
      ) ||
      ALGERIA_WILAYAS[15];

    const initialCommune =
      item.commune && matchedWilaya.communes.includes(item.commune)
        ? item.commune
        : matchedWilaya.communes[0] || '';

    setConvertingItem(item);
    setConvName(item.customerName || '');
    setConvPhone(item.customerPhone || '');
    setConvPageId(matchedPage?.id || '');
    setConvOfferId(matchedOffer?.id || '');
    setConvWilayaId(matchedWilaya.id);
    setConvCommune(initialCommune);
    setConvDeliveryType(item.deliveryType === 'stop' ? 'stop' : 'home');
    setConvConfirmNow(true);
    setConvError(null);
  };

  const selectedConvertPage = useMemo(
    () => landingPages.find(p => p.id === convPageId) || landingPages[0],
    [landingPages, convPageId]
  );

  const selectedConvertOffer = useMemo(
    () =>
      selectedConvertPage?.offers.find(o => o.id === convOfferId) ||
      selectedConvertPage?.offers[0],
    [selectedConvertPage, convOfferId]
  );

  const selectedConvertWilaya = useMemo(
    () => ALGERIA_WILAYAS.find(w => w.id === convWilayaId) || ALGERIA_WILAYAS[15],
    [convWilayaId]
  );

  const computedConvertPricing = useMemo(() => {
    const subtotal = selectedConvertOffer?.price || convertingItem?.subtotal || 0;
    let shippingFee =
      convDeliveryType === 'stop'
        ? selectedConvertWilaya.stopFee
        : selectedConvertWilaya.homeFee;
    const customRate = store.customWilayaRates?.[selectedConvertWilaya.id];
    if (customRate && customRate[convDeliveryType] !== undefined) {
      shippingFee = customRate[convDeliveryType];
    } else if (
      convDeliveryType === 'home' &&
      store.customWilayaFees?.[selectedConvertWilaya.id] !== undefined
    ) {
      shippingFee = store.customWilayaFees[selectedConvertWilaya.id];
    }
    if (store.freeShippingThreshold > 0 && subtotal >= store.freeShippingThreshold) {
      shippingFee = 0;
    }
    return {
      subtotal,
      shippingFee,
      total: subtotal + shippingFee
    };
  }, [selectedConvertOffer, convertingItem, convDeliveryType, selectedConvertWilaya, store]);

  const handleConfirmConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingItem) return;
    setConvError(null);

    const nameCheck = validateCustomerName(convName);
    if (!nameCheck.valid) {
      setConvError(nameCheck.error || 'يرجى إدخال اسم الزبون الكامل قبل التحويل');
      return;
    }
    const phoneCheck = validateAlgerianPhone(convPhone);
    if (!phoneCheck.valid) {
      setConvError(phoneCheck.error || 'رقم الهاتف غير صالح');
      return;
    }
    if (!selectedConvertPage || !selectedConvertOffer) {
      setConvError('يرجى اختيار صفحة هبوط وعرض صالحين قبل إنشاء الطلب');
      return;
    }
    if (!convCommune.trim()) {
      setConvError('يرجى اختيار البلدية');
      return;
    }

    setIsConverting(true);
    const res = await onConvertToOrder({
      abandoned: convertingItem,
      customerName: nameCheck.cleaned,
      customerPhone: phoneCheck.normalized,
      landingPageId: selectedConvertPage.id,
      offerId: selectedConvertOffer.id,
      wilayaId: selectedConvertWilaya.id,
      wilayaName: selectedConvertWilaya.nameAr,
      commune: convCommune.trim(),
      deliveryType: convDeliveryType,
      confirmImmediately: convConfirmNow
    });
    setIsConverting(false);

    if (res.success) {
      setConvertingItem(null);
    } else {
      setConvError(res.error || 'تعذر تحويل الطلب المتروك حالياً');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargets || deleteTargets.length === 0) return;
    setIsDeleting(true);
    await onDeleteItems(deleteTargets);
    setSelectedIds(prev => prev.filter(id => !deleteTargets.some(t => t.id === id)));
    setIsDeleting(false);
    setDeleteTargets(null);
  };

  const renderStatusIndicator = (status: AbandonedOrderStatus) => {
    switch (status) {
      case 'new':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{ABANDONED_STAGE_LABELS.new}</span>
          </span>
        );
      case 'contacted':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400">
            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{ABANDONED_STAGE_LABELS.contacted}</span>
          </span>
        );
      case 'recovered':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{ABANDONED_STAGE_LABELS.recovered}</span>
          </span>
        );
      case 'dismissed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{ABANDONED_STAGE_LABELS.dismissed}</span>
          </span>
        );
    }
  };

  const filterTabs: Array<{ id: 'all' | AbandonedOrderStatus; label: string; count: number }> = [
    { id: 'all', label: 'الكل', count: metrics.totalCount },
    { id: 'new', label: 'جديد', count: metrics.newCount },
    { id: 'contacted', label: 'تم التواصل', count: metrics.contactedCount },
    { id: 'recovered', label: 'تم الاسترجاع', count: metrics.recoveredCount },
    { id: 'dismissed', label: 'مستبعد', count: metrics.dismissedCount }
  ];

  const selectedObjects = useMemo(
    () => abandonedOrders.filter(item => selectedIds.includes(item.id)),
    [abandonedOrders, selectedIds]
  );

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            الطلبات المتروكة
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            التقاط تلقائي لكل زبون يكتب رقم هاتفه في الاستمارة ولم يكمل الطلب، مع استرجاع سريع عبر واتساب أو تحويل مباشر لطلب مؤكد.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openTemplateModal}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>تخصيص رسالة التذكير</span>
          </button>

          <button
            type="button"
            onClick={() => void onSyncWithSheet()}
            disabled={isSyncingSheet}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />
            <span>{isSyncingSheet ? 'جارٍ المزامنة...' : 'مزامنة ورقة غوغل'}</span>
          </button>
        </div>
      </div>

      {/* KPI Strip — 4 flat hairline cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            طلبات متروكة للمتابعة
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {metrics.openCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {metrics.newCount} جديد · {metrics.contactedCount} تم التواصل
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            طلبات تم استرجاعها
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {metrics.recoveredCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            تحوّلت إلى طلبات فعلية
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            قيمة المبيعات المعلّقة
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {formatDZD(metrics.pendingValue)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            مجموع الطلبات غير المؤكدة
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            نسبة الاسترجاع
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {metrics.recoveryRate}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            من إجمالي {metrics.totalCount} جلسة ملتقطة
          </div>
        </div>
      </div>

      {/* Optional Error Banner */}
      {lastSyncError && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{lastSyncError}</span>
          </div>
          <button
            type="button"
            onClick={onDismissSyncError}
            className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Optional Self-Healing SQL Migration Notice */}
      {needsSqlMigration && (
        <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  تفعيل جدول الطلبات المتروكة الدائم في قاعدة البيانات
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  الطلبات المتروكة تُحفظ حالياً محلياً وعلى الخادم، ولتخزينها بشكل دائم في قاعدة البيانات شغّل هذا الكود مرة واحدة فقط.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopySql}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'تم النسخ' : 'نسخ كود التفعيل'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSqlDetails(v => !v)}
                className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-bold cursor-pointer"
              >
                {showSqlDetails ? 'إخفاء' : 'عرض الكود'}
              </button>
              <button
                type="button"
                onClick={onDismissSqlNotice}
                className="p-1 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showSqlDetails && (
            <pre
              dir="ltr"
              className="p-3 rounded-xl bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed"
            >
              {ABANDONED_SQL_MIGRATION_SNIPPET}
            </pre>
          )}
        </div>
      )}

      {/* Filter Toolbar & Main Container */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Segmented Filter Control */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 w-fit">
            {filterTabs.map(tab => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer tabular-nums ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          {/* Search & Bulk Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedObjects.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteTargets(selectedObjects)}
                className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد ({selectedObjects.length})</span>
              </button>
            )}

            <div className="relative flex-1 sm:flex-initial sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث بالهاتف أو الاسم أو الولاية..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Content States */}
        {isLoading ? (
          <div className="p-12 text-center space-y-2.5">
            <Loader2 className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
              جارٍ تحميل الطلبات المتروكة...
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <UserX className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {abandonedOrders.length === 0
                  ? 'لا توجد طلبات متروكة حتى الآن'
                  : 'لا توجد نتائج مطابقة للبحث أو الفلتر'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                {abandonedOrders.length === 0
                  ? 'بمجرد أن يكتب أي زائر رقم هاتفه في استمارة الطلب دون إكمال التأكيد، سيظهر هنا تلقائياً لتتمكن من استرجاعه بضغطة زر.'
                  : 'جرّب تغيير الفلتر أو مسح نص البحث لعرض بقية السجلات.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="تحديد الكل"
                        className="rounded border-slate-300 dark:border-slate-600 accent-emerald-600 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">الزبون والهاتف</th>
                    <th className="py-3 px-4">المنتج والعرض</th>
                    <th className="py-3 px-4">الوجهة والتوصيل</th>
                    <th className="py-3 px-4">المجموع</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4 text-left">إجراءات الاسترجاع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {filteredItems.map(item => {
                    const waUrl = buildAbandonedReminderWhatsAppUrl(
                      item.customerPhone,
                      store.name,
                      item,
                      apiConfig?.whatsappAbandonedTemplate
                    );
                    const isChecked = selectedIds.includes(item.id);
                    const isRecovered = item.status === 'recovered';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3.5 px-4 align-middle">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectOne(item.id)}
                            aria-label={`تحديد ${item.customerPhone}`}
                            className="rounded border-slate-300 dark:border-slate-600 accent-emerald-600 cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-4 align-middle">
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {item.customerName?.trim() || 'زبون لم يكمل الاسم'}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                              <span dir="ltr">{item.customerPhone}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(item.id, item.customerPhone)}
                                className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                                title="نسخ رقم الهاتف"
                              >
                                {copiedPhoneId === item.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <span className="text-slate-400 font-sans">
                                · {formatRelativeArabicTime(item.updatedAt || item.createdAt)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-middle max-w-[240px]">
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {item.landingPageTitle || item.bundleLabel || 'منتج المتجر'}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {[
                                item.bundleLabel && item.bundleLabel !== item.landingPageTitle
                                  ? item.bundleLabel
                                  : '',
                                item.variantLabel || ''
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'العرض الافتراضي'}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-middle">
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {[item.wilayaName, item.commune].filter(Boolean).join(' · ') ||
                                'لم تُحدد بعد'}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {item.deliveryType === 'stop' ? 'مكتب الشحن' : 'توصيل للمنزل'}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-middle font-extrabold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                          {item.total > 0 ? formatDZD(item.total) : '—'}
                        </td>

                        <td className="py-3.5 px-4 align-middle">
                          <div className="space-y-1">
                            {renderStatusIndicator(item.status)}
                            {item.recoveredOrderNumber && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenOrderByNumber &&
                                    onOpenOrderByNumber(item.recoveredOrderNumber!)
                                  }
                                  className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                  dir="ltr"
                                >
                                  <span>#{item.recoveredOrderNumber}</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-middle">
                          <div className="flex items-center justify-end gap-1.5">
                            {waUrl && !isRecovered && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  if (item.status === 'new') {
                                    void onUpdateStatus(item, 'contacted');
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>تذكير واتساب</span>
                              </a>
                            )}

                            {!isRecovered && (
                              <button
                                type="button"
                                onClick={() => openConvertModal(item)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>تحويل لطلب</span>
                              </button>
                            )}

                            {item.status !== 'dismissed' && !isRecovered && (
                              <button
                                type="button"
                                onClick={() => void onUpdateStatus(item, 'dismissed')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="استبعاد"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}

                            {item.status === 'dismissed' && (
                              <button
                                type="button"
                                onClick={() => void onUpdateStatus(item, 'new')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="إعادة للقائمة"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setDeleteTargets([item])}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                              title="حذف نهائي"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile List View */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map(item => {
                const waUrl = buildAbandonedReminderWhatsAppUrl(
                  item.customerPhone,
                  store.name,
                  item,
                  apiConfig?.whatsappAbandonedTemplate
                );
                const isChecked = selectedIds.includes(item.id);
                const isRecovered = item.status === 'recovered';

                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(item.id)}
                          aria-label={`تحديد ${item.customerPhone}`}
                          className="mt-1 rounded border-slate-300 dark:border-slate-600 accent-emerald-600 cursor-pointer"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {item.customerName?.trim() || 'زبون لم يكمل الاسم'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                            <span dir="ltr">{item.customerPhone}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyPhone(item.id, item.customerPhone)}
                              className="text-slate-400 hover:text-emerald-600 cursor-pointer"
                            >
                              {copiedPhoneId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0 space-y-0.5">
                        {renderStatusIndicator(item.status)}
                        <div className="text-[11px] text-slate-400">
                          {formatRelativeArabicTime(item.updatedAt || item.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pr-6">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {[item.landingPageTitle, item.bundleLabel, item.variantLabel]
                          .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
                          .join(' · ') || 'منتج المتجر'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {[
                          [item.wilayaName, item.commune].filter(Boolean).join(' - ') ||
                            'العنوان غير مكتمل',
                          item.deliveryType === 'stop' ? 'مكتب الشحن' : 'للمنزل',
                          item.total > 0 ? formatDZD(item.total) : ''
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pr-6">
                      {waUrl && !isRecovered && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            if (item.status === 'new') {
                              void onUpdateStatus(item, 'contacted');
                            }
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>تذكير واتساب</span>
                        </a>
                      )}

                      {!isRecovered && (
                        <button
                          type="button"
                          onClick={() => openConvertModal(item)}
                          className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>تحويل لطلب</span>
                        </button>
                      )}

                      {item.recoveredOrderNumber && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenOrderByNumber &&
                            onOpenOrderByNumber(item.recoveredOrderNumber!)
                          }
                          className="py-1.5 px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-bold inline-flex items-center gap-1 cursor-pointer"
                          dir="ltr"
                        >
                          <span>#{item.recoveredOrderNumber}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeleteTargets([item])}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Convert to Order Modal */}
      {convertingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="تحويل الطلب المتروك إلى طلب مؤكد"
          onClick={() => !isConverting && setConvertingItem(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  تحويل الطلب المتروك إلى طلب رسمي
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  راجع بيانات الزبون أو أكمل النواقص ثم أنشئ الطلب مباشرة في قسم الطلبات
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isConverting && setConvertingItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmConvert} className="p-5 space-y-4 overflow-y-auto">
              {convError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{convError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الكامل للزبون <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={convName}
                    onChange={e => setConvName(e.target.value)}
                    placeholder="أدخل اسم الزبون بعد الاتصال"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الهاتف <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      dir="ltr"
                      required
                      value={convPhone}
                      onChange={e => setConvPhone(e.target.value)}
                      className="w-full px-3 py-2.5 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-right text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    صفحة الهبوط / المنتج
                  </label>
                  <select
                    value={selectedConvertPage?.id || ''}
                    onChange={e => {
                      const nextId = e.target.value;
                      setConvPageId(nextId);
                      const nextPage = landingPages.find(p => p.id === nextId);
                      const defOffer =
                        nextPage?.offers.find(o => o.isDefault) || nextPage?.offers[0];
                      setConvOfferId(defOffer?.id || '');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {landingPages.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    العرض والكمية
                  </label>
                  <select
                    value={selectedConvertOffer?.id || ''}
                    onChange={e => setConvOfferId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {(selectedConvertPage?.offers || []).map(o => (
                      <option key={o.id} value={o.id}>
                        {o.title} — {formatDZD(o.price)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الولاية
                  </label>
                  <select
                    value={selectedConvertWilaya.id}
                    onChange={e => {
                      const nextW =
                        ALGERIA_WILAYAS.find(w => w.id === e.target.value) || ALGERIA_WILAYAS[15];
                      setConvWilayaId(nextW.id);
                      setConvCommune(nextW.communes[0] || '');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {ALGERIA_WILAYAS.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    البلدية
                  </label>
                  <select
                    value={convCommune}
                    onChange={e => setConvCommune(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {selectedConvertWilaya.communes.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Delivery Type */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setConvDeliveryType('home')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    convDeliveryType === 'home'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span>توصيل للمنزل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConvDeliveryType('stop')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    convDeliveryType === 'stop'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>مكتب الشحن</span>
                </button>
              </div>

              {/* Confirm Immediately Checkbox */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={convConfirmNow}
                  onChange={e => setConvConfirmNow(e.target.checked)}
                  className="rounded border-slate-300 accent-emerald-600"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  تسجيل الطلب بحالة «مؤكد» مباشرة (وإرساله إلى جدول الطلبات الرئيسي)
                </span>
              </label>

              {/* Price Summary */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs tabular-nums">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>سعر البضاعة</span>
                  <span>{formatDZD(computedConvertPricing.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span>تكلفة التوصيل</span>
                  <span>
                    {computedConvertPricing.shippingFee === 0
                      ? 'مجاني'
                      : formatDZD(computedConvertPricing.shippingFee)}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm font-extrabold text-slate-900 dark:text-white">
                  <span>المجموع الكلي</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {formatDZD(computedConvertPricing.total)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isConverting}
                  onClick={() => setConvertingItem(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isConverting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isConverting ? 'جارٍ إنشاء الطلب...' : 'تأكيد وتحويل الطلب'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Reminder Template Modal */}
      {templateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="تخصيص رسالة تذكير واتساب"
          onClick={() => !isSavingTemplate && setTemplateModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  تخصيص رسالة تذكير واتساب
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  تُستخدم هذه الرسالة تلقائياً عند الضغط على زر «تذكير واتساب» لأي طلب متروك
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isSavingTemplate && setTemplateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  إدراج متغير تلقائي في نص الرسالة:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => setTemplateDraft(prev => `${prev}${prev ? ' ' : ''}${v.key}`)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={7}
                value={templateDraft}
                onChange={e => setTemplateDraft(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTemplateDraft(DEFAULT_WHATSAPP_ABANDONED_TEMPLATE)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  استعادة النص الافتراضي
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingTemplate}
                    onClick={() => setTemplateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={isSavingTemplate}
                    onClick={() => void handleSaveTemplate()}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                  >
                    {isSavingTemplate ? 'جارٍ الحفظ...' : 'حفظ الرسالة'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargets && deleteTargets.length > 0)}
        title={
          deleteTargets && deleteTargets.length > 1
            ? `حذف ${deleteTargets.length} طلبات متروكة نهائياً؟`
            : 'حذف هذا الطلب المتروك نهائياً؟'
        }
        message="سيتم حذف السجل من لوحة المتجر ومن ورقة الطلبات المتروكة في غوغل شيت إن كانت مفعّلة."
        confirmLabel={isDeleting ? 'جارٍ الحذف...' : 'حذف نهائي'}
        danger
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => !isDeleting && setDeleteTargets(null)}
      />
    </div>
  );
};
