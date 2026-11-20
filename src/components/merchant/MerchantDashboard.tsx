import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../services/authContext';
import { storage } from '../../services/storage';
import {
  AbandonedOrder,
  AbandonedOrderStatus,
  DeliveryType,
  LandingPage,
  Order,
  OrderStatus,
  Store,
  StoreApiConfig
} from '../../types';
import { ALGERIA_WILAYAS } from '../../data/wilayas';
import { OverviewTab } from './OverviewTab';
import { LandingPagesTab } from './LandingPagesTab';
import { OrdersTab } from './OrdersTab';
import { AbandonedOrdersTab, ConvertAbandonedPayload } from './AbandonedOrdersTab';
import { ApiConfigTab } from './ApiConfigTab';
import { SettingsTab } from './SettingsTab';
import { ThemeToggle } from '../common/ThemeToggle';
import { LoginModal } from '../visitor/LoginModal';
import { applyBrowserBranding } from '../../services/branding';
import {
  ORDER_STAGE_LABELS,
  ABANDONED_STAGE_LABELS,
  sendOrderToGoogleSheet,
  updateOrderInGoogleSheet,
  deleteOrderInGoogleSheet,
  fetchAllOrdersFromGoogleSheetDetailed,
  fetchAbandonedOrdersFromGoogleSheet,
  SheetOrderRow,
  createCourierParcel,
  trackCourierParcel,
  sendWhatsAppViaApi,
  buildAutoOrderTextMessage,
  COURIER_PROVIDER_INFO
} from '../../services/integrations';
import {
  LayoutDashboard,
  Layers,
  ShoppingBag,
  UserX,
  Settings,
  Plug,
  ExternalLink,
  Store as StoreIcon,
  CheckCircle2,
  Menu,
  X,
  LogOut,
  Lock,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Props {
  onGoToStorefront: (slug?: string) => void;
}

export const MerchantDashboard: React.FC<Props> = ({ onGoToStorefront }) => {
  const {
    currentStore,
    currentUser,
    isSupabaseMode,
    isLoading: isAuthLoading,
    refreshCurrentStore,
    setupPrivateStore,
    enableDemoPreview,
    logout
  } = useAuth();

  const [activeTab, setActiveTabState] = useState<
    'overview' | 'pages' | 'orders' | 'abandoned' | 'api' | 'settings'
  >(() => {
    try {
      const saved = sessionStorage.getItem('brightdz_active_tab');
      if (
        saved === 'overview' ||
        saved === 'pages' ||
        saved === 'orders' ||
        saved === 'abandoned' ||
        saved === 'api' ||
        saved === 'settings'
      ) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'pages';
  });

  const setActiveTab = (
    tab: 'overview' | 'pages' | 'orders' | 'abandoned' | 'api' | 'settings'
  ) => {
    setActiveTabState(tab);
    try {
      sessionStorage.setItem('brightdz_active_tab', tab);
    } catch {
      // ignore
    }
  };
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // First-time private store setup form (in Supabase mode when DB has no store yet)
  const [setupStoreName, setSetupStoreName] = useState('Bright DZ');
  const [setupSubdomain, setSetupSubdomain] = useState('bright-dz');
  const [setupPhone, setSetupPhone] = useState('0798353165');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Data states
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [abandonedOrders, setAbandonedOrders] = useState<AbandonedOrder[]>([]);
  const [abandonedNeedsSql, setAbandonedNeedsSql] = useState(false);
  const [isSyncingAbandoned, setIsSyncingAbandoned] = useState(false);
  const [lastAbandonedSyncError, setLastAbandonedSyncError] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<StoreApiConfig | null>(null);
  const [needsSqlMigration, setNeedsSqlMigration] = useState(false);
  const [courierBusyOrderId, setCourierBusyOrderId] = useState<string | null>(null);
  const [lastCourierError, setLastCourierError] = useState<{
    orderNumber: string;
    message: string;
    timestamp: string;
  } | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [lastSheetSyncError, setLastSheetSyncError] = useState<string | null>(null);
  const [ordersNeedsSql, setOrdersNeedsSql] = useState(false);

  const recentSitePushRef = useRef<Record<string, number>>({});
  const sheetRowSigRef = useRef<Record<string, string>>({});
  const isSyncingRef = useRef(false);
  const selectedOrderRef = useRef<Order | null>(null);
  selectedOrderRef.current = selectedOrder;

  const store = currentStore || (!isSupabaseMode ? storage.getLocalStores()[0] : null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const syncOrdersWithGoogleSheets = useCallback(
    async (
      currentOrders: Order[],
      currentPages: LandingPage[],
      showFeedback = false,
      overrideWebhook?: string
    ) => {
      if (!store?.id || isSyncingRef.current || (isSupabaseMode && !currentUser?.id)) return;
      const webhookUrls = Array.from(
        new Set(
          [
            store.googleSheetWebhook?.trim(),
            apiConfig?.googleSheetWebhook?.trim(),
            overrideWebhook?.trim(),
            ...currentPages.map(p => p.integrations?.googleSheetWebhook?.trim())
          ].filter((u): u is string => Boolean(u))
        )
      );

      if (webhookUrls.length === 0) {
        if (showFeedback) {
          const msg = 'لا يوجد رابط Google Sheet مفعّل في إعدادات المتجر أو إعدادات الـ API أو الصفحات';
          setLastSheetSyncError(msg);
          showToast(msg);
        }
        return;
      }

      isSyncingRef.current = true;
      if (showFeedback) {
        setIsSyncingSheet(true);
        setLastSheetSyncError(null);
      }

      try {
        const sheetBatches = await Promise.all(
          webhookUrls.map(url => fetchAllOrdersFromGoogleSheetDetailed(url))
        );
        const failedBatch = sheetBatches.find(b => !b.ok);
        const okBatches = sheetBatches.filter(b => b.ok);

        if (okBatches.length === 0) {
          const errMsg =
            failedBatch?.error ||
            'تعذر قراءة الطلبات من Google Sheet — تأكد من نشر كود Apps Script (doGet) بصلاحية "Anyone"';
          if (showFeedback) {
            setLastSheetSyncError(errMsg);
            showToast(errMsg);
          }
          return;
        }

        // Deduplicate rows across multiple webhooks by normalized orderId
        const rowMap = new Map<string, SheetOrderRow>();
        okBatches.forEach(batch => {
          batch.rows.forEach(r => {
            const key = r.orderId.replace(/^#/, '').trim().toUpperCase();
            if (key && !rowMap.has(key)) rowMap.set(key, r);
          });
        });
        const allSheetRows = Array.from(rowMap.values());

        if (allSheetRows.length === 0) {
          if (showFeedback) {
            setLastSheetSyncError(null);
            showToast('جدول Google Sheet متصل ولكن لا توجد طلبات مسجلة فيه حالياً');
          }
          return;
        }

        const normalizeDigits = (val: string) => {
          const d = (val || '').replace(/[^\d]/g, '');
          return d.startsWith('0') ? d.slice(1) : d;
        };

        const deletedNums = storage.getDeletedSheetOrderNumbers(store.id);
        const missingRows: SheetOrderRow[] = [];
        let updatedCount = 0;

        for (const row of allSheetRows) {
          const key = row.orderId.replace(/^#/, '').trim().toUpperCase();
          const dbOrder = currentOrders.find(
            o => o.orderNumber.replace(/^#/, '').trim().toUpperCase() === key
          );
          if (!dbOrder) {
            if (!deletedNums.has(key)) {
              missingRows.push(row);
            }
            continue;
          }

          const rowSig = JSON.stringify({
            status: row.status,
            trackingCode: row.trackingCode,
            orderName: row.orderName,
            wilaya: row.wilaya,
            commune: row.commune,
            deliveryType: row.deliveryType,
            shippingCost: row.shippingCost,
            productPrice: row.productPrice,
            total: row.total,
            fullName: row.fullName,
            phone: normalizeDigits(row.phone)
          });
          const prevSig = sheetRowSigRef.current[key];
          sheetRowSigRef.current[key] = rowSig;

          const pushTs = recentSitePushRef.current[key] || 0;
          const sheetTs = row.sheetUpdatedAt ? new Date(row.sheetUpdatedAt).getTime() : 0;
          const dbUpdatedTs = new Date(dbOrder.updatedAt).getTime();
          const dbCreatedTs = new Date(dbOrder.createdAt).getTime();

          // Ignore stale sheet snapshot right after a push from Dashboard/Site
          if (Date.now() - pushTs < 15000 && (!sheetTs || sheetTs <= pushTs)) {
            continue;
          }

          const nextDelivery: DeliveryType = row.deliveryType || dbOrder.deliveryType || 'home';
          const nextTotal = row.total > 0 ? row.total : dbOrder.total;
          const nextSubtotal = row.productPrice > 0 ? row.productPrice : dbOrder.subtotal;
          const nextShipping =
            row.shippingCost >= 0 && (row.productPrice > 0 || row.total > 0)
              ? row.shippingCost
              : dbOrder.shippingFee;

          const phoneChanged =
            Boolean(row.phone) &&
            normalizeDigits(row.phone) !== normalizeDigits(dbOrder.customerPhone);

          const hasDiff =
            row.status !== dbOrder.status ||
            row.trackingCode !== (dbOrder.trackingCode || '') ||
            (Boolean(row.orderName) && row.orderName !== (dbOrder.bundleLabel || '')) ||
            (Boolean(row.wilaya) && row.wilaya !== dbOrder.wilayaName) ||
            (row.commune !== '' && row.commune !== (dbOrder.commune || '')) ||
            nextDelivery !== (dbOrder.deliveryType || 'home') ||
            Math.abs(nextShipping - dbOrder.shippingFee) > 0.01 ||
            Math.abs(nextSubtotal - dbOrder.subtotal) > 0.01 ||
            Math.abs(nextTotal - dbOrder.total) > 0.01 ||
            (Boolean(row.fullName) && row.fullName !== dbOrder.customerName) ||
            phoneChanged;

          if (!hasDiff) continue;

          const sheetTimestampNewer = sheetTs > 0 && sheetTs > dbUpdatedTs + 1000;
          const neverEditedInDb = Math.abs(dbUpdatedTs - dbCreatedTs) <= 2500;
          const sigChangedInSession = Boolean(prevSig && prevSig !== rowSig);

          if (!sheetTimestampNewer && !neverEditedInDb && !sigChangedInSession && !showFeedback) {
            continue;
          }

          const cleanWilaya = (row.wilaya || '').trim();
          const matchedWilaya = cleanWilaya
            ? ALGERIA_WILAYAS.find(
                w => w.nameAr === cleanWilaya || w.id === cleanWilaya || cleanWilaya.includes(w.nameAr)
              )
            : undefined;

          const res = await storage.syncOrderFromSheet({
            orderId: dbOrder.id,
            status: row.status,
            trackingCode: row.trackingCode,
            bundleLabel: row.orderName || undefined,
            wilayaId: matchedWilaya?.id,
            wilayaName: cleanWilaya || undefined,
            commune: row.commune,
            deliveryType: nextDelivery,
            subtotal: nextSubtotal,
            shippingFee: nextShipping,
            total: nextTotal,
            customerName: row.fullName || undefined,
            customerPhone: phoneChanged ? row.phone : undefined
          });
          if (res.success) {
            updatedCount += 1;
          }
        }

        let importedCount = 0;
        let importError: string | undefined;
        if (missingRows.length > 0) {
          const importRes = await storage.importOrdersFromSheet(store.id, missingRows, currentPages);
          if (importRes.success) {
            importedCount = importRes.importedCount;
            setOrdersNeedsSql(false);
          } else {
            importError = importRes.error;
            if (importRes.needsSqlMigration) {
              setOrdersNeedsSql(true);
            }
          }
        }

        if (importedCount > 0 || updatedCount > 0) {
          const [refreshedOrders, refreshedPages] = await Promise.all([
            storage.getOrders(store.id),
            storage.getLandingPages(store.id)
          ]);
          setOrders(refreshedOrders);
          setLandingPages(refreshedPages);
          const curSel = selectedOrderRef.current;
          if (curSel) {
            const updatedSel = refreshedOrders.find(o => o.id === curSel.id);
            if (updatedSel) setSelectedOrder(updatedSel);
          }
          setLastSheetSyncError(null);
          if (importedCount > 0 && updatedCount > 0) {
            showToast(`تم استيراد ${importedCount} طلب جديد وتحديث ${updatedCount} طلب من Google Sheet`);
          } else if (importedCount > 0) {
            showToast(`تم استيراد ${importedCount} طلب من Google Sheet بنجاح`);
          } else {
            showToast(`تمت مزامنة وتحديث ${updatedCount} طلب من Google Sheet`);
          }
        } else if (showFeedback) {
          if (importError) {
            setLastSheetSyncError(importError);
            showToast(importError);
          } else if (failedBatch?.error) {
            setLastSheetSyncError(failedBatch.error);
            showToast(failedBatch.error);
          } else {
            setLastSheetSyncError(null);
            showToast(`البيانات متطابقة مع Google Sheet بالفعل (${allSheetRows.length} طلب في الجدول)`);
          }
        }
      } catch (err) {
        console.warn('Google Sheet sync error:', err);
        if (showFeedback) {
          const msg = 'تعذر الاتصال بـ Google Sheet حالياً';
          setLastSheetSyncError(msg);
          showToast(msg);
        }
      } finally {
        isSyncingRef.current = false;
        if (showFeedback) setIsSyncingSheet(false);
      }
    },
    [store?.id, store?.googleSheetWebhook, apiConfig?.googleSheetWebhook, isSupabaseMode, currentUser?.id]
  );

  const loadData = useCallback(async () => {
    if (!store?.id || isAuthLoading || (isSupabaseMode && !currentUser?.id)) {
      setIsDataLoading(false);
      setLoadError(null);
      return;
    }
    setIsDataLoading(true);
    setLoadError(null);
    try {
      const [loadedPages, loadedOrders, apiRes, abandonedRes] = await Promise.all([
        storage.getLandingPages(store.id),
        storage.getOrders(store.id),
        storage.getStoreApiConfig(store),
        storage.getAbandonedOrders(store.id)
      ]);
      setLandingPages(loadedPages);
      setOrders(loadedOrders);
      setApiConfig(apiRes.config);
      setNeedsSqlMigration(Boolean(apiRes.needsSqlMigration));
      setAbandonedOrders(abandonedRes.items);
      setAbandonedNeedsSql(Boolean(abandonedRes.needsSqlMigration));
      applyBrowserBranding({
        title: `${store.name} | لوحة التحكم`,
        iconUrl: apiRes.config.faviconUrl || store.logoUrl
      });

      // Keep server runtime cache warm for storefront CAPI / TikTok / auto-WhatsApp
      void fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiRes.config)
      }).catch(() => {});

      void syncOrdersWithGoogleSheets(
        loadedOrders,
        loadedPages,
        false,
        apiRes.config.googleSheetWebhook
      );
    } catch (err) {
      console.error('Failed to load store data:', err);
      setLoadError('تعذر تحميل بيانات المتجر، يرجى إعادة المحاولة');
    } finally {
      setIsDataLoading(false);
    }
  }, [store?.id, isAuthLoading, isSupabaseMode, currentUser?.id, syncOrdersWithGoogleSheets]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!store?.id || isDataLoading || isAuthLoading || (isSupabaseMode && !currentUser?.id)) return;
    const timer = setInterval(() => {
      void syncOrdersWithGoogleSheets(orders, landingPages, false);
      void storage
        .getAbandonedOrders(store.id)
        .then(res => {
          setAbandonedOrders(res.items);
          setAbandonedNeedsSql(Boolean(res.needsSqlMigration));
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [store?.id, isDataLoading, isAuthLoading, isSupabaseMode, currentUser?.id, orders, landingPages, syncOrdersWithGoogleSheets]);

  const handleSaveLandingPage = async (page: LandingPage): Promise<boolean> => {
    const res = await storage.saveLandingPage(page);
    if (res.success) {
      await loadData();
      showToast('تم حفظ صفحة الهبوط ونشر التعديلات بنجاح');
      return true;
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ صفحة الهبوط'));
      return false;
    }
  };

  const handleDeleteLandingPage = async (pageId: string) => {
    const res = await storage.deleteLandingPage(pageId);
    if (res.success) {
      await loadData();
      showToast('تم حذف صفحة الهبوط');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر الحذف'));
    }
  };

  const handleRestockPage = async (pageId: string, addCount: number) => {
    const page = landingPages.find(p => p.id === pageId);
    if (!page) return;
    const res = await storage.saveLandingPage({ ...page, stock: page.stock + addCount });
    if (res.success) {
      await loadData();
      showToast(`تم تزويد المخزون بـ +${addCount} قطع بنجاح`);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    note?: string,
    trackingCode?: string,
    courierMeta?: { provider?: string; labelUrl?: string },
    options?: { skipAutoCourier?: boolean }
  ) => {
    if (!store?.id) return;
    const res = await storage.updateOrderStatus(orderId, newStatus, note, trackingCode, courierMeta);
    if (res.success) {
      const [updatedOrders, updatedPages] = await Promise.all([
        storage.getOrders(store.id),
        storage.getLandingPages(store.id)
      ]);
      setOrders(updatedOrders);
      setLandingPages(updatedPages);
      const updatedOrder = updatedOrders.find(o => o.id === orderId);
      if (selectedOrder && selectedOrder.id === orderId && updatedOrder) {
        setSelectedOrder(updatedOrder);
      }
      if (updatedOrder) {
        recentSitePushRef.current[updatedOrder.orderNumber.toUpperCase()] = Date.now();
        const lp = updatedPages.find(p => p.id === updatedOrder.landingPageId);
        const webhook = lp?.integrations?.googleSheetWebhook?.trim() || store.googleSheetWebhook?.trim();
        updateOrderInGoogleSheet(webhook, {
          orderId: updatedOrder.orderNumber,
          statusLabel: ORDER_STAGE_LABELS[updatedOrder.status],
          trackingCode: updatedOrder.trackingCode || trackingCode || ''
        });
      }
      showToast('تم تحديث حالة الطلب بنجاح');

      // Optional automated WhatsApp dispatch on Shipping upgrade
      if (
        newStatus === 'shipping' &&
        updatedOrder &&
        apiConfig?.whatsappProvider &&
        apiConfig.whatsappProvider !== 'none' &&
        apiConfig.whatsappAutoSendOnShipping
      ) {
        const waMsg = buildAutoOrderTextMessage(
          store.name,
          updatedOrder,
          'shipping',
          apiConfig.whatsappShippingTemplate
        );
        const waRes = await sendWhatsAppViaApi(
          {
            storeId: store.id,
            phone: updatedOrder.customerPhone,
            message: waMsg,
            orderNumber: updatedOrder.orderNumber,
            customerName: updatedOrder.customerName,
            status: updatedOrder.status,
            trackingCode: updatedOrder.trackingCode,
            total: updatedOrder.total
          },
          apiConfig
        );
        const updatedCfg = await storage.appendApiDiagnosticLog(store, {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          service: 'whatsapp',
          action: 'auto_shipping',
          status: waRes.ok ? 'success' : 'error',
          orderNumber: updatedOrder.orderNumber,
          message: `إرسال شحن آلي للطلب #${updatedOrder.orderNumber}: ${waRes.message}`,
          latencyMs: waRes.latencyMs
        });
        setApiConfig(updatedCfg);
      }

      // Optional auto-create parcel when confirming or shipping an order without tracking yet
      if (
        !options?.skipAutoCourier &&
        (newStatus === 'confirmed' || newStatus === 'shipping') &&
        updatedOrder &&
        apiConfig?.courierProvider &&
        apiConfig.courierProvider !== 'none' &&
        apiConfig.courierAutoSendOnConfirm !== false &&
        !updatedOrder.trackingCode
      ) {
        await handleSendOrderToCourier(updatedOrder);
      }
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر تحديث الطلب'));
    }
  };

  const handleSendOrderToCourier = async (order: Order) => {
    if (!store?.id || !apiConfig || apiConfig.courierProvider === 'none') {
      const msg = 'يرجى اختيار شركة التوصيل وحفظ المفتاح في "إعدادات الـ API" أولاً';
      setLastCourierError({
        orderNumber: order.orderNumber,
        message: msg,
        timestamp: new Date().toISOString()
      });
      showToast(msg);
      return;
    }
    setCourierBusyOrderId(order.id);
    const res = await createCourierParcel(order, apiConfig);
    const nextCfg = await storage.appendApiDiagnosticLog(store, {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      service: 'courier',
      action: 'create_parcel',
      status: res.ok ? 'success' : 'error',
      orderNumber: order.orderNumber,
      message: `طلب #${order.orderNumber}: ${res.message}`,
      latencyMs: res.latencyMs
    });
    setApiConfig(nextCfg);

    if (res.ok && res.trackingCode) {
      setLastCourierError(null);
      const nextSt: OrderStatus = order.status === 'new' ? 'confirmed' : order.status;
      await handleUpdateOrderStatus(
        order.id,
        nextSt,
        res.message,
        res.trackingCode,
        { provider: apiConfig.courierProvider, labelUrl: res.labelUrl },
        { skipAutoCourier: true }
      );
      showToast(res.message);
    } else {
      setLastCourierError({
        orderNumber: order.orderNumber,
        message: res.message,
        timestamp: new Date().toISOString()
      });
      showToast('تعذر الإرسال إلى شركة التوصيل: ' + res.message);
    }
    setCourierBusyOrderId(null);
  };

  const handlePullCourierStatus = async (order: Order) => {
    if (!store?.id || !apiConfig || apiConfig.courierProvider === 'none' || !order.trackingCode) {
      return;
    }
    setCourierBusyOrderId(order.id);
    const res = await trackCourierParcel(order.trackingCode, apiConfig);
    const nextCfg = await storage.appendApiDiagnosticLog(store, {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      service: 'courier',
      action: 'track_parcel',
      status: res.ok ? 'success' : 'error',
      orderNumber: order.orderNumber,
      message: `تتبع #${order.orderNumber}: ${res.message}`,
      latencyMs: res.latencyMs
    });
    setApiConfig(nextCfg);

    if (res.ok && res.mappedStatus && res.mappedStatus !== order.status) {
      await handleUpdateOrderStatus(
        order.id,
        res.mappedStatus,
        `تحديث آلي من ${COURIER_PROVIDER_INFO[apiConfig.courierProvider].name}: ${res.courierStatus || ''}`,
        order.trackingCode,
        res.labelUrl ? { provider: apiConfig.courierProvider, labelUrl: res.labelUrl } : undefined,
        { skipAutoCourier: true }
      );
      showToast(`تم تحديث حالة الطلب #${order.orderNumber}: ${res.message}`);
    } else {
      showToast(res.message);
    }
    setCourierBusyOrderId(null);
  };

  const handleSendOrderWhatsAppApi = async (order: Order) => {
    if (!store?.id || !apiConfig || apiConfig.whatsappProvider === 'none') return;
    setCourierBusyOrderId(order.id);
    const msg = buildAutoOrderTextMessage(
      store.name,
      order,
      order.status === 'shipping' ? 'shipping' : 'confirm',
      order.status === 'shipping'
        ? apiConfig.whatsappShippingTemplate
        : apiConfig.whatsappConfirmTemplate
    );
    const res = await sendWhatsAppViaApi(
      {
        storeId: store.id,
        phone: order.customerPhone,
        message: msg,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        status: order.status,
        trackingCode: order.trackingCode,
        total: order.total
      },
      apiConfig
    );
    const nextCfg = await storage.appendApiDiagnosticLog(store, {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      service: 'whatsapp',
      action: 'manual_send',
      status: res.ok ? 'success' : 'error',
      orderNumber: order.orderNumber,
      message: `إرسال يدوي للطلب #${order.orderNumber}: ${res.message}`,
      latencyMs: res.latencyMs
    });
    setApiConfig(nextCfg);
    showToast(res.message);
    setCourierBusyOrderId(null);
  };

  const handleUpdateOrderDetails = async (params: {
    orderNumber: string;
    offerId?: string;
    bundleLabel?: string;
    wilayaId?: string;
    commune?: string;
    deliveryType?: DeliveryType;
  }): Promise<boolean> => {
    if (!store?.id) return false;
    const res = await storage.updateOrderDetails({ ...params, allowCustomBundle: true });
    if (res.success) {
      const [updatedOrders, updatedPages] = await Promise.all([
        storage.getOrders(store.id),
        storage.getLandingPages(store.id)
      ]);
      setOrders(updatedOrders);
      setLandingPages(updatedPages);
      const found = updatedOrders.find(o => o.orderNumber === params.orderNumber);
      if (selectedOrder && selectedOrder.orderNumber === params.orderNumber && found) {
        setSelectedOrder(found);
      }
      if (res.updated) {
        recentSitePushRef.current[res.updated.orderNumber.toUpperCase()] = Date.now();
        const lp = updatedPages.find(p => p.id === (res.updated?.landingPageId || found?.landingPageId));
        const webhook = lp?.integrations?.googleSheetWebhook?.trim() || store.googleSheetWebhook?.trim();
        updateOrderInGoogleSheet(webhook, {
          orderId: res.updated.orderNumber,
          wilaya: res.updated.wilayaName,
          commune: res.updated.commune,
          deliveryType: res.updated.deliveryType,
          orderDetails: res.updated.bundleLabel,
          shippingCost: res.updated.shippingFee,
          productPrice: res.updated.subtotal
        });
      }
      showToast('تم تحديث تفاصيل العرض والوجهة بنجاح');
      return true;
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر تحديث تفاصيل الطلب'));
      return false;
    }
  };

  const handleSaveApiConfig = async (nextConfig: StoreApiConfig) => {
    const res = await storage.saveStoreApiConfig(nextConfig);
    if (res.success) {
      setApiConfig(nextConfig);
      if (res.needsSqlMigration !== undefined) {
        setNeedsSqlMigration(res.needsSqlMigration);
      }
      await refreshCurrentStore();
      showToast('تم حفظ إعدادات الـ API بنجاح');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ إعدادات الـ API'));
    }
  };

  const handleClearDiagnosticLogs = async () => {
    if (!apiConfig) return;
    const cleared: StoreApiConfig = { ...apiConfig, diagnosticLogs: [] };
    await handleSaveApiConfig(cleared);
  };

  const handleSaveAdSpend = async (adSpendTotal: number, adSpendByPage: Record<string, number>) => {
    if (!store) return;
    const baseCfg = apiConfig || storage.createDefaultStoreApiConfig(store);
    const nextCfg: StoreApiConfig = {
      ...baseCfg,
      adSpendTotal: Math.max(0, adSpendTotal),
      adSpendByPage
    };
    const res = await storage.saveStoreApiConfig(nextCfg);
    if (res.success) {
      setApiConfig(nextCfg);
      showToast('تم حفظ مصاريف الإعلانات وتحديث الأرباح الصافية');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ مصاريف الإعلانات'));
    }
  };

  const handleBulkUpdateStatus = async (orderIds: string[], newStatus: OrderStatus, note?: string) => {
    if (!store?.id || orderIds.length === 0) return;
    let successCount = 0;
    const updatedOrderIds: string[] = [];
    for (const orderId of orderIds) {
      const target = orders.find(o => o.id === orderId);
      if (!target || target.status === newStatus) continue;
      const res = await storage.updateOrderStatus(
        orderId,
        newStatus,
        note || `تحديث جماعي للحالة (${ORDER_STAGE_LABELS[newStatus]})`
      );
      if (res.success) {
        successCount += 1;
        updatedOrderIds.push(orderId);
        recentSitePushRef.current[target.orderNumber.toUpperCase()] = Date.now();
        const lp = landingPages.find(p => p.id === target.landingPageId);
        const webhook = lp?.integrations?.googleSheetWebhook?.trim() || store.googleSheetWebhook?.trim();
        updateOrderInGoogleSheet(webhook, {
          orderId: target.orderNumber,
          statusLabel: ORDER_STAGE_LABELS[newStatus],
          trackingCode: target.trackingCode || ''
        });
      }
    }
    if (successCount > 0) {
      const [updatedOrders, updatedPages] = await Promise.all([
        storage.getOrders(store.id),
        storage.getLandingPages(store.id)
      ]);
      setOrders(updatedOrders);
      setLandingPages(updatedPages);
      showToast(`تم تحديث حالة ${successCount} طلبات إلى "${ORDER_STAGE_LABELS[newStatus]}"`);

      if (
        (newStatus === 'confirmed' || newStatus === 'shipping') &&
        apiConfig?.courierProvider &&
        apiConfig.courierProvider !== 'none' &&
        apiConfig.courierAutoSendOnConfirm !== false
      ) {
        const eligibleForCourier = updatedOrders.filter(
          o => updatedOrderIds.includes(o.id) && !o.trackingCode
        );
        if (eligibleForCourier.length > 0) {
          await handleBulkSendToCourier(eligibleForCourier);
        }
      }
    } else {
      showToast('لم يتم تعديل أي طلب (الحالة مطابقة بالفعل)');
    }
  };

  const handleBulkSendToCourier = async (ordersToSend: Order[]): Promise<void> => {
    if (!store?.id || !apiConfig || apiConfig.courierProvider === 'none') {
      showToast('يرجى تفعيل شركة التوصيل في "إعدادات الـ API" أولاً');
      return;
    }
    const eligible = ordersToSend.filter(
      o => !o.trackingCode && (o.status === 'new' || o.status === 'confirmed' || o.status === 'shipping')
    );
    if (eligible.length === 0) {
      showToast('الطلبات المحددة مرسلة بالفعل أو غير مؤهلة للشحن');
      return;
    }

    let sent = 0;
    let failed = 0;
    let lastFailedErr: { orderNumber: string; message: string; timestamp: string } | null = null;
    for (const ord of eligible) {
      setCourierBusyOrderId(ord.id);
      const res = await createCourierParcel(ord, apiConfig);
      const nextCfg = await storage.appendApiDiagnosticLog(store, {
        id: `log_${Date.now()}_${ord.orderNumber}`,
        timestamp: new Date().toISOString(),
        service: 'courier',
        action: 'bulk_create_parcel',
        status: res.ok ? 'success' : 'error',
        orderNumber: ord.orderNumber,
        message: `إرسال جماعي #${ord.orderNumber}: ${res.message}`,
        latencyMs: res.latencyMs
      });
      setApiConfig(nextCfg);

      if (res.ok && res.trackingCode) {
        const nextSt: OrderStatus = ord.status === 'new' ? 'confirmed' : ord.status;
        const stRes = await storage.updateOrderStatus(
          ord.id,
          nextSt,
          res.message,
          res.trackingCode,
          { provider: apiConfig.courierProvider, labelUrl: res.labelUrl }
        );
        if (stRes.success) {
          sent += 1;
          recentSitePushRef.current[ord.orderNumber.toUpperCase()] = Date.now();
          const lp = landingPages.find(p => p.id === ord.landingPageId);
          const webhook = lp?.integrations?.googleSheetWebhook?.trim() || store.googleSheetWebhook?.trim();
          updateOrderInGoogleSheet(webhook, {
            orderId: ord.orderNumber,
            statusLabel: ORDER_STAGE_LABELS[nextSt],
            trackingCode: res.trackingCode
          });
        } else {
          failed += 1;
          lastFailedErr = {
            orderNumber: ord.orderNumber,
            message: stRes.error || 'تعذر حفظ رمز التتبع بعد الإنشاء',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        failed += 1;
        lastFailedErr = {
          orderNumber: ord.orderNumber,
          message: res.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    setCourierBusyOrderId(null);
    if (lastFailedErr) {
      setLastCourierError(lastFailedErr);
    } else if (sent > 0) {
      setLastCourierError(null);
    }
    const [updatedOrders, updatedPages] = await Promise.all([
      storage.getOrders(store.id),
      storage.getLandingPages(store.id)
    ]);
    setOrders(updatedOrders);
    setLandingPages(updatedPages);
    showToast(
      failed === 0
        ? `تم إرسال ${sent} طرود إلى ${COURIER_PROVIDER_INFO[apiConfig.courierProvider].name} بنجاح`
        : `تم إرسال ${sent} طرود بنجاح، وتعذر إرسال ${failed} طلبات: ${lastFailedErr?.message || ''}`
    );
  };

  const handleDeleteOrders = async (orderIds: string[]): Promise<void> => {
    if (!store?.id || orderIds.length === 0) return;
    const idSet = new Set(orderIds);
    const targets = orders.filter(o => idSet.has(o.id));
    if (targets.length === 0) return;

    const res = await storage.deleteOrders(store.id, orderIds);
    if (!res.success) {
      if (res.needsSqlMigration) {
        setOrdersNeedsSql(true);
      }
      showToast('خطأ: ' + (res.error || 'تعذر حذف الطلبات'));
      return;
    }
    setOrdersNeedsSql(false);

    storage.rememberDeletedSheetOrderNumbers(
      store.id,
      targets.map(o => o.orderNumber)
    );

    // Best-effort removal from Google Sheet as well (for updated Apps Script deployments)
    targets.forEach(target => {
      const lp = landingPages.find(p => p.id === target.landingPageId);
      const webhook =
        lp?.integrations?.googleSheetWebhook?.trim() ||
        apiConfig?.googleSheetWebhook?.trim() ||
        store.googleSheetWebhook?.trim();
      if (webhook) {
        void deleteOrderInGoogleSheet(webhook, target.orderNumber);
      }
    });

    setOrders(prev => prev.filter(o => !idSet.has(o.id)));
    if (selectedOrder && idSet.has(selectedOrder.id)) {
      setSelectedOrder(null);
    }

    try {
      const refreshedOrders = await storage.getOrders(store.id);
      setOrders(refreshedOrders);
    } catch {
      // keep optimistic removal
    }

    showToast(
      targets.length === 1
        ? `تم حذف الطلب #${targets[0].orderNumber} نهائياً`
        : `تم حذف ${targets.length} طلبات نهائياً`
    );
  };

  const handleSaveAntiFraudConfig = async (
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
    successMsg = 'تم حفظ إعدادات الحماية من الطلبات الوهمية والمكررة'
  ) => {
    if (!store) return;
    const baseCfg = apiConfig || storage.createDefaultStoreApiConfig(store);
    const nextCfg: StoreApiConfig = { ...baseCfg, ...patch };
    const res = await storage.saveStoreApiConfig(nextCfg);
    if (res.success) {
      setApiConfig(nextCfg);
      showToast(successMsg);
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ إعدادات الحماية'));
    }
  };

  const handleSaveSettings = async (
    updated: Store,
    apiExtras?: Pick<
      StoreApiConfig,
      'promoCoupons' | 'whatsappConfirmTemplate' | 'whatsappShippingTemplate' | 'faviconUrl'
    >
  ) => {
    const res = await storage.saveStore(updated);
    if (res.success) {
      const baseCfg = apiConfig || storage.createDefaultStoreApiConfig(updated);
      const syncedCfg: StoreApiConfig = {
        ...baseCfg,
        ...(apiExtras || {}),
        metaPixelId: updated.defaultPixelId || baseCfg.metaPixelId,
        googleSheetWebhook: updated.googleSheetWebhook || baseCfg.googleSheetWebhook
      };
      await storage.saveStoreApiConfig(syncedCfg);
      setApiConfig(syncedCfg);
      await refreshCurrentStore();
      applyBrowserBranding({
        title: updated.name,
        iconUrl: syncedCfg.faviconUrl || updated.logoUrl
      });
      showToast('تم حفظ إعدادات المتجر بنجاح');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ الإعدادات'));
    }
  };

  const handleSaveStoreExtras = async (
    patch: Partial<
      Pick<
        StoreApiConfig,
        | 'promoCoupons'
        | 'whatsappConfirmTemplate'
        | 'whatsappShippingTemplate'
        | 'whatsappAbandonedTemplate'
        | 'faviconUrl'
      >
    >,
    successMsg = 'تم التحديث بنجاح'
  ) => {
    if (!store) return;
    const baseCfg = apiConfig || storage.createDefaultStoreApiConfig(store);
    const nextCfg: StoreApiConfig = { ...baseCfg, ...patch };
    const res = await storage.saveStoreApiConfig(nextCfg);
    if (res.success) {
      setApiConfig(nextCfg);
      showToast(successMsg);
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ التعديلات'));
    }
  };

  const resolveAbandonedWebhook = (landingPageId?: string) => {
    const lp = landingPageId ? landingPages.find(p => p.id === landingPageId) : undefined;
    return (
      lp?.integrations?.googleSheetWebhook?.trim() ||
      apiConfig?.googleSheetWebhook?.trim() ||
      store?.googleSheetWebhook?.trim() ||
      ''
    );
  };

  const handleUpdateAbandonedStatus = async (
    item: AbandonedOrder,
    nextStatus: AbandonedOrderStatus
  ) => {
    if (!store?.id) return;
    const webhook = resolveAbandonedWebhook(item.landingPageId);
    const contactedAt =
      nextStatus === 'contacted' ? new Date().toISOString() : item.contactedAt;
    await storage.updateAbandonedOrder(
      store.id,
      { id: item.id, sessionId: item.sessionId },
      { status: nextStatus, contactedAt },
      webhook
    );
    setAbandonedOrders(prev =>
      prev.map(a =>
        a.id === item.id || a.sessionId === item.sessionId
          ? { ...a, status: nextStatus, contactedAt, updatedAt: new Date().toISOString() }
          : a
      )
    );
    showToast(`تم تحديث الحالة إلى «${ABANDONED_STAGE_LABELS[nextStatus]}»`);
  };

  const handleDeleteAbandonedOrders = async (items: AbandonedOrder[]) => {
    if (!store?.id || items.length === 0) return;
    const defaultWebhook = resolveAbandonedWebhook(items[0]?.landingPageId);
    await storage.deleteAbandonedOrders(
      store.id,
      items.map(i => ({ id: i.id, sessionId: i.sessionId })),
      defaultWebhook
    );
    const removeIds = new Set(items.map(i => i.id));
    const removeSessions = new Set(items.map(i => i.sessionId));
    setAbandonedOrders(prev =>
      prev.filter(a => !removeIds.has(a.id) && !removeSessions.has(a.sessionId))
    );
    showToast(
      items.length === 1
        ? 'تم حذف الطلب المتروك نهائياً'
        : `تم حذف ${items.length} طلبات متروكة نهائياً`
    );
  };

  const handleSyncAbandonedWithSheet = async () => {
    if (!store?.id) return;
    setIsSyncingAbandoned(true);
    setLastAbandonedSyncError(null);
    try {
      const latest = await storage.getAbandonedOrders(store.id);
      setAbandonedOrders(latest.items);
      setAbandonedNeedsSql(Boolean(latest.needsSqlMigration));

      const webhook = resolveAbandonedWebhook();
      if (!webhook) {
        showToast('تم تحديث الطلبات المتروكة من المتجر');
        return;
      }

      const sheetRes = await fetchAbandonedOrdersFromGoogleSheet(webhook);
      if (!sheetRes.ok) {
        setLastAbandonedSyncError(
          sheetRes.error || 'تعذر قراءة ورقة الطلبات المتروكة من غوغل شيت'
        );
        return;
      }
      if (sheetRes.scriptVersion < 4) {
        setLastAbandonedSyncError(
          'للمزامنة مع ورقة الطلبات المتروكة المستقلة في غوغل شيت، يرجى تحديث سكريبت غوغل إلى الإصدار الجديد ثم إعادة النشر.'
        );
        return;
      }

      const imported = await storage.mergeAbandonedFromSheet(
        store.id,
        sheetRes.rows,
        latest.items
      );
      if (imported > 0) {
        const refreshed = await storage.getAbandonedOrders(store.id);
        setAbandonedOrders(refreshed.items);
        showToast(`تم استيراد ${imported} طلب متروك جديد من ورقة غوغل شيت`);
      } else {
        showToast(`تمت المزامنة بنجاح (${sheetRes.rows.length} سجل في ورقة الطلبات المتروكة)`);
      }
    } catch {
      setLastAbandonedSyncError('تعذر الاتصال بورقة الطلبات المتروكة حالياً');
    } finally {
      setIsSyncingAbandoned(false);
    }
  };

  const handleConvertAbandonedToOrder = async (
    payload: ConvertAbandonedPayload
  ): Promise<{ success: boolean; error?: string }> => {
    if (!store?.id) return { success: false, error: 'المتجر غير متاح' };

    const placeRes = await storage.placeOrder({
      storeId: store.id,
      landingPageId: payload.landingPageId,
      offerId: payload.offerId,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      wilayaId: payload.wilayaId,
      wilayaName: payload.wilayaName,
      commune: payload.commune,
      deliveryType: payload.deliveryType,
      address: `${payload.wilayaName} - ${payload.commune}${
        payload.deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''
      }`,
      variantLabel: payload.abandoned.variantLabel || undefined,
      antiBot: { honeypot: '', fillTimeMs: 5000 }
    });

    if (!placeRes.success || !placeRes.order) {
      return {
        success: false,
        error: placeRes.error || 'تعذر إنشاء الطلب من السجل المتروك'
      };
    }

    const createdOrder = placeRes.order;
    let finalStatus: OrderStatus = createdOrder.status;

    if (payload.confirmImmediately && createdOrder.status !== 'confirmed') {
      const upRes = await storage.updateOrderStatus(
        createdOrder.id,
        'confirmed',
        'تم تأكيد الطلب وتحويله من قسم الطلبات المتروكة'
      );
      if (upRes.success) {
        finalStatus = 'confirmed';
      }
    }

    // Push newly converted order to main "Orders" Google Sheet
    const lp = landingPages.find(p => p.id === payload.landingPageId);
    const webhook = resolveAbandonedWebhook(payload.landingPageId);
    const offer = lp?.offers.find(o => o.id === payload.offerId);
    const bundleDetails = `${offer?.title || createdOrder.bundleLabel || lp?.title || 'طلب مسترجع'}${
      payload.abandoned.variantLabel ? ` (${payload.abandoned.variantLabel})` : ''
    }${offer?.quantity ? ` (الكمية: ${offer.quantity})` : ''}`;

    recentSitePushRef.current[createdOrder.orderNumber.toUpperCase()] = Date.now();
    sendOrderToGoogleSheet(webhook, {
      orderId: createdOrder.orderNumber,
      fullName: payload.customerName,
      phone: payload.customerPhone,
      wilaya: payload.wilayaName,
      commune: payload.commune,
      deliveryType: payload.deliveryType,
      orderDetails: bundleDetails,
      shippingCost: createdOrder.shippingFee,
      productPrice: createdOrder.subtotal,
      totalPrice: createdOrder.total,
      statusLabel: ORDER_STAGE_LABELS[finalStatus]
    });

    // Mark abandoned session recovered & remove from "الطلبات المتروكة" sheet
    await storage.updateAbandonedOrder(
      store.id,
      { id: payload.abandoned.id, sessionId: payload.abandoned.sessionId },
      { status: 'recovered', recoveredOrderNumber: createdOrder.orderNumber },
      webhook
    );

    const [updatedOrders, updatedPages, updatedAbandoned] = await Promise.all([
      storage.getOrders(store.id),
      storage.getLandingPages(store.id),
      storage.getAbandonedOrders(store.id)
    ]);
    setOrders(updatedOrders);
    setLandingPages(updatedPages);
    setAbandonedOrders(updatedAbandoned.items);

    showToast(`تم تحويل الطلب المتروك بنجاح إلى الطلب #${createdOrder.orderNumber}`);
    return { success: true };
  };

  const handleInitialStoreSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    setIsSettingUp(true);
    const res = await setupPrivateStore({
      storeName: setupStoreName,
      subdomain: setupSubdomain,
      phone: setupPhone
    });
    setIsSettingUp(false);
    if (!res.success) {
      setSetupError(res.error || 'تعذر إنشاء المتجر');
    }
  };

  // Protected route in Supabase mode
  if (isSupabaseMode && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 text-center">
        <LoginModal
          isOpen={loginModalOpen}
          onClose={() => setLoginModalOpen(false)}
          onSuccess={() => setLoginModalOpen(false)}
        />
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            لوحة إدارة متجرك الخاصة
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            سجّل الدخول بحساب مالك المتجر للوصول إلى منشئ صفحات الهبوط والطلبات وإعدادات الـ API.
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => setLoginModalOpen(true)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer"
            >
              تسجيل دخول المالك
            </button>
          </div>
        </div>
      </div>
    );
  }

  // First-time store initialization in Supabase mode
  if (isSupabaseMode && !isAuthLoading && !store) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
              <StoreIcon className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">تهيئة متجرك الخاص</h2>
            <p className="text-xs text-slate-500">أدخل الاسم الأولي لمتجرك لتفعيل منشئ صفحات الهبوط</p>
          </div>
          {setupError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {setupError}
            </div>
          )}
          <form onSubmit={handleInitialStoreSetup} className="space-y-3">
            <div>
              <label className="block text-xs font-bold mb-1">اسم المتجر</label>
              <input
                type="text"
                required
                value={setupStoreName}
                onChange={e => setSetupStoreName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">معرف المتجر (بالإنجليزية)</label>
              <input
                type="text"
                dir="ltr"
                required
                value={setupSubdomain}
                onChange={e => setSetupSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">رقم الهاتف / واتساب</label>
              <input
                type="text"
                dir="ltr"
                required
                value={setupPhone}
                onChange={e => setSetupPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSettingUp}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
            >
              {isSettingUp ? 'جارٍ الإنشاء وتجهيز الصفحات...' : 'حفظ وفتح لوحة التحكم'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => enableDemoPreview(true)}
            className="w-full py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold cursor-pointer"
          >
            تشغيل الوضع التجريبي المباشر (بدون قاعدة بيانات)
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full py-2 text-center text-xs text-slate-400 hover:text-rose-500 font-semibold cursor-pointer"
          >
            تسجيل الخروج ({currentUser?.email})
          </button>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <span className="text-xs text-slate-500 font-bold">جارٍ تحميل لوحة المتجر...</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
    { id: 'pages', label: 'صفحات الهبوط', icon: Layers, badge: landingPages.length },
    { id: 'orders', label: 'الطلبات والشحن', icon: ShoppingBag, badge: orders.filter(o => o.status === 'new').length },
    {
      id: 'abandoned',
      label: 'الطلبات المتروكة',
      icon: UserX,
      badge: abandonedOrders.filter(a => a.status === 'new').length
    },
    { id: 'api', label: 'إعدادات الـ API', icon: Plug },
    { id: 'settings', label: 'الإعدادات والتوصيل', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-colors">
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 p-4 rounded-xl bg-slate-900 text-white dark:bg-emerald-600 shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col justify-between w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-5 shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div
              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shadow-md shrink-0"
              style={{ backgroundColor: store.brandColor || '#754b2d' }}
            >
              {store.logoUrl ? (
                <img
                  src={store.logoUrl}
                  alt={store.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                store.name.slice(0, 1)
              )}
            </div>
            <div className="truncate">
              <h2 className="font-bold text-sm truncate">{store.name}</h2>
              <div className="text-[11px] text-slate-400 truncate">لوحة المتجر وصفحات الهبوط</div>
            </div>
          </div>

          <button
            onClick={() => onGoToStorefront()}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-between border border-slate-200 dark:border-slate-700/60 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>معاينة المتجر والصفحات</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <nav className="space-y-1.5 pt-2">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 rounded-full text-[10px] font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                {(currentUser?.name || store.name)[0]}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold truncate">{currentUser?.name || store.name}</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {isSupabaseMode ? currentUser?.email : 'وضع محلي تجريبي'}
                </div>
              </div>
            </div>
            <ThemeToggle />
          </div>
          {isSupabaseMode && (
            <button
              onClick={logout}
              className="w-full py-1.5 text-center text-xs text-slate-400 hover:text-rose-500 font-semibold flex items-center justify-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-6">
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="text-base font-extrabold">
              {navItems.find(i => i.id === activeTab)?.label}
            </span>
          </div>

          <button
            onClick={() => onGoToStorefront()}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <StoreIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">معاينة واجهة المتجر</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="md:hidden p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${
                    isActive ? 'bg-emerald-600 text-white' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-4 sm:p-8 flex-1">
          {isDataLoading && (
            <div className="p-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">جارٍ تحميل بيانات المتجر...</p>
            </div>
          )}

          {loadError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{loadError}</span>
              </div>
              <button onClick={loadData} className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold">
                إعادة المحاولة
              </button>
            </div>
          )}

          {!isDataLoading && (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  store={store}
                  orders={orders}
                  landingPages={landingPages}
                  apiConfig={apiConfig}
                  onSaveAdSpend={handleSaveAdSpend}
                  onSelectOrder={ord => {
                    setSelectedOrder(ord);
                    setActiveTab('orders');
                  }}
                  onGoToPages={() => setActiveTab('pages')}
                  onRestockPage={handleRestockPage}
                />
              )}

              {activeTab === 'pages' && (
                <LandingPagesTab
                  storeId={store.id}
                  landingPages={landingPages}
                  onSaveLandingPage={handleSaveLandingPage}
                  onDeleteLandingPage={handleDeleteLandingPage}
                  onPreviewPage={slug => onGoToStorefront(slug)}
                />
              )}

              {activeTab === 'orders' && (
                <OrdersTab
                  store={store}
                  orders={orders}
                  landingPages={landingPages}
                  apiConfig={apiConfig}
                  courierBusyOrderId={courierBusyOrderId}
                  lastCourierError={lastCourierError}
                  onDismissCourierError={() => setLastCourierError(null)}
                  onGoToApiConfig={() => setActiveTab('api')}
                  onUpdateStatus={handleUpdateOrderStatus}
                  onBulkUpdateStatus={handleBulkUpdateStatus}
                  onBulkSendToCourier={handleBulkSendToCourier}
                  onDeleteOrders={handleDeleteOrders}
                  onSaveAntiFraudConfig={handleSaveAntiFraudConfig}
                  onUpdateOrderDetails={handleUpdateOrderDetails}
                  onSendOrderToCourier={handleSendOrderToCourier}
                  onPullCourierStatus={handlePullCourierStatus}
                  onSendOrderWhatsAppApi={handleSendOrderWhatsAppApi}
                  onSyncFromGoogleSheet={() =>
                    syncOrdersWithGoogleSheets(orders, landingPages, true, apiConfig?.googleSheetWebhook)
                  }
                  isSyncingSheet={isSyncingSheet}
                  lastSheetSyncError={lastSheetSyncError}
                  onDismissSheetSyncError={() => setLastSheetSyncError(null)}
                  ordersNeedsSql={ordersNeedsSql}
                  onDismissOrdersSql={() => setOrdersNeedsSql(false)}
                  selectedOrder={selectedOrder}
                  onSelectOrder={setSelectedOrder}
                />
              )}

              {activeTab === 'abandoned' && (
                <AbandonedOrdersTab
                  store={store}
                  abandonedOrders={abandonedOrders}
                  landingPages={landingPages}
                  apiConfig={apiConfig}
                  isLoading={isDataLoading}
                  isSyncingSheet={isSyncingAbandoned}
                  lastSyncError={lastAbandonedSyncError}
                  needsSqlMigration={abandonedNeedsSql}
                  onDismissSyncError={() => setLastAbandonedSyncError(null)}
                  onDismissSqlNotice={() => setAbandonedNeedsSql(false)}
                  onSyncWithSheet={handleSyncAbandonedWithSheet}
                  onUpdateStatus={handleUpdateAbandonedStatus}
                  onDeleteItems={handleDeleteAbandonedOrders}
                  onConvertToOrder={handleConvertAbandonedToOrder}
                  onSaveReminderTemplate={template =>
                    handleSaveStoreExtras(
                      { whatsappAbandonedTemplate: template },
                      'تم حفظ رسالة تذكير الطلبات المتروكة بنجاح'
                    )
                  }
                  onOpenOrderByNumber={orderNum => {
                    const found = orders.find(
                      o => o.orderNumber.toUpperCase() === orderNum.toUpperCase()
                    );
                    if (found) setSelectedOrder(found);
                    setActiveTab('orders');
                  }}
                />
              )}

              {activeTab === 'api' && apiConfig && (
                <ApiConfigTab
                  store={store}
                  initialConfig={apiConfig}
                  needsSqlMigration={needsSqlMigration}
                  onSaveConfig={handleSaveApiConfig}
                  onClearLogs={handleClearDiagnosticLogs}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  store={store}
                  apiConfig={apiConfig}
                  onSaveSettings={handleSaveSettings}
                  onSaveStoreExtras={handleSaveStoreExtras}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
