import React, { useState, useEffect, useMemo } from 'react';
import {
  BlacklistEntry,
  DeliveryType,
  LandingPage,
  Order,
  OrderStatus,
  Store,
  StoreApiConfig
} from '../../types';
import { ALGERIA_WILAYAS, formatDZD, formatPlainDZD } from '../../data/wilayas';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  COURIER_PROVIDER_INFO,
  exportOrdersToCourierCsv,
  exportOrdersToExcel,
  normalizePhoneCanonical,
  normalizeWhatsAppNumber
} from '../../services/integrations';
import {
  Search,
  Eye,
  Phone,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
  FileText,
  Printer,
  MessageCircle,
  Tag,
  Pencil,
  RefreshCw,
  Send,
  Loader2,
  ExternalLink,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  ShieldCheck,
  Ban,
  AlertTriangle,
  CopyCheck,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  X
} from 'lucide-react';

interface Props {
  store: Store;
  orders: Order[];
  landingPages?: LandingPage[];
  apiConfig?: StoreApiConfig | null;
  courierBusyOrderId?: string | null;
  lastCourierError?: {
    orderNumber: string;
    message: string;
    timestamp: string;
  } | null;
  onDismissCourierError?: () => void;
  onGoToApiConfig?: () => void;
  onUpdateStatus: (
    orderId: string,
    newStatus: OrderStatus,
    note?: string,
    trackingCode?: string
  ) => void;
  onBulkUpdateStatus?: (
    orderIds: string[],
    newStatus: OrderStatus,
    note?: string
  ) => Promise<void>;
  onBulkSendToCourier?: (ordersToSend: Order[]) => Promise<void>;
  onSaveAntiFraudConfig?: (
    patch: Partial<
      Pick<
        StoreApiConfig,
        | 'antiFraudEnabled'
        | 'duplicateWindowHours'
        | 'dailyMaxOrdersPerPhone'
        | 'autoFlagReturnsThreshold'
        | 'blacklistedPhones'
      >
    >,
    successMsg?: string
  ) => Promise<void>;
  onUpdateOrderDetails?: (params: {
    orderNumber: string;
    offerId?: string;
    bundleLabel?: string;
    wilayaId?: string;
    commune?: string;
    deliveryType?: DeliveryType;
  }) => Promise<boolean>;
  onSendOrderToCourier?: (order: Order) => Promise<void>;
  onPullCourierStatus?: (order: Order) => Promise<void>;
  onSendOrderWhatsAppApi?: (order: Order) => Promise<void>;
  onSyncFromGoogleSheet?: () => void;
  isSyncingSheet?: boolean;
  selectedOrder?: Order | null;
  onSelectOrder: (order: Order | null) => void;
}

interface OrderFraudFlags {
  isBlacklisted: boolean;
  blacklistReason?: string;
  isDuplicate: boolean;
  duplicateOrders: Order[];
  totalOrdersByPhone: number;
  cancelledCountByPhone: number;
  isHighReturnRisk: boolean;
  hasAnyFlag: boolean;
}

export const OrdersTab: React.FC<Props> = ({
  store,
  orders,
  landingPages = [],
  apiConfig,
  courierBusyOrderId,
  lastCourierError,
  onDismissCourierError,
  onGoToApiConfig,
  onUpdateStatus,
  onBulkUpdateStatus,
  onBulkSendToCourier,
  onSaveAntiFraudConfig,
  onUpdateOrderDetails,
  onSendOrderToCourier,
  onPullCourierStatus,
  onSendOrderWhatsAppApi,
  onSyncFromGoogleSheet,
  isSyncingSheet,
  selectedOrder,
  onSelectOrder
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [bulkCancelPendingIds, setBulkCancelPendingIds] = useState<string[] | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [printSlipOrders, setPrintSlipOrders] = useState<Order[]>([]);
  const [trackingCodeInput, setTrackingCodeInput] = useState<string>('');
  const [statusNoteInput, setStatusNoteInput] = useState<string>('');
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editOfferId, setEditOfferId] = useState('');
  const [editBundleText, setEditBundleText] = useState('');
  const [editWilayaId, setEditWilayaId] = useState('16');
  const [editCommune, setEditCommune] = useState('');
  const [editDeliveryType, setEditDeliveryType] = useState<DeliveryType>('home');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Anti-Fraud settings & Blacklist manager modal
  const [fraudModalOpen, setFraudModalOpen] = useState(false);
  const [afEnabled, setAfEnabled] = useState<boolean>(apiConfig?.antiFraudEnabled ?? true);
  const [afDailyMax, setAfDailyMax] = useState<number>(apiConfig?.dailyMaxOrdersPerPhone ?? 2);
  const [afDupWindowHours, setAfDupWindowHours] = useState<number>(
    apiConfig?.duplicateWindowHours ?? 24
  );
  const [afReturnThreshold, setAfReturnThreshold] = useState<number>(
    apiConfig?.autoFlagReturnsThreshold ?? 2
  );
  const [newBlacklistPhone, setNewBlacklistPhone] = useState('');
  const [newBlacklistReason, setNewBlacklistReason] = useState('');
  const [isSavingFraud, setIsSavingFraud] = useState(false);

  useEffect(() => {
    setAfEnabled(apiConfig?.antiFraudEnabled ?? true);
    setAfDailyMax(apiConfig?.dailyMaxOrdersPerPhone ?? 2);
    setAfDupWindowHours(apiConfig?.duplicateWindowHours ?? 24);
    setAfReturnThreshold(apiConfig?.autoFlagReturnsThreshold ?? 2);
  }, [
    apiConfig?.antiFraudEnabled,
    apiConfig?.dailyMaxOrdersPerPhone,
    apiConfig?.duplicateWindowHours,
    apiConfig?.autoFlagReturnsThreshold
  ]);

  // Keep selectedIds synced with existing orders
  useEffect(() => {
    const valid = new Set(orders.map(o => o.id));
    setSelectedIds(prev => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [orders]);

  const orderLandingPage = useMemo(
    () => landingPages.find(lp => lp.id === selectedOrder?.landingPageId) || null,
    [landingPages, selectedOrder?.landingPageId]
  );

  const editSelectedWilaya = useMemo(
    () => ALGERIA_WILAYAS.find(w => w.id === editWilayaId) || ALGERIA_WILAYAS[15],
    [editWilayaId]
  );

  useEffect(() => {
    setTrackingCodeInput(selectedOrder?.trackingCode || '');
    setStatusNoteInput('');
    setIsEditingDetails(false);
    if (selectedOrder) {
      const lp = landingPages.find(p => p.id === selectedOrder.landingPageId);
      const matchedOffer = lp?.offers.find(
        o =>
          selectedOrder.bundleLabel === `${o.title} (الكمية: ${o.quantity})` ||
          (selectedOrder.bundleLabel || '').includes(o.title)
      );
      setEditOfferId(matchedOffer?.id || '');
      setEditBundleText(selectedOrder.bundleLabel || selectedOrder.items[0]?.title || '');
      setEditWilayaId(selectedOrder.wilayaId || '16');
      setEditCommune(selectedOrder.commune || '');
      setEditDeliveryType(selectedOrder.deliveryType === 'stop' ? 'stop' : 'home');
    }
  }, [selectedOrder?.id]);

  // Anti-Fraud intelligence map for all orders
  const blacklistMap = useMemo(() => {
    const map = new Map<string, BlacklistEntry>();
    for (const entry of apiConfig?.blacklistedPhones || []) {
      const key = normalizePhoneCanonical(entry.phone);
      if (key) map.set(key, entry);
    }
    return map;
  }, [apiConfig?.blacklistedPhones]);

  const fraudFlagsByOrderId = useMemo(() => {
    const enabled = apiConfig?.antiFraudEnabled ?? true;
    const dupWindowMs = Math.max(1, Number(apiConfig?.duplicateWindowHours ?? 24)) * 3600 * 1000;
    const returnThresh = Math.max(1, Number(apiConfig?.autoFlagReturnsThreshold ?? 2));

    const ordersByPhone = new Map<string, Order[]>();
    for (const o of orders) {
      const key = normalizePhoneCanonical(o.customerPhone);
      if (!key) continue;
      const list = ordersByPhone.get(key);
      if (list) list.push(o);
      else ordersByPhone.set(key, [o]);
    }

    const result = new Map<string, OrderFraudFlags>();
    for (const o of orders) {
      const key = normalizePhoneCanonical(o.customerPhone);
      const blEntry = key ? blacklistMap.get(key) : undefined;
      const samePhoneOrders = key ? ordersByPhone.get(key) || [] : [];
      const orderTs = new Date(o.createdAt).getTime();

      const otherRecent = samePhoneOrders.filter(
        other =>
          other.id !== o.id &&
          other.status !== 'cancelled' &&
          Math.abs(new Date(other.createdAt).getTime() - orderTs) <= dupWindowMs
      );
      const cancelledCount = samePhoneOrders.filter(x => x.status === 'cancelled').length;

      const isBlacklisted = enabled && Boolean(blEntry);
      const isDuplicate = enabled && otherRecent.length > 0 && o.status !== 'cancelled';
      const isHighReturnRisk = enabled && cancelledCount >= returnThresh;

      result.set(o.id, {
        isBlacklisted,
        blacklistReason: blEntry?.reason,
        isDuplicate,
        duplicateOrders: otherRecent,
        totalOrdersByPhone: samePhoneOrders.length,
        cancelledCountByPhone: cancelledCount,
        isHighReturnRisk,
        hasAnyFlag: isBlacklisted || isDuplicate || isHighReturnRisk
      });
    }
    return result;
  }, [
    orders,
    blacklistMap,
    apiConfig?.antiFraudEnabled,
    apiConfig?.duplicateWindowHours,
    apiConfig?.autoFlagReturnsThreshold
  ]);

  const flaggedOrdersCount = useMemo(
    () => orders.filter(o => fraudFlagsByOrderId.get(o.id)?.hasAnyFlag).length,
    [orders, fraudFlagsByOrderId]
  );

  const statusConfigs: Record<OrderStatus, { label: string; badgeClass: string; icon: any }> = {
    new: {
      label: 'قيد التأكيد',
      badgeClass:
        'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      icon: Clock
    },
    confirmed: {
      label: 'التأكيد',
      badgeClass:
        'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
      icon: CheckCircle
    },
    shipping: {
      label: 'في شركة التوصيل',
      badgeClass:
        'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
      icon: Truck
    },
    delivered: {
      label: 'التسليم',
      badgeClass:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle
    },
    cancelled: {
      label: 'ملغي',
      badgeClass:
        'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      icon: XCircle
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'fraud'
          ? Boolean(fraudFlagsByOrderId.get(o.id)?.hasAnyFlag)
          : o.status === statusFilter;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.customerPhone.includes(search) ||
      o.wilayaName.toLowerCase().includes(search.toLowerCase()) ||
      (o.commune || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.trackingCode || '').toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusCount = (st: string) => {
    if (st === 'all') return orders.length;
    if (st === 'fraud') return flaggedOrdersCount;
    return orders.filter(o => o.status === st).length;
  };

  const selectedOrdersList = useMemo(
    () => orders.filter(o => selectedIds.has(o.id)),
    [orders, selectedIds]
  );

  const allFilteredSelected =
    filteredOrders.length > 0 && filteredOrders.every(o => selectedIds.has(o.id));

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredOrders.forEach(o => next.delete(o.id));
      } else {
        filteredOrders.forEach(o => next.add(o.id));
      }
      return next;
    });
  };

  const toggleSelectOne = (orderId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const eligibleCourierSelected = useMemo(
    () =>
      selectedOrdersList.filter(
        o => !o.trackingCode && (o.status === 'new' || o.status === 'confirmed')
      ),
    [selectedOrdersList]
  );

  const runBulkStatus = async (nextStatus: OrderStatus, note?: string) => {
    if (!onBulkUpdateStatus || selectedIds.size === 0) return;
    setIsBulkBusy(true);
    try {
      await onBulkUpdateStatus(Array.from(selectedIds), nextStatus, note);
      setSelectedIds(new Set());
    } finally {
      setIsBulkBusy(false);
    }
  };

  const runBulkCourier = async () => {
    if (!onBulkSendToCourier || eligibleCourierSelected.length === 0) return;
    setIsBulkBusy(true);
    try {
      await onBulkSendToCourier(eligibleCourierSelected);
      setSelectedIds(new Set());
    } finally {
      setIsBulkBusy(false);
    }
  };

  const handleToggleBlacklistPhone = async (rawPhone: string, defaultReason?: string) => {
    if (!onSaveAntiFraudConfig) return;
    const key = normalizePhoneCanonical(rawPhone);
    if (!key) return;
    const currentList = apiConfig?.blacklistedPhones || [];
    const exists = currentList.some(e => normalizePhoneCanonical(e.phone) === key);
    if (exists) {
      const nextList = currentList.filter(e => normalizePhoneCanonical(e.phone) !== key);
      await onSaveAntiFraudConfig(
        { blacklistedPhones: nextList },
        `تمت إزالة الرقم ${key} من القائمة السوداء`
      );
    } else {
      const nextList: BlacklistEntry[] = [
        {
          phone: key,
          reason: defaultReason || 'حظر من إدارة الطلبات',
          addedAt: new Date().toISOString()
        },
        ...currentList
      ];
      await onSaveAntiFraudConfig(
        { blacklistedPhones: nextList },
        `تمت إضافة الرقم ${key} إلى القائمة السوداء`
      );
    }
  };

  const handleAddManualBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveAntiFraudConfig) return;
    const key = normalizePhoneCanonical(newBlacklistPhone);
    if (key.length < 9) return;
    const currentList = apiConfig?.blacklistedPhones || [];
    if (currentList.some(item => normalizePhoneCanonical(item.phone) === key)) {
      setNewBlacklistPhone('');
      setNewBlacklistReason('');
      return;
    }
    const nextList: BlacklistEntry[] = [
      {
        phone: key,
        reason: newBlacklistReason.trim() || 'حظر يدوي (مرتجع متكرر / طلب وهمي)',
        addedAt: new Date().toISOString()
      },
      ...currentList
    ];
    setIsSavingFraud(true);
    await onSaveAntiFraudConfig(
      { blacklistedPhones: nextList },
      `تمت إضافة الرقم ${key} إلى القائمة السوداء`
    );
    setIsSavingFraud(false);
    setNewBlacklistPhone('');
    setNewBlacklistReason('');
  };

  const handleSaveFraudSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveAntiFraudConfig) return;
    setIsSavingFraud(true);
    await onSaveAntiFraudConfig({
      antiFraudEnabled: afEnabled,
      dailyMaxOrdersPerPhone: Math.max(0, Number(afDailyMax) || 0),
      duplicateWindowHours: Math.max(1, Number(afDupWindowHours) || 24),
      autoFlagReturnsThreshold: Math.max(1, Number(afReturnThreshold) || 2)
    });
    setIsSavingFraud(false);
    setFraudModalOpen(false);
  };

  const handleNextStatus = (order: Order) => {
    let next: OrderStatus = 'confirmed';
    let defaultNote = '';

    if (order.status === 'new') {
      next = 'confirmed';
      defaultNote = 'تم الاتصال بالزبون وتأكيد الطلب';
    } else if (order.status === 'confirmed') {
      next = 'shipping';
      defaultNote = trackingCodeInput.trim()
        ? `تم تسليم الطرد لشركة التوصيل برمز التتبع ${trackingCodeInput.trim()}`
        : 'تم تسليم الطرد لشركة التوصيل';
    } else if (order.status === 'shipping') {
      next = 'delivered';
      defaultNote = 'تم تسليم الطرد للزبون وتحصيل المبلغ نقداً';
    }

    onUpdateStatus(
      order.id,
      next,
      statusNoteInput.trim() || defaultNote,
      trackingCodeInput.trim() || undefined
    );
    setStatusNoteInput('');
  };

  const buildCustomerWhatsAppHref = (order: Order) => {
    const customerWa = normalizeWhatsAppNumber(order.customerPhone);
    const code = trackingCodeInput.trim() || order.trackingCode || '';
    const bundle = order.bundleLabel || order.items[0]?.title || '';
    let msg = '';
    if (order.status === 'shipping' || code) {
      msg =
        `مرحباً ${order.customerName}،\n` +
        `طلبيتك من ${store.name} خرجت مع شركة التوصيل وفي الطريق إليك.\n` +
        `المنتج: ${bundle}\n` +
        (code ? `رمز التتبع: ${code}\n` : '') +
        `حضّر المبلغ ${formatPlainDZD(order.total)} وخلّي هاتفك مفتوحاً.\n` +
        `شكراً لثقتك.`;
    } else {
      msg =
        `السلام عليكم ${order.customerName}،\n` +
        `بخصوص طلبيتك رقم ${order.orderNumber} من متجر ${store.name} (${bundle})، المبلغ ${formatPlainDZD(order.total)}. نؤكد معك التوصيل إلى ${order.wilayaName}${order.commune ? ' - ' + order.commune : ''}.`;
    }
    return `https://wa.me/${customerWa}?text=${encodeURIComponent(msg)}`;
  };

  const getStoreDeliveryFee = (wilayaId: string, type: DeliveryType, subtotal: number) => {
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

  const handleSaveDetailsEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !onUpdateOrderDetails) return;
    setIsSavingDetails(true);
    const ok = await onUpdateOrderDetails({
      orderNumber: selectedOrder.orderNumber,
      offerId: editOfferId || undefined,
      bundleLabel: !editOfferId ? editBundleText.trim() || undefined : undefined,
      wilayaId: editWilayaId,
      commune: editCommune,
      deliveryType: editDeliveryType
    });
    setIsSavingDetails(false);
    if (ok) {
      setIsEditingDetails(false);
    }
  };

  const exportTargetOrders = selectedOrdersList.length > 0 ? selectedOrdersList : filteredOrders;
  const selectedFraudFlags = selectedOrder ? fraudFlagsByOrderId.get(selectedOrder.id) : undefined;

  return (
    <div className="space-y-5">
      <ConfirmDialog
        isOpen={!!orderToCancel}
        danger
        title="إلغاء الطلب"
        message={
          orderToCancel
            ? `سيتم إلغاء الطلب #${orderToCancel.orderNumber} وإرجاع الكميات إلى المخزون.`
            : ''
        }
        reasonLabel="سبب الإلغاء (مثال: الزبون لا يجيب)"
        reasonDefault="الزبون غير متاح"
        confirmLabel="تأكيد الإلغاء"
        cancelLabel="تراجع"
        onConfirm={reason => {
          if (orderToCancel) onUpdateStatus(orderToCancel.id, 'cancelled', reason || 'تم إلغاء الطلب');
          setOrderToCancel(null);
        }}
        onCancel={() => setOrderToCancel(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(bulkCancelPendingIds && bulkCancelPendingIds.length > 0)}
        danger
        title="إلغاء الطلبات المحددة"
        message={
          bulkCancelPendingIds
            ? `سيتم إلغاء ${bulkCancelPendingIds.length} طلبات دفعة واحدة وإرجاع كمياتها إلى المخزون.`
            : ''
        }
        reasonLabel="سبب الإلغاء الجماعي"
        reasonDefault="إلغاء جماعي من لوحة الطلبات"
        confirmLabel="تأكيد الإلغاء الجماعي"
        cancelLabel="تراجع"
        onConfirm={async reason => {
          const ids = bulkCancelPendingIds || [];
          setBulkCancelPendingIds(null);
          if (ids.length > 0 && onBulkUpdateStatus) {
            setIsBulkBusy(true);
            try {
              await onBulkUpdateStatus(ids, 'cancelled', reason || 'إلغاء جماعي');
              setSelectedIds(new Set());
            } finally {
              setIsBulkBusy(false);
            }
          }
        }}
        onCancel={() => setBulkCancelPendingIds(null)}
      />

      {/* Header & Top Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            إدارة الطلبات وعمليات الشحن
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تحديد جماعي للطلبات، تصدير CSV / Excel جاهز لشركات التوصيل، وحماية تلقائية من الطلبات المكررة والمرتجعات
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Anti-Fraud & Blacklist Modal Button */}
          <button
            type="button"
            onClick={() => setFraudModalOpen(true)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer ${
              (apiConfig?.blacklistedPhones?.length || 0) > 0 || flaggedOrdersCount > 0
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>الحماية والقائمة السوداء</span>
            {(apiConfig?.blacklistedPhones?.length || 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] tabular-nums">
                {apiConfig?.blacklistedPhones?.length}
              </span>
            )}
          </button>

          {/* Export CSV / Excel Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen(v => !v)}
              disabled={exportTargetOrders.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                تصدير ({exportTargetOrders.length})
              </span>
            </button>

            {exportMenuOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-2 z-30 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    exportOrdersToCourierCsv(
                      exportTargetOrders,
                      `${store.subdomain || 'orders'}-courier`
                    );
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-right px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <div>ملف CSV لشركات التوصيل</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      جاهز للرفع (Yalidine / Ecotrack / ZR)
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportOrdersToExcel(
                      exportTargetOrders,
                      store.name,
                      `${store.subdomain || 'orders'}-excel`
                    );
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-right px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div>جدول Excel منسق (.xls)</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      مع الحفاظ على أصفار أرقام الهاتف
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {onSyncFromGoogleSheet && (
            <button
              type="button"
              onClick={onSyncFromGoogleSheet}
              disabled={isSyncingSheet}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-emerald-600 ${isSyncingSheet ? 'animate-spin' : ''}`}
              />
              <span>{isSyncingSheet ? 'جارٍ المزامنة...' : 'مزامنة Sheet'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Persistent Courier Error Diagnostic Banner */}
      {lastCourierError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-extrabold">
                تعذر إرسال الطلب #{lastCourierError.orderNumber} إلى شركة التوصيل:
              </div>
              <div className="font-mono text-[11px] leading-relaxed">{lastCourierError.message}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onGoToApiConfig && (
              <button
                type="button"
                onClick={onGoToApiConfig}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                فحص إعدادات الـ API
              </button>
            )}
            {onDismissCourierError && (
              <button
                type="button"
                onClick={onDismissCourierError}
                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
                title="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Status Filter Tabs (Including Fraud / Duplicate Alert Filter) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>جميع الطلبات</span>
          <span className="px-1.5 rounded-full text-[10px] bg-black/15 tabular-nums">
            {getStatusCount('all')}
          </span>
        </button>

        {(['new', 'confirmed', 'shipping', 'delivered', 'cancelled'] as OrderStatus[]).map(st => {
          const cfg = statusConfigs[st];
          const isSelected = statusFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <span>{cfg.label}</span>
              <span className="px-1.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 tabular-nums">
                {getStatusCount(st)}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setStatusFilter('fraud')}
          className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            statusFilter === 'fraud'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>مكرر / مشبوه</span>
          <span className="px-1.5 rounded-full text-[10px] bg-black/10 tabular-nums">
            {flaggedOrdersCount}
          </span>
        </button>
      </div>

      {/* Bulk Action Bar (Visible whenever >= 1 checkbox selected) */}
      {selectedIds.size > 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-900 text-white dark:bg-slate-800 border border-slate-700 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-black tabular-nums">
              تم تحديد {selectedIds.size} طلب
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isBulkBusy && <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />}

            {onBulkUpdateStatus && (
              <>
                <button
                  type="button"
                  disabled={isBulkBusy}
                  onClick={() => runBulkStatus('confirmed', 'تأكيد جماعي للطلبات')}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  تأكيد المحددة
                </button>
                <button
                  type="button"
                  disabled={isBulkBusy}
                  onClick={() => runBulkStatus('shipping', 'ترقية جماعية إلى شركة التوصيل')}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  في التوصيل
                </button>
                <button
                  type="button"
                  disabled={isBulkBusy}
                  onClick={() => runBulkStatus('delivered', 'تسليم وتحصيل جماعي')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  تم التسليم
                </button>
                <button
                  type="button"
                  disabled={isBulkBusy}
                  onClick={() => setBulkCancelPendingIds(Array.from(selectedIds))}
                  className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
              </>
            )}

            {apiConfig?.courierProvider &&
              apiConfig.courierProvider !== 'none' &&
              onBulkSendToCourier && (
                <button
                  type="button"
                  disabled={isBulkBusy || eligibleCourierSelected.length === 0}
                  onClick={runBulkCourier}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    إرسال لـ {COURIER_PROVIDER_INFO[apiConfig.courierProvider].name} ({eligibleCourierSelected.length})
                  </span>
                </button>
              )}

            <button
              type="button"
              onClick={() => setPrintSlipOrders(selectedOrdersList)}
              className="px-3 py-1.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة البوليصات ({selectedOrdersList.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث برقم الطلب أو الاسم أو الهاتف أو الولاية أو البلدية أو رمز التتبع..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">لا توجد طلبات مطابقة</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            جرب اختيار حالة أخرى أو مسح البحث
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      title={allFilteredSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                      className="text-slate-500 hover:text-emerald-600 cursor-pointer inline-flex items-center justify-center"
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 font-bold">رقم الطلب</th>
                  <th className="py-3 px-3 font-bold">الزبون والهاتف والحماية</th>
                  <th className="py-3 px-3 font-bold">الولاية والبلدية</th>
                  <th className="py-3 px-3 font-bold">المنتج والباقة</th>
                  <th className="py-3 px-3 font-bold">نوع التوصيل</th>
                  <th className="py-3 px-3 font-bold">المجموع</th>
                  <th className="py-3 px-3 font-bold">الحالة</th>
                  <th className="py-3 px-3 font-bold text-left">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredOrders.map(order => {
                  const cfg = statusConfigs[order.status];
                  const isChecked = selectedIds.has(order.id);
                  const flags = fraudFlagsByOrderId.get(order.id);
                  return (
                    <tr
                      key={order.id}
                      className={`transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                          : flags?.isBlacklisted
                            ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                      }`}
                      onClick={() => onSelectOrder(order)}
                    >
                      <td
                        className="py-3.5 px-3 text-center"
                        onClick={e => {
                          e.stopPropagation();
                          toggleSelectOne(order.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-3 font-black font-mono text-emerald-600 dark:text-emerald-400">
                        <div>#{order.orderNumber}</div>
                        {order.trackingCode && (
                          <div className="text-[10px] text-slate-400 font-mono">{order.trackingCode}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{order.customerName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{order.customerPhone}</div>
                        {flags?.hasAnyFlag && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {flags.isBlacklisted && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black">
                                <Ban className="w-2.5 h-2.5" />
                                <span>قائمة سوداء</span>
                              </span>
                            )}
                            {flags.isDuplicate && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-[9px] font-bold">
                                <CopyCheck className="w-2.5 h-2.5" />
                                <span>طلب مكرر ({flags.duplicateOrders.length + 1})</span>
                              </span>
                            )}
                            {flags.isHighReturnRisk && !flags.isBlacklisted && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[9px] font-bold">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>مرتجعات ({flags.cancelledCountByPhone})</span>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{order.wilayaName}</div>
                        <div className="text-[11px] text-slate-400">{order.commune || order.address}</div>
                      </td>
                      <td className="py-3.5 px-3 max-w-[190px] truncate text-slate-700 dark:text-slate-300">
                        {order.bundleLabel || order.items.map(it => it.title).join(', ')}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {order.deliveryType === 'stop' ? 'مكتب الشحن Stop Desk' : 'توصيل للمنزل'}
                      </td>
                      <td className="py-3.5 px-3 font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatDZD(order.total)}
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-block whitespace-nowrap ${cfg.badgeClass}`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectOrder(order)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="تفاصيل"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPrintSlipOrders([order])}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="طباعة البوليصة"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto space-y-5">
            <button
              onClick={() => onSelectOrder(null)}
              className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black font-mono">طلب #{selectedOrder.orderNumber}</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusConfigs[selectedOrder.status].badgeClass}`}
                  >
                    {statusConfigs[selectedOrder.status].label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(selectedOrder.createdAt).toLocaleString('ar-DZ')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {apiConfig?.whatsappProvider &&
                  apiConfig.whatsappProvider !== 'none' &&
                  onSendOrderWhatsAppApi && (
                    <button
                      type="button"
                      disabled={courierBusyOrderId === selectedOrder.id}
                      onClick={() => onSendOrderWhatsAppApi(selectedOrder)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>واتساب آلي (API)</span>
                    </button>
                  )}
                <a
                  href={buildCustomerWhatsAppHref(selectedOrder)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-[#25D366] text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>واتساب الزبون</span>
                </a>
                <button
                  onClick={() => setPrintSlipOrders([selectedOrder])}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>البوليصة</span>
                </button>
              </div>
            </div>

            {/* Anti-Fraud Intelligence Box inside Order Modal */}
            {selectedFraudFlags && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  selectedFraudFlags.isBlacklisted
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    : selectedFraudFlags.hasAnyFlag
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    {selectedFraudFlags.hasAnyFlag ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span>
                      {selectedFraudFlags.isBlacklisted
                        ? `تحذير: الرقم محظور في القائمة السوداء (${selectedFraudFlags.blacklistReason || 'عميل مرتجعات'})`
                        : selectedFraudFlags.isDuplicate
                          ? `تنبيه طلب مكرر: هذا الرقم سجّل ${selectedFraudFlags.duplicateOrders.length + 1} طلبات خلال آخر ${apiConfig?.duplicateWindowHours ?? 24} ساعة`
                          : selectedFraudFlags.isHighReturnRisk
                            ? `تنبيه مخاطر: لدى هذا الرقم ${selectedFraudFlags.cancelledCountByPhone} طلبات ملغاة/مرتجعة`
                            : `فحص الحماية سليم — إجمالي طلبات الرقم: ${selectedFraudFlags.totalOrdersByPhone}`}
                    </span>
                  </div>

                  {onSaveAntiFraudConfig && (
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleBlacklistPhone(
                          selectedOrder.customerPhone,
                          selectedFraudFlags.cancelledCountByPhone > 0
                            ? `مرتجع/إلغاء (${selectedFraudFlags.cancelledCountByPhone} مرات)`
                            : 'حظر من تفاصيل الطلب'
                        )
                      }
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                        selectedFraudFlags.isBlacklisted
                          ? 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      <Ban className="w-3 h-3" />
                      <span>
                        {selectedFraudFlags.isBlacklisted
                          ? 'إزالة من القائمة السوداء'
                          : 'حظر الرقم (قائمة سوداء)'}
                      </span>
                    </button>
                  )}
                </div>

                {selectedFraudFlags.duplicateOrders.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <span className="font-semibold">طلبات أخرى لنفس الرقم:</span>
                    {selectedFraudFlags.duplicateOrders.map(dup => (
                      <button
                        key={dup.id}
                        type="button"
                        onClick={() => onSelectOrder(dup)}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 font-mono font-bold hover:underline cursor-pointer"
                      >
                        #{dup.orderNumber} ({statusConfigs[dup.status].label})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Customer Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400">الاسم الكامل:</span>{' '}
                  <strong className="font-bold">{selectedOrder.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-400">الهاتف:</span>{' '}
                  <a
                    href={`tel:${selectedOrder.customerPhone}`}
                    className="font-mono font-bold text-emerald-600 inline-flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{selectedOrder.customerPhone}</span>
                  </a>
                </div>
                <div>
                  <span className="text-slate-400">الولاية والبلدية:</span>{' '}
                  <strong className="font-bold">
                    {selectedOrder.wilayaName}
                    {selectedOrder.commune ? ` - ${selectedOrder.commune}` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">طريقة التوصيل:</span>{' '}
                  <strong className="font-bold">
                    {selectedOrder.deliveryType === 'stop'
                      ? 'مكتب الشحن (Stop Desk)'
                      : 'توصيل للمنزل'}
                  </strong>
                </div>
              </div>

              {selectedOrder.status !== 'delivered' &&
                selectedOrder.status !== 'cancelled' &&
                onUpdateOrderDetails && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                    {!isEditingDetails ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingDetails(true)}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-bold text-[11px] inline-flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>تعديل المنتج / العرض أو الوجهة والتوصيل</span>
                      </button>
                    ) : (
                      <form onSubmit={handleSaveDetailsEdit} className="space-y-3 pt-1">
                        {orderLandingPage && orderLandingPage.offers.length > 0 ? (
                          <div>
                            <label className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">
                              المنتج / العرض
                            </label>
                            <select
                              value={editOfferId}
                              onChange={e => setEditOfferId(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                            >
                              {orderLandingPage.offers.map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.title} (الكمية: {o.quantity}) — {formatDZD(o.price)}
                                </option>
                              ))}
                              <option value="">إدخال تسمية مخصصة يدوياً...</option>
                            </select>
                            {!editOfferId && (
                              <input
                                type="text"
                                value={editBundleText}
                                onChange={e => setEditBundleText(e.target.value)}
                                placeholder="اسم المنتج / العرض"
                                className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                              />
                            )}
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">
                              المنتج / العرض
                            </label>
                            <input
                              type="text"
                              value={editBundleText}
                              onChange={e => setEditBundleText(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">
                              الولاية
                            </label>
                            <select
                              value={editWilayaId}
                              onChange={e => {
                                const wId = e.target.value;
                                setEditWilayaId(wId);
                                const nextW = ALGERIA_WILAYAS.find(w => w.id === wId);
                                if (nextW && nextW.communes.length > 0) {
                                  setEditCommune(nextW.communes[0]);
                                }
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                            >
                              {ALGERIA_WILAYAS.map(w => (
                                <option key={w.id} value={w.id}>
                                  {w.code} - {w.nameAr}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">
                              البلدية
                            </label>
                            <select
                              value={editCommune}
                              onChange={e => setEditCommune(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                            >
                              {editSelectedWilaya.communes.map(c => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">
                              طريقة التوصيل
                            </label>
                            <select
                              value={editDeliveryType}
                              onChange={e => setEditDeliveryType(e.target.value as DeliveryType)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                            >
                              <option value="home">
                                توصيل للمنزل (
                                {formatDZD(
                                  getStoreDeliveryFee(
                                    editSelectedWilaya.id,
                                    'home',
                                    orderLandingPage?.offers.find(o => o.id === editOfferId)?.price ??
                                      selectedOrder.subtotal
                                  )
                                )}
                                )
                              </option>
                              <option value="stop">
                                مكتب الشحن Stop Desk (
                                {formatDZD(
                                  getStoreDeliveryFee(
                                    editSelectedWilaya.id,
                                    'stop',
                                    orderLandingPage?.offers.find(o => o.id === editOfferId)?.price ??
                                      selectedOrder.subtotal
                                  )
                                )}
                                )
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isSavingDetails}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                          >
                            {isSavingDetails ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingDetails(false)}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
            </div>

            {/* Items & Totals */}
            <div className="space-y-3">
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                {selectedOrder.items.map((it, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      {it.imageUrl && (
                        <img
                          src={it.imageUrl}
                          alt={it.title}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                      )}
                      <div>
                        <div className="font-bold">{it.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {it.variantText || selectedOrder.bundleLabel}
                        </div>
                      </div>
                    </div>
                    <div className="font-bold tabular-nums">{formatDZD(it.price * it.quantity)}</div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1.5 tabular-nums">
                <div className="flex justify-between text-slate-500">
                  <span>سعر المنتج/العرض:</span>
                  <span>{formatDZD(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>مصاريف التوصيل:</span>
                  <span>
                    {selectedOrder.shippingFee === 0 ? 'مجاني' : formatDZD(selectedOrder.shippingFee)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>المجموع الكلي (COD):</span>
                  <span className="text-emerald-600">{formatDZD(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* Courier API Dispatch + Live Tracking */}
            {((apiConfig?.courierProvider && apiConfig.courierProvider !== 'none') ||
              selectedOrder.courierLabelUrl) && (
              <div className="p-4 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span>
                      شركة التوصيل المربوطة:{' '}
                      {apiConfig?.courierProvider && apiConfig.courierProvider !== 'none'
                        ? COURIER_PROVIDER_INFO[apiConfig.courierProvider].name
                        : selectedOrder.courierProvider || 'API'}
                    </span>
                  </div>
                  {selectedOrder.courierLabelUrl && (
                    <a
                      href={selectedOrder.courierLabelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-[11px] font-bold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>طباعة البوليصة الرسمية PDF</span>
                    </a>
                  )}
                </div>

                {apiConfig?.courierProvider && apiConfig.courierProvider !== 'none' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!selectedOrder.trackingCode &&
                      (selectedOrder.status === 'new' ||
                        selectedOrder.status === 'confirmed' ||
                        selectedOrder.status === 'shipping') &&
                      onSendOrderToCourier && (
                        <button
                          type="button"
                          disabled={courierBusyOrderId === selectedOrder.id}
                          onClick={() => onSendOrderToCourier(selectedOrder)}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
                        >
                          {courierBusyOrderId === selectedOrder.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>
                            إرسال إلى {COURIER_PROVIDER_INFO[apiConfig.courierProvider].name} وتوليد رمز التتبع
                          </span>
                        </button>
                      )}

                    {selectedOrder.trackingCode &&
                      selectedOrder.status !== 'delivered' &&
                      selectedOrder.status !== 'cancelled' &&
                      onPullCourierStatus && (
                        <button
                          type="button"
                          disabled={courierBusyOrderId === selectedOrder.id}
                          onClick={() => onPullCourierStatus(selectedOrder)}
                          className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          {courierBusyOrderId === selectedOrder.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          <span>
                            سحب وتحديث الحالة من {COURIER_PROVIDER_INFO[apiConfig.courierProvider].name}
                          </span>
                        </button>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* Courier Tracking Code + Status Actions */}
            {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 dark:text-emerald-300 mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      <span>رمز تتبع شركة الشحن (اختياري)</span>
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={trackingCodeInput}
                      onChange={e => setTrackingCodeInput(e.target.value)}
                      placeholder="28-H8G9NDFX0V-ZR"
                      className="w-full px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                      ملاحظة التحديث (اختياري)
                    </label>
                    <input
                      type="text"
                      value={statusNoteInput}
                      onChange={e => setStatusNoteInput(e.target.value)}
                      placeholder="مثال: تم الإرسال مع ZR Express"
                      className="w-full px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleNextStatus(selectedOrder)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                  >
                    {selectedOrder.status === 'new' && 'الترقية إلى: التأكيد'}
                    {selectedOrder.status === 'confirmed' && 'الترقية إلى: في شركة التوصيل'}
                    {selectedOrder.status === 'shipping' && 'الترقية إلى: التسليم'}
                  </button>

                  {trackingCodeInput.trim() &&
                    trackingCodeInput.trim() !== (selectedOrder.trackingCode || '') && (
                      <button
                        onClick={() =>
                          onUpdateStatus(
                            selectedOrder.id,
                            selectedOrder.status,
                            `تحديث رمز التتبع: ${trackingCodeInput.trim()}`,
                            trackingCodeInput.trim()
                          )
                        }
                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        حفظ رمز التتبع فقط
                      </button>
                    )}

                  <button
                    onClick={() => setOrderToCancel(selectedOrder)}
                    className="px-3 py-2 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    إلغاء الطلب
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anti-Fraud & Blacklist Settings Modal */}
      {fraudModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    حماية الطلبات الوهمية والمكررة (Anti-Fraud COD)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تقييد الطلبات المتكررة لنفس الرقم يومياً وإدارة القائمة السوداء لأصحاب المرتجعات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFraudModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFraudSettings} className="space-y-4">
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    تفعيل نظام الحماية ضد الطلبات الوهمية والمكررة
                  </div>
                  <div className="text-[11px] text-slate-500">
                    يفحص الرقم تلقائياً عند الطلب في واجهة الزبون ويبرز التنبيهات في جدول الطلبات
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={afEnabled}
                  onChange={e => setAfEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    الحد الأقصى للطلبات / رقم يومياً
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={afDailyMax}
                    onChange={e => setAfDailyMax(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">0 = بدون تقييد يومي</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    نافذة كشف التكرار (بالساعات)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={afDupWindowHours}
                    onChange={e => setAfDupWindowHours(Math.max(1, Number(e.target.value) || 24))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">افتراضي: 24 ساعة</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    تنبيه عند عدد مرتجعات ≥
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={afReturnThreshold}
                    onChange={e => setAfReturnThreshold(Math.max(1, Number(e.target.value) || 2))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">عدد الطلبات الملغاة/المرتجعة</span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingFraud}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSavingFraud ? 'جارٍ الحفظ...' : 'حفظ قواعد الحماية'}
                </button>
              </div>
            </form>

            {/* Blacklist Management */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-rose-600" />
                <span>القائمة السوداء (الأرقام المحظورة: {apiConfig?.blacklistedPhones?.length || 0})</span>
              </h4>

              <form onSubmit={handleAddManualBlacklist} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={newBlacklistPhone}
                  onChange={e => setNewBlacklistPhone(e.target.value)}
                  placeholder="0550123456"
                  className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <input
                  type="text"
                  value={newBlacklistReason}
                  onChange={e => setNewBlacklistReason(e.target.value)}
                  placeholder="السبب (مثال: مرتجع متكرر بدون رد)"
                  className="sm:col-span-6 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <button
                  type="submit"
                  disabled={isSavingFraud}
                  className="sm:col-span-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>حظر</span>
                </button>
              </form>

              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {(apiConfig?.blacklistedPhones || []).length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    لا توجد أرقام محظورة حالياً
                  </div>
                ) : (
                  (apiConfig?.blacklistedPhones || []).map(entry => (
                    <div
                      key={entry.phone}
                      className="p-3 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-rose-700 dark:text-rose-400">
                          {entry.phone}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {entry.reason || 'محظور'} · {new Date(entry.addedAt).toLocaleDateString('ar-DZ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleBlacklistPhone(entry.phone)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="إزالة من القائمة السوداء"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Slips Modal (Single or Batch) */}
      {printSlipOrders.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto print:static print:p-0 print:bg-white">
          <div className="relative w-full max-w-2xl bg-white text-slate-900 p-6 md:p-8 rounded-2xl shadow-2xl text-right space-y-6 border border-slate-300 my-8 max-h-[92vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0 print:p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-300 print:hidden">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>طباعة بوليصات التوصيل ({printSlipOrders.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  طباعة الكل
                </button>
                <button
                  onClick={() => setPrintSlipOrders([])}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {printSlipOrders.map((slip, idx) => (
                <div
                  key={slip.id}
                  className={`border-2 border-slate-800 p-5 rounded-lg space-y-4 text-xs bg-white ${
                    idx < printSlipOrders.length - 1 ? 'print:break-after-page' : ''
                  }`}
                >
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                    <div>
                      <h1 className="text-lg font-black">{store.name} — دفع عند الاستلام</h1>
                      <div className="text-[11px] text-slate-600">
                        {slip.deliveryType === 'stop' ? 'مكتب الشحن Stop Desk' : 'توصيل للمنزل'}
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <div className="text-sm font-black">#{slip.orderNumber}</div>
                      {slip.trackingCode && <div className="text-[11px]">{slip.trackingCode}</div>}
                      {slip.courierLabelUrl && (
                        <a
                          href={slip.courierLabelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-blue-600 underline print:hidden"
                        >
                          بوليصة شركة الشحن PDF
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-100 rounded">
                      <div className="font-bold text-slate-500 text-[10px] mb-1">المرسل:</div>
                      <div className="font-bold">{store.name}</div>
                      <div>{store.phone || store.defaultWhatsapp || ''}</div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded">
                      <div className="font-bold text-slate-500 text-[10px] mb-1">المستلم:</div>
                      <div className="font-bold text-sm">{slip.customerName}</div>
                      <div className="font-mono font-bold text-emerald-700">{slip.customerPhone}</div>
                      <div className="font-bold">
                        {slip.wilayaName}
                        {slip.commune ? ` - ${slip.commune}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-300 rounded p-2">
                    <div className="font-bold text-[11px] mb-1">الطلب:</div>
                    <div>{slip.bundleLabel || slip.items.map(it => it.title).join(', ')}</div>
                  </div>

                  <div className="p-4 bg-emerald-50 border-2 border-emerald-600 rounded text-center">
                    <div className="text-xs font-bold text-emerald-800">
                      المبلغ المطلوب عند الاستلام (COD):
                    </div>
                    <div className="text-2xl font-black text-emerald-700 tabular-nums mt-1">
                      {formatDZD(slip.total)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
