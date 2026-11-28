import {
  AbandonedOrder,
  AbandonedOrderStatus,
  CourierProvider,
  DeliveryType,
  Order,
  OrderStatus,
  StoreApiConfig
} from '../types';
import { formatPlainDZD, getWilayaById } from '../data/wilayas';
import { ECOTRACK_WILAYA_HUB, resolveOfficialEcotrackCommune } from '../data/ecotrackCommunes';
import {
  isRealSheetOrderRow,
  validateAlgerianPhone,
  validateCustomerName
} from '../utils/orderValidation';
import { isValidCustomDomain, normalizeDomainHost } from '../utils/urlRouting';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
    ttq?: any;
    TiktokAnalyticsObject?: string;
  }
}

const initializedPixels = new Set<string>();
const initializedTikTokPixels = new Set<string>();
const FBC_SESSION_KEY = 'brightdz_meta_fbc';

export function generateTrackingEventId(prefix = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export function captureMetaAttributionCookies(): { fbp?: string; fbc?: string } {
  if (typeof window === 'undefined') return {};
  let fbp = readCookie('_fbp') || undefined;
  let fbc = readCookie('_fbc') || undefined;

  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid')?.trim();
    if (fbclid) {
      const builtFbc = `fb.1.${Date.now()}.${fbclid}`;
      fbc = builtFbc;
      try {
        sessionStorage.setItem(FBC_SESSION_KEY, builtFbc);
      } catch {
        // ignore storage restrictions
      }
      try {
        document.cookie = `_fbc=${encodeURIComponent(builtFbc)}; path=/; max-age=${90 * 86400}; SameSite=Lax`;
      } catch {
        // ignore cookie restrictions
      }
    } else if (!fbc) {
      try {
        const stored = sessionStorage.getItem(FBC_SESSION_KEY);
        if (stored) fbc = stored;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore URL parsing errors
  }

  return { fbp, fbc };
}

function ensureMetaPixelLoaded(pixelId: string | undefined): string {
  const cleanId = pixelId?.trim() || '';
  if (!cleanId || typeof window === 'undefined' || typeof document === 'undefined') return '';
  try {
    if (!window.fbq) {
      (function (f: any, b: Document, e: string, v: string) {
        if (f.fbq) return;
        const n: any = (f.fbq = function (...args: any[]) {
          if (n.callMethod) {
            n.callMethod.apply(n, args);
          } else {
            n.queue.push(args);
          }
        });
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        const t = b.createElement(e) as HTMLScriptElement;
        t.async = true;
        t.src = v;
        t.onerror = () => {};
        const s = b.getElementsByTagName(e)[0];
        if (s && s.parentNode) {
          s.parentNode.insertBefore(t, s);
        } else {
          b.head.appendChild(t);
        }
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    }
    if (window.fbq && !initializedPixels.has(cleanId)) {
      window.fbq('init', cleanId);
      initializedPixels.add(cleanId);
    }
  } catch {
    // Never break storefront UX if ad blockers block Facebook Pixel
  }
  return cleanId;
}

export function trackMetaPixelStorefrontVisit(pixelId: string | undefined): void {
  captureMetaAttributionCookies();
  const cleanId = ensureMetaPixelLoaded(pixelId);
  if (cleanId && typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq('track', 'PageView');
    } catch {
      // ignore
    }
  }
}

export function trackTikTokPixelPage(
  tiktokPixelId: string | undefined,
  contentName: string,
  value: number,
  eventId?: string
): void {
  const cleanId = tiktokPixelId?.trim();
  if (!cleanId || typeof window === 'undefined' || typeof document === 'undefined') return;

  try {
    if (!window.ttq) {
      (function (w: any, d: Document, t: string) {
        w.TiktokAnalyticsObject = t;
        const ttq = (w[t] = w[t] || []);
        ttq.methods = [
          'page',
          'track',
          'identify',
          'instances',
          'debug',
          'on',
          'off',
          'once',
          'ready',
          'alias',
          'group',
          'enableCookie',
          'disableCookie'
        ];
        ttq.setAndDefer = function (tObj: any, e: string) {
          tObj[e] = function (...args: any[]) {
            tObj.push([e, ...args]);
          };
        };
        for (let i = 0; i < ttq.methods.length; i++) {
          ttq.setAndDefer(ttq, ttq.methods[i]);
        }
        ttq.load = function (e: string) {
          const r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
          const n = d.createElement('script');
          n.type = 'text/javascript';
          n.async = true;
          n.src = `${r}?sdkid=${encodeURIComponent(e)}&lib=${t}`;
          n.onerror = () => {};
          const s = d.getElementsByTagName('script')[0];
          if (s && s.parentNode) s.parentNode.insertBefore(n, s);
          else d.head.appendChild(n);
        };
      })(window, document, 'ttq');
    }

    if (window.ttq) {
      if (!initializedTikTokPixels.has(cleanId)) {
        window.ttq.load(cleanId);
        initializedTikTokPixels.add(cleanId);
      }
      window.ttq.page();
      window.ttq.track(
        'ViewContent',
        {
          content_name: contentName,
          value,
          currency: 'DZD'
        },
        eventId ? { event_id: eventId } : undefined
      );
    }
  } catch {
    // Ignore ad blocker errors
  }
}

export function trackMetaPixelPage(
  pixelId: string | undefined,
  contentName: string,
  category: string,
  value: number,
  options?: {
    storeId?: string;
    contentId?: string;
    tiktokPixelId?: string;
  }
): void {
  const { fbp, fbc } = captureMetaAttributionCookies();
  const cleanId = ensureMetaPixelLoaded(pixelId);
  const eventId = generateTrackingEventId('view');

  if (options?.tiktokPixelId) {
    trackTikTokPixelPage(options.tiktokPixelId, contentName, value, eventId);
  }

  if (cleanId && typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq('track', 'PageView');
      window.fbq(
        'track',
        'ViewContent',
        {
          content_name: contentName,
          content_category: category,
          content_type: 'product',
          content_ids: options?.contentId ? [options.contentId] : undefined,
          value: Number(value) || 0,
          currency: 'DZD'
        },
        { eventID: eventId }
      );
    } catch {
      // Never break storefront UX if ad blockers block Facebook Pixel
    }
  }

  if (options?.storeId && typeof fetch !== 'undefined') {
    void fetch('/api/integrations/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: options.storeId,
        pixelId: cleanId || undefined,
        eventName: 'ViewContent',
        eventId,
        value: Number(value) || 0,
        contentName,
        contentId: options.contentId,
        fbp,
        fbc,
        pageUrl: typeof window !== 'undefined' ? window.location.href : ''
      })
    }).catch(() => {});
  }
}

export function trackMetaPixelInitiateCheckout(
  pixelId: string | undefined,
  contentName: string,
  value: number,
  options?: {
    storeId?: string;
    contentId?: string;
    numItems?: number;
  }
): void {
  const { fbp, fbc } = captureMetaAttributionCookies();
  const cleanId = ensureMetaPixelLoaded(pixelId);
  const eventId = generateTrackingEventId('ic');

  if (cleanId && typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq(
        'track',
        'InitiateCheckout',
        {
          content_name: contentName,
          content_type: 'product',
          content_ids: options?.contentId ? [options.contentId] : undefined,
          num_items: options?.numItems || 1,
          value: Number(value) || 0,
          currency: 'DZD'
        },
        { eventID: eventId }
      );
    } catch {
      // ignore
    }
  }

  if (options?.storeId && typeof fetch !== 'undefined') {
    void fetch('/api/integrations/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: options.storeId,
        pixelId: cleanId || undefined,
        eventName: 'InitiateCheckout',
        eventId,
        value: Number(value) || 0,
        contentName,
        contentId: options.contentId,
        numItems: options.numItems || 1,
        fbp,
        fbc,
        pageUrl: typeof window !== 'undefined' ? window.location.href : ''
      })
    }).catch(() => {});
  }
}

export function trackMetaPixelPurchase(
  pixelId: string | undefined,
  contentName: string,
  value: number,
  orderNumber: string,
  options?: {
    storeId?: string;
    contentId?: string;
    numItems?: number;
    tiktokPixelId?: string;
    customerPhone?: string;
    customerName?: string;
    wilayaName?: string;
  }
): void {
  const { fbp, fbc } = captureMetaAttributionCookies();
  const cleanId = ensureMetaPixelLoaded(pixelId);
  const eventId = `purchase_${orderNumber}`;
  const numericValue = Math.round(Number(value) || 0);

  if (cleanId && typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq(
        'track',
        'Purchase',
        {
          content_name: contentName,
          content_type: 'product',
          content_ids: options?.contentId ? [options.contentId] : [orderNumber],
          num_items: options?.numItems || 1,
          value: numericValue,
          currency: 'DZD',
          order_id: orderNumber
        },
        { eventID: eventId }
      );
    } catch {
      // Ignore pixel blocking errors
    }
  }

  if (options?.tiktokPixelId?.trim() && typeof window !== 'undefined' && window.ttq) {
    try {
      window.ttq.track(
        'CompletePayment',
        {
          content_name: contentName,
          value: numericValue,
          currency: 'DZD',
          order_id: orderNumber
        },
        { event_id: eventId }
      );
    } catch {
      // Ignore TikTok blocking errors
    }
  }

  if (options?.storeId && typeof fetch !== 'undefined') {
    void fetch('/api/integrations/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: options.storeId,
        pixelId: cleanId || undefined,
        eventName: 'Purchase',
        eventId,
        orderNumber,
        value: numericValue,
        contentName,
        contentId: options.contentId,
        numItems: options.numItems || 1,
        customerPhone: options.customerPhone,
        customerName: options.customerName,
        wilayaName: options.wilayaName,
        fbp,
        fbc,
        pageUrl: typeof window !== 'undefined' ? window.location.href : ''
      })
    }).catch(() => {});
  }
}

const sheetScriptVersionByUrl = new Map<string, number>();
const knownSheetOrderIdsByUrl = new Map<string, Set<string>>();

function rememberKnownSheetOrderId(webhookUrl: string, orderId: string): void {
  const cleanUrl = webhookUrl.trim();
  const cleanId = orderId.replace(/^#/, '').trim().toUpperCase();
  if (!cleanUrl || !cleanId) return;
  let set = knownSheetOrderIdsByUrl.get(cleanUrl);
  if (!set) {
    set = new Set<string>();
    knownSheetOrderIdsByUrl.set(cleanUrl, set);
  }
  set.add(cleanId);
}

async function ensureSheetScriptCapabilities(webhookUrl: string): Promise<{
  scriptVersion: number;
  knownIds: Set<string>;
}> {
  const cleanUrl = webhookUrl.trim();
  const cachedVer = sheetScriptVersionByUrl.get(cleanUrl);
  if (cachedVer !== undefined) {
    return {
      scriptVersion: cachedVer,
      knownIds: knownSheetOrderIdsByUrl.get(cleanUrl) || new Set<string>()
    };
  }

  if (typeof fetch === 'undefined') {
    return { scriptVersion: 0, knownIds: new Set<string>() };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('/api/integrations/google-sheet-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: cleanUrl, action: 'list' }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const payload = await res.json();
      const data = payload?.data;
      const ver = Number(data?.scriptVersion || 0);
      sheetScriptVersionByUrl.set(cleanUrl, Number.isFinite(ver) ? ver : 0);
      const list = Array.isArray(data?.orders) ? data.orders : [];
      const set = knownSheetOrderIdsByUrl.get(cleanUrl) || new Set<string>();
      list.forEach((r: any) => {
        const id = String(r?.orderId ?? r?.order_id ?? r?.orderNumber ?? '')
          .replace(/^#/, '')
          .trim()
          .toUpperCase();
        if (id) set.add(id);
      });
      knownSheetOrderIdsByUrl.set(cleanUrl, set);
      return { scriptVersion: Number.isFinite(ver) ? ver : 0, knownIds: set };
    }
  } catch {
    // non-fatal probe
  }

  return {
    scriptVersion: 0,
    knownIds: knownSheetOrderIdsByUrl.get(cleanUrl) || new Set<string>()
  };
}

export async function sendOrderToGoogleSheet(
  webhookUrl: string | undefined,
  payload: {
    orderId: string;
    fullName: string;
    phone: string;
    wilaya: string;
    commune: string;
    deliveryType: DeliveryType;
    orderDetails: string;
    statusLabel: string;
    shippingCost: number;
    productPrice: number;
    totalPrice: number;
    discount?: number;
    discountReason?: string;
    trackingCode?: string;
  }
): Promise<void> {
  const cleanUrl = webhookUrl?.trim();
  const cleanOrderId = String(payload.orderId || '').replace(/^#/, '').trim();
  const nameCheck = validateCustomerName(payload.fullName);
  const phoneCheck = validateAlgerianPhone(payload.phone);
  if (!cleanUrl || !cleanOrderId || !nameCheck.valid || !phoneCheck.valid) return;

  try {
    const formData = new URLSearchParams();
    formData.append('action', 'create');
    formData.append('orderId', cleanOrderId);
    formData.append('fullName', nameCheck.cleaned);
    formData.append('phone', phoneCheck.normalized);
    formData.append('wilaya', payload.wilaya);
    formData.append('commune', payload.commune);
    formData.append(
      'shippingType',
      payload.deliveryType === 'home' ? 'توصيل للمنزل' : 'مكتب الشحن Stop Desk'
    );
    formData.append('order', payload.orderDetails);
    formData.append('status', payload.statusLabel);
    formData.append('shippingCost', String(Math.round(payload.shippingCost || 0)));
    formData.append('productPrice', String(Math.round(payload.productPrice || 0)));
    formData.append('discount', String(Math.round(payload.discount || 0)));
    formData.append('discountReason', payload.discountReason || '');
    formData.append('totalPrice', String(Math.round(payload.totalPrice || 0)));
    formData.append('trackingCode', payload.trackingCode || '');

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
    rememberKnownSheetOrderId(cleanUrl, cleanOrderId);
  } catch (err) {
    console.warn('Google Sheet webhook request failed (non-blocking):', err);
  }
}

export async function updateOrderInGoogleSheet(
  webhookUrl: string | undefined,
  payload: {
    orderId: string;
    wilaya?: string;
    commune?: string;
    deliveryType?: DeliveryType;
    orderDetails?: string;
    statusLabel?: string;
    shippingCost?: number;
    productPrice?: number;
    trackingCode?: string;
  }
): Promise<void> {
  const cleanUrl = webhookUrl?.trim();
  const cleanOrderId = payload.orderId.replace(/^#/, '').trim();
  if (!cleanUrl || !cleanOrderId) return;

  try {
    // Safety guard: older Apps Script deployments (< v3) lacked a return after the
    // update loop and would fall through to appendRow([date, orderId, ""]) if the order
    // did not exist in the sheet. Only send update to older scripts when the order is
    // confirmed to exist in that sheet.
    const { scriptVersion, knownIds } = await ensureSheetScriptCapabilities(cleanUrl);
    if (scriptVersion < 3 && !knownIds.has(cleanOrderId.toUpperCase())) {
      return;
    }

    const formData = new URLSearchParams();
    formData.append('action', 'update');
    formData.append('orderId', cleanOrderId);
    if (payload.wilaya !== undefined) formData.append('wilaya', payload.wilaya);
    if (payload.commune !== undefined) formData.append('commune', payload.commune);
    if (payload.deliveryType !== undefined) {
      formData.append(
        'shippingType',
        payload.deliveryType === 'home' ? 'توصيل للمنزل' : 'مكتب الشحن Stop Desk'
      );
    }
    if (payload.orderDetails !== undefined) formData.append('order', payload.orderDetails);
    if (payload.statusLabel !== undefined) formData.append('status', payload.statusLabel);
    if (payload.shippingCost !== undefined) formData.append('shippingCost', String(Math.round(payload.shippingCost || 0)));
    if (payload.productPrice !== undefined) formData.append('productPrice', String(Math.round(payload.productPrice || 0)));
    if (payload.trackingCode !== undefined) formData.append('trackingCode', payload.trackingCode);

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
  } catch (err) {
    console.warn('Google Sheet update request failed (non-blocking):', err);
  }
}

export async function deleteOrderInGoogleSheet(
  webhookUrl: string | undefined,
  orderId: string
): Promise<void> {
  const cleanUrl = webhookUrl?.trim();
  const cleanOrderId = orderId?.replace(/^#/, '').trim();
  if (!cleanUrl || !cleanOrderId) return;

  try {
    // Critical guard: older Apps Script deployments (< v3) do not handle action="delete"
    // and would fall through to appendRow([date, orderId, ""]) — creating phantom rows
    // with ONLY the date and order number! Only dispatch delete POST to verified v3+ scripts.
    const { scriptVersion } = await ensureSheetScriptCapabilities(cleanUrl);
    if (scriptVersion < 3) {
      return;
    }

    const formData = new URLSearchParams();
    formData.append('action', 'delete');
    formData.append('orderId', cleanOrderId);

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
    knownSheetOrderIdsByUrl.get(cleanUrl)?.delete(cleanOrderId.toUpperCase());
  } catch (err) {
    console.warn('Google Sheet delete request failed (non-blocking):', err);
  }
}

export function mapSheetStatusToOrderStatus(raw?: string): OrderStatus {
  const text = (raw || '').trim().toLowerCase();
  if (!text) return 'new';
  if (text.includes('ملغ') || text.includes('cancel') || text.includes('إلغاء')) return 'cancelled';
  if (text.includes('تسليم') || text.includes('تم التوصيل') || text.includes('delivered')) return 'delivered';
  if (text.includes('شحن') || text.includes('توصيل') || text.includes('طريق') || text.includes('shipping')) return 'shipping';
  if (text === 'التأكيد' || text.includes('مؤكد') || text.includes('تم التأكيد') || text.includes('confirmed')) return 'confirmed';
  return 'new';
}

export interface SheetTrackedOrder {
  orderNumber: string;
  customerFirstName: string;
  bundleLabel: string;
  wilayaName?: string;
  commune?: string;
  deliveryType?: DeliveryType;
  status: OrderStatus;
  trackingCode?: string;
  total: number;
  sheetUpdatedAt?: string;
}

export interface SheetOrderRow {
  orderId: string;
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType?: DeliveryType;
  orderName: string;
  orderStatus: string;
  status: OrderStatus;
  shippingCost: number;
  productPrice: number;
  discount: number;
  total: number;
  trackingCode: string;
  createdAt?: string;
  sheetUpdatedAt?: string;
}

function normalizeSheetPhone(raw: unknown): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 9 && (digits.startsWith('5') || digits.startsWith('6') || digits.startsWith('7'))) {
    return '0' + digits;
  }
  return String(raw || '').trim();
}

export async function fetchOrderFromGoogleSheet(
  webhookUrl: string | undefined,
  orderNumber: string
): Promise<SheetTrackedOrder | null> {
  const cleanUrl = webhookUrl?.trim();
  const cleanId = orderNumber.trim();
  if (!cleanUrl || !cleanId || typeof fetch === 'undefined') {
    return null;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch('/api/integrations/google-sheet-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: cleanUrl, orderId: cleanId }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const payload = await res.json();
    const data = payload?.data;
    if (!data || data.status !== 'success') {
      return null;
    }

    const rawTotal = String(data.total || '').replace(/[^\d.]/g, '');
    const parsedTotal = parseFloat(rawTotal) || 0;
    const fullName = String(data.fullName || '').trim();
    const rawShippingType = String(data.shippingType || data.deliveryType || '')
      .trim()
      .toLowerCase();
    const parsedDeliveryType: DeliveryType | undefined = rawShippingType
      ? rawShippingType.includes('stop') || rawShippingType.includes('مكتب')
        ? 'stop'
        : 'home'
      : undefined;

    return {
      orderNumber: String(data.orderId || cleanId).trim(),
      customerFirstName: fullName ? fullName.split(' ')[0] : 'الزبون الكريم',
      bundleLabel: String(data.orderName || '').trim(),
      wilayaName: String(data.wilaya || data.wilayaName || '').trim() || undefined,
      commune: String(data.commune || '').trim() || undefined,
      deliveryType: parsedDeliveryType,
      status: mapSheetStatusToOrderStatus(data.orderStatus),
      trackingCode: String(data.trackingCode || '').trim() || undefined,
      total: parsedTotal,
      sheetUpdatedAt: data.sheetUpdatedAt ? String(data.sheetUpdatedAt).trim() : undefined
    };
  } catch {
    return null;
  }
}

export async function fetchAllOrdersFromGoogleSheetDetailed(
  webhookUrl: string | undefined
): Promise<{ ok: boolean; rows: SheetOrderRow[]; error?: string }> {
  const cleanUrl = webhookUrl?.trim();
  if (!cleanUrl || typeof fetch === 'undefined') {
    return { ok: false, rows: [], error: 'رابط Google Sheet غير محدد' };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 18000);
    const res = await fetch('/api/integrations/google-sheet-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: cleanUrl, action: 'list' }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, rows: [], error: `تعذر الاتصال بخادم المزامنة (HTTP ${res.status})` };
    }
    const payload = await res.json();
    if (!payload?.ok || !payload?.data) {
      return {
        ok: false,
        rows: [],
        error: payload?.error || 'لم يرجع رابط Google Sheet بيانات صالحة — تأكد من نشر كود doGet بصلاحية Anyone'
      };
    }

    const data = payload.data;
    const reportedVer = Number(data?.scriptVersion || 0);
    sheetScriptVersionByUrl.set(cleanUrl, Number.isFinite(reportedVer) ? reportedVer : 0);

    const rawList: any[] | null = Array.isArray(data)
      ? data
      : Array.isArray(data.orders)
        ? data.orders
        : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.rows)
            ? data.rows
            : null;

    if (!rawList) {
      return {
        ok: false,
        rows: [],
        error: 'استجابة Google Sheet لا تحتوي على قائمة طلبات (orders) — تأكد من تحديث كود Apps Script (doGet)'
      };
    }

    const parseNum = (val: unknown): number => {
      const cleaned = String(val ?? '').replace(/[^\d.-]/g, '');
      const num = parseFloat(cleaned);
      return Number.isFinite(num) ? Math.max(0, num) : 0;
    };

    const rows: SheetOrderRow[] = [];
    const seenIds = new Set<string>();
    rawList.forEach((r: any, idx: number) => {
      if (!r || typeof r !== 'object') return;
      const rawId = String(
        r.orderId ?? r.order_id ?? r.orderNumber ?? r['رقم الطلب'] ?? ''
      )
        .replace(/^#/, '')
        .trim();
      const fullName = String(
        r.fullName ?? r.customerName ?? r.name ?? r['الاسم الكامل'] ?? ''
      ).trim();
      const phone = normalizeSheetPhone(r.phone ?? r.customerPhone ?? r['الهاتف'] ?? '');
      const wilaya = String(r.wilaya ?? r.wilayaName ?? r['الولاية'] ?? '').trim();
      const orderName = String(
        r.orderName ?? r.order ?? r.product ?? r.bundleLabel ?? r['المنتج'] ?? ''
      ).trim();

      // Skip blank/phantom rows (e.g. rows containing ONLY date and order number)
      if (!isRealSheetOrderRow({ fullName, phone, wilaya, orderName })) return;

      const orderId = rawId || `GS-ROW-${idx + 2}`;
      seenIds.add(orderId.toUpperCase());
      const rawShippingType = String(
        r.shippingType ?? r.deliveryType ?? r['طريقة التوصيل'] ?? ''
      )
        .trim()
        .toLowerCase();
      const parsedDeliveryType: DeliveryType | undefined = rawShippingType
        ? rawShippingType.includes('stop') || rawShippingType.includes('مكتب')
          ? 'stop'
          : 'home'
        : undefined;
      const shippingCost = parseNum(r.shippingCost ?? r.shippingFee ?? r['مبلغ التوصيل']);
      const productPrice = parseNum(r.productPrice ?? r.subtotal ?? r['مبلغ البضاعة']);
      const discount = parseNum(r.discount ?? r['الخصم']);
      const totalRaw = parseNum(r.total ?? r.totalPrice ?? r['المجموع الكلي']);
      const parsedTotal = totalRaw || Math.max(0, shippingCost + productPrice - discount);
      const orderStatus = String(
        r.orderStatus ?? r.status ?? r['الحالة'] ?? ''
      ).trim();

      rows.push({
        orderId,
        fullName,
        phone,
        wilaya,
        commune: String(r.commune ?? r['البلدية'] ?? '').trim(),
        deliveryType: parsedDeliveryType,
        orderName,
        orderStatus,
        status: mapSheetStatusToOrderStatus(orderStatus),
        shippingCost,
        productPrice,
        discount,
        total: parsedTotal,
        trackingCode: String(
          r.trackingCode ?? r.tracking ?? r['رمز التوصيل'] ?? ''
        ).trim(),
        createdAt: r.createdAt || r.date || r['التاريخ'] ? String(r.createdAt || r.date || r['التاريخ']).trim() : undefined,
        sheetUpdatedAt: r.sheetUpdatedAt ? String(r.sheetUpdatedAt).trim() : undefined
      });
    });

    knownSheetOrderIdsByUrl.set(cleanUrl, seenIds);
    return { ok: true, rows };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      ok: false,
      rows: [],
      error: isAbort
        ? 'انتهت مهلة الاتصال بـ Google Sheet — يرجى المحاولة مرة أخرى'
        : 'تعذر الاتصال بـ Google Sheet حالياً'
    };
  }
}

export async function fetchAllOrdersFromGoogleSheet(
  webhookUrl: string | undefined
): Promise<SheetOrderRow[] | null> {
  const res = await fetchAllOrdersFromGoogleSheetDetailed(webhookUrl);
  return res.ok ? res.rows : null;
}

export function normalizeWhatsAppNumber(raw?: string): string {
  const digits = (raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('213')) return digits;
  if (digits.startsWith('0')) return '213' + digits.slice(1);
  return digits;
}

export const DEFAULT_WHATSAPP_CONFIRM_TEMPLATE =
  `السلام عليكم {customerName}،\n` +
  `وصلتنا طلبيتك رقم {orderNumber} من متجر {storeName}.\n` +
  `المنتج: {bundle}\n` +
  `طريقة التوصيل: {deliveryType}\n` +
  `تكلفة التوصيل: {shippingCost}\n` +
  `المبلغ الإجمالي: {total} (الدفع عند الاستلام)\n` +
  `العنوان: {wilaya} - {commune}\n` +
  `أؤكد طلبيتي لإرسالها.`;

export const DEFAULT_WHATSAPP_SHIPPING_TEMPLATE =
  `مرحباً {customerName}،\n` +
  `طلبيتك رقم {orderNumber} من متجر {storeName} خرجت مع شركة التوصيل وفي الطريق إليك.\n` +
  `المنتج: {bundle}\n` +
  `رمز التتبع لدى شركة التوصيل: {trackingCode}\n` +
  `المبلغ المطلوب عند الاستلام: {total}\n` +
  `شكراً على ثقتك بنا.`;

export const ABANDONED_STAGE_LABELS: Record<AbandonedOrderStatus, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  recovered: 'تم الاسترجاع',
  dismissed: 'مستبعد'
};

export const DEFAULT_WHATSAPP_ABANDONED_TEMPLATE =
  `السلام عليكم {customerName}،\n` +
  `لاحظنا أنك بدأت بتسجيل طلبك من متجر {storeName} ولم تكمل التأكيد.\n` +
  `المنتج: {product}\n` +
  `العرض: {offer}\n` +
  `المبلغ الإجمالي: {total} (الدفع عند الاستلام)\n` +
  `إذا واجهتك أي مشكلة أو أردت منا تأكيد الطلب لك مباشرة، أجبنا هنا فقط وسنجهز لك الطرد بكل سرور.`;

export function buildAbandonedReminderWhatsAppUrl(
  customerPhone: string | undefined,
  storeName: string,
  abandoned: {
    customerName?: string;
    landingPageTitle?: string;
    bundleLabel?: string;
    variantLabel?: string;
    wilayaName?: string;
    commune?: string;
    deliveryType?: DeliveryType;
    total?: number;
  },
  customTemplate?: string
): string {
  const num = normalizeWhatsAppNumber(customerPhone);
  if (!num) return '';

  const cleanName = String(abandoned.customerName || '').trim();
  const productText = String(abandoned.landingPageTitle || '').trim();
  const offerText = [abandoned.bundleLabel, abandoned.variantLabel]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' • ');
  const totalText = abandoned.total && abandoned.total > 0 ? formatPlainDZD(abandoned.total) : '';
  const wilayaText = [abandoned.wilayaName, abandoned.commune]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' - ');

  let text = String(customTemplate?.trim() || DEFAULT_WHATSAPP_ABANDONED_TEMPLATE);
  const vars: Record<string, string> = {
    customerName: cleanName,
    storeName: storeName || 'المتجر',
    product: productText || offerText || 'المنتج المختار',
    offer: offerText,
    bundle: offerText || productText,
    total: totalText,
    wilaya: wilayaText,
    commune: String(abandoned.commune || '').trim()
  };

  Object.entries(vars).forEach(([k, v]) => {
    text = text.split(`{${k}}`).join(v);
  });

  // Gracefully tidy greeting & empty lines when optional fields (name/offer/total) are blank
  text = text
    .replace(/السلام عليكم\s+،/g, 'السلام عليكم،')
    .replace(/مرحباً\s+،/g, 'مرحباً،')
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!offerText && t.startsWith('العرض:') && t.replace('العرض:', '').trim() === '') return false;
      if (!totalText && t.startsWith('المبلغ الإجمالي:') && t.includes('(الدفع عند الاستلام)') && t.replace('المبلغ الإجمالي:', '').replace('(الدفع عند الاستلام)', '').trim() === '') return false;
      return true;
    })
    .join('\n')
    .trim();

  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export interface SheetAbandonedRow {
  sessionId: string;
  customerName: string;
  customerPhone: string;
  wilayaName: string;
  commune: string;
  deliveryType: DeliveryType;
  productLabel: string;
  total: number;
  status: AbandonedOrderStatus;
  createdAt?: string;
  updatedAt?: string;
}

export function mapSheetAbandonedStatus(raw?: string): AbandonedOrderStatus {
  const t = String(raw || '').trim().toLowerCase();
  if (t.includes('استرج') || t.includes('مؤكد') || t.includes('recover')) return 'recovered';
  if (t.includes('تواصل') || t.includes('contact')) return 'contacted';
  if (t.includes('مستبع') || t.includes('ملغ') || t.includes('dismiss')) return 'dismissed';
  return 'new';
}

export async function sendAbandonedOrderToGoogleSheet(
  webhookUrl: string | undefined,
  payload: {
    sessionId: string;
    fullName?: string;
    phone: string;
    wilaya?: string;
    commune?: string;
    deliveryType: DeliveryType;
    productDetails: string;
    totalPrice: number;
    statusLabel?: string;
  }
): Promise<void> {
  const cleanUrl = webhookUrl?.trim();
  const cleanSession = String(payload.sessionId || '').trim();
  const phoneCheck = validateAlgerianPhone(payload.phone);
  if (!cleanUrl || !cleanSession || !phoneCheck.valid) return;

  try {
    // Safety guard: ONLY send abandoned actions to Apps Script v4+ so older scripts
    // never fall through and append an abandoned lead into the main Orders sheet!
    const { scriptVersion } = await ensureSheetScriptCapabilities(cleanUrl);
    if (scriptVersion < 4) return;

    const formData = new URLSearchParams();
    formData.append('action', 'abandoned_upsert');
    formData.append('sessionId', cleanSession);
    formData.append('fullName', String(payload.fullName || '').trim());
    formData.append('phone', phoneCheck.normalized);
    formData.append('wilaya', String(payload.wilaya || '').trim());
    formData.append('commune', String(payload.commune || '').trim());
    formData.append(
      'shippingType',
      payload.deliveryType === 'stop' ? 'مكتب الشحن Stop Desk' : 'توصيل للمنزل'
    );
    formData.append('order', String(payload.productDetails || '').trim());
    formData.append('totalPrice', String(Math.round(payload.totalPrice || 0)));
    formData.append('status', payload.statusLabel || 'جديد');

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
  } catch (err) {
    console.warn('Google Sheet abandoned upsert failed (non-blocking):', err);
  }
}

export async function updateAbandonedStatusInGoogleSheet(
  webhookUrl: string | undefined,
  sessionId: string,
  statusLabel: string
): Promise<void> {
  const cleanUrl = webhookUrl?.trim();
  const cleanSession = String(sessionId || '').trim();
  if (!cleanUrl || !cleanSession) return;

  try {
    const { scriptVersion } = await ensureSheetScriptCapabilities(cleanUrl);
    if (scriptVersion < 4) return;

    const formData = new URLSearchParams();
    formData.append('action', 'abandoned_status');
    formData.append('sessionId', cleanSession);
    formData.append('status', statusLabel);

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
  } catch (err) {
    console.warn('Google Sheet abandoned status update failed (non-blocking):', err);
  }
}

export async function deleteAbandonedOrderInGoogleSheet(
  webhookUrl: string | undefined,
  sessionId: string
): Promise<void> {
  const cleanUrl = webhookUrl?.trim();
  const cleanSession = String(sessionId || '').trim();
  if (!cleanUrl || !cleanSession) return;

  try {
    const { scriptVersion } = await ensureSheetScriptCapabilities(cleanUrl);
    if (scriptVersion < 4) return;

    const formData = new URLSearchParams();
    formData.append('action', 'abandoned_delete');
    formData.append('sessionId', cleanSession);

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
  } catch (err) {
    console.warn('Google Sheet abandoned delete failed (non-blocking):', err);
  }
}

export async function fetchAbandonedOrdersFromGoogleSheet(
  webhookUrl: string | undefined
): Promise<{ ok: boolean; rows: SheetAbandonedRow[]; scriptVersion: number; error?: string }> {
  const cleanUrl = webhookUrl?.trim();
  if (!cleanUrl || typeof fetch === 'undefined') {
    return { ok: false, rows: [], scriptVersion: 0, error: 'رابط Google Sheet غير محدد' };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 16000);
    const res = await fetch('/api/integrations/google-sheet-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: cleanUrl, action: 'list_abandoned' }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, rows: [], scriptVersion: 0, error: `تعذر الاتصال بخادم المزامنة (HTTP ${res.status})` };
    }
    const payload = await res.json();
    const data = payload?.data;
    const ver = Number(data?.scriptVersion || 0);
    if (Number.isFinite(ver) && ver > 0) {
      sheetScriptVersionByUrl.set(cleanUrl, ver);
    }
    if (!payload?.ok || !data || !Array.isArray(data.abandoned)) {
      return {
        ok: false,
        rows: [],
        scriptVersion: Number.isFinite(ver) ? ver : 0,
        error: 'يلزم تحديث كود Google Sheet إلى النسخة الجديدة (الإصدار 4) لتفعيل ورقة الطلبات المتروكة'
      };
    }

    const rows: SheetAbandonedRow[] = [];
    data.abandoned.forEach((r: any, idx: number) => {
      if (!r || typeof r !== 'object') return;
      const phoneCheck = validateAlgerianPhone(String(r.phone || r.customerPhone || ''));
      if (!phoneCheck.valid) return;
      const rawShip = String(r.shippingType || r.deliveryType || '').toLowerCase();
      rows.push({
        sessionId: String(r.sessionId || '').trim() || `GS-AB-${idx + 2}`,
        customerName: String(r.fullName || r.customerName || '').trim(),
        customerPhone: phoneCheck.normalized,
        wilayaName: String(r.wilaya || r.wilayaName || '').trim(),
        commune: String(r.commune || '').trim(),
        deliveryType: rawShip.includes('stop') || rawShip.includes('مكتب') ? 'stop' : 'home',
        productLabel: String(r.orderName || r.product || r.order || '').trim(),
        total: Math.max(0, parseFloat(String(r.total || '0').replace(/[^\d.]/g, '')) || 0),
        status: mapSheetAbandonedStatus(r.status),
        createdAt: r.createdAt ? String(r.createdAt).trim() : undefined,
        updatedAt: r.updatedAt ? String(r.updatedAt).trim() : undefined
      });
    });

    return { ok: true, rows, scriptVersion: Number.isFinite(ver) ? ver : 4 };
  } catch (err: any) {
    return {
      ok: false,
      rows: [],
      scriptVersion: 0,
      error: err?.name === 'AbortError' ? 'انتهت مهلة الاتصال بـ Google Sheet' : 'تعذر الاتصال بـ Google Sheet'
    };
  }
}

export function renderWhatsAppTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  let text = String(template || '');
  const map: Record<string, string> = {
    customerName: String(vars.customerName ?? ''),
    orderNumber: String(vars.orderNumber ?? ''),
    storeName: String(vars.storeName ?? ''),
    bundle: String(vars.bundle ?? ''),
    deliveryType: String(vars.deliveryType ?? ''),
    shippingCost: String(vars.shippingCost ?? ''),
    total: String(vars.total ?? ''),
    wilaya: String(vars.wilaya ?? ''),
    commune: String(vars.commune ?? ''),
    trackingCode: String(vars.trackingCode ?? ''),
    storePhone: String(vars.storePhone ?? '')
  };

  Object.entries(map).forEach(([k, v]) => {
    text = text.split(`{${k}}`).join(v);
  });

  // Clean up empty optional lines like "رمز التتبع: \n" when trackingCode is empty
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!map.trackingCode && (t.startsWith('رمز التتبع') && t.endsWith(':'))) return false;
      if (!map.storePhone && (t.startsWith('لأي استفسار') && t.endsWith(':'))) return false;
      return true;
    })
    .join('\n')
    .replace(/\s+-\s*\n/g, '\n')
    .trim();
}

export function buildOrderConfirmationWhatsAppUrl(
  rawWhatsapp: string | undefined,
  storeName: string,
  params: {
    orderNumber: string;
    customerName: string;
    bundleDetails: string;
    deliveryType: DeliveryType;
    shippingCost: number;
    total: number;
    wilayaName: string;
    commune: string;
  },
  customTemplate?: string
): string {
  const phone = normalizeWhatsAppNumber(rawWhatsapp);
  const deliveryLabel = params.deliveryType === 'home' ? 'توصيل للمنزل' : 'مكتب الشحن Stop Desk';
  const displayPhone = phone.startsWith('213') ? '0' + phone.slice(3) : phone;
  const msg = customTemplate?.trim()
    ? renderWhatsAppTemplate(customTemplate, {
        customerName: params.customerName,
        orderNumber: params.orderNumber,
        storeName,
        bundle: params.bundleDetails,
        deliveryType: deliveryLabel,
        shippingCost: formatPlainDZD(params.shippingCost),
        total: formatPlainDZD(params.total),
        wilaya: params.wilayaName,
        commune: params.commune,
        storePhone: displayPhone
      })
    : renderWhatsAppTemplate(DEFAULT_WHATSAPP_CONFIRM_TEMPLATE, {
        customerName: params.customerName,
        orderNumber: params.orderNumber,
        storeName,
        bundle: params.bundleDetails,
        deliveryType: deliveryLabel,
        shippingCost: formatPlainDZD(params.shippingCost),
        total: formatPlainDZD(params.total),
        wilaya: params.wilayaName,
        commune: params.commune,
        storePhone: displayPhone
      }) + (displayPhone ? `\nلأي استفسار: ${displayPhone}` : '');

  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildOrderTrackingWhatsAppUrl(
  rawWhatsapp: string | undefined,
  storeName: string,
  params: {
    orderNumber: string;
    customerName: string;
    bundleDetails: string;
    total: number;
    status: OrderStatus;
    trackingCode?: string;
  },
  customShippingTemplate?: string
): string {
  const phone = normalizeWhatsAppNumber(rawWhatsapp);
  let msg = '';
  if (params.status === 'shipping') {
    const tpl = customShippingTemplate?.trim() || DEFAULT_WHATSAPP_SHIPPING_TEMPLATE;
    msg = renderWhatsAppTemplate(tpl, {
      customerName: params.customerName || 'الزبون الكريم',
      orderNumber: params.orderNumber,
      storeName,
      bundle: params.bundleDetails,
      trackingCode: params.trackingCode || '',
      total: formatPlainDZD(params.total)
    });
  } else {
    msg = `مرحباً ${storeName}، أود الاستفسار ومتابعة حالة طلبي رقم ${params.orderNumber}.`;
  }
  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export const ORDER_STAGE_LABELS: Record<OrderStatus, string> = {
  new: 'قيد التأكيد',
  confirmed: 'التأكيد',
  shipping: 'في شركة التوصيل',
  delivered: 'التسليم',
  cancelled: 'ملغي'
};

export const COURIER_PROVIDER_INFO: Record<
  CourierProvider,
  { name: string; subtitle: string; requiresApiId: boolean; defaultBaseUrl: string }
> = {
  none: { name: 'بدون ربط آلي (يدوي)', subtitle: 'إدخال رمز التتبع يدوياً', requiresApiId: false, defaultBaseUrl: '' },
  ecotrack: { name: 'Ecotrack / 48Hr', subtitle: '48Hr Express · DHD · Ecotrack', requiresApiId: false, defaultBaseUrl: 'https://48hr.ecotrack.dz' },
  yalidine: { name: 'Yalidine ياليدين', subtitle: 'API v1 الرسمي', requiresApiId: true, defaultBaseUrl: 'https://api.yalidine.app/v1' },
  zrexpress: { name: 'ZR Express', subtitle: 'Procolis API v1', requiresApiId: true, defaultBaseUrl: 'https://procolis.com/api_v1' },
  guepex: { name: 'Guepex جيبكس', subtitle: 'Guepex API v1', requiresApiId: true, defaultBaseUrl: 'https://api.guepex.app/v1' },
  maystro: { name: 'Maystro Delivery', subtitle: 'Maystro Stores API', requiresApiId: false, defaultBaseUrl: 'https://backend.maystro-delivery.com/api/stores' },
  procolis: { name: 'Procolis بروكوليس', subtitle: 'Procolis API v1', requiresApiId: true, defaultBaseUrl: 'https://procolis.com/api_v1' }
};

export async function testCourierApi(config: StoreApiConfig): Promise<{
  ok: boolean;
  message: string;
  latencyMs?: number;
}> {
  try {
    const res = await fetch('/api/integrations/test-courier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: config.storeId, config })
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, message: err?.message || 'تعذر الاتصال بخادم التطبيق' };
  }
}

export async function createCourierParcel(
  order: Order,
  config: StoreApiConfig
): Promise<{
  ok: boolean;
  trackingCode?: string;
  labelUrl?: string;
  provider?: string;
  message: string;
  latencyMs?: number;
}> {
  try {
    const res = await fetch('/api/courier/create-parcel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: config.storeId, config, order })
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, message: err?.message || 'تعذر الاتصال بخادم التطبيق' };
  }
}

export async function trackCourierParcel(
  trackingCode: string,
  config: StoreApiConfig
): Promise<{
  ok: boolean;
  courierStatus?: string;
  mappedStatus?: OrderStatus;
  labelUrl?: string;
  message: string;
  latencyMs?: number;
}> {
  try {
    const res = await fetch('/api/courier/track-parcel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: config.storeId, config, trackingCode })
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, message: err?.message || 'تعذر سحب حالة الطرد' };
  }
}

export async function testGoogleSheetApi(webhookUrl: string): Promise<{
  ok: boolean;
  message: string;
  rowCount?: number;
  latencyMs?: number;
}> {
  try {
    const res = await fetch('/api/integrations/test-google-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl })
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, message: err?.message || 'تعذر فحص رابط Google Sheet' };
  }
}

export async function testTrackingServerEvent(
  target: 'meta' | 'tiktok',
  config: StoreApiConfig
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  try {
    const res = await fetch('/api/integrations/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: config.storeId,
        config,
        target,
        isTest: true,
        eventName: 'Purchase',
        value: 3500,
        contentName: 'Test Integration Event',
        orderNumber: 'DZ-TEST-' + Math.floor(1000 + Math.random() * 9000),
        customerPhone: '0550000000',
        customerName: 'Test Customer',
        wilayaName: 'الجزائر العاصمة',
        pageUrl: typeof window !== 'undefined' ? window.location.href : ''
      })
    });
    const data = await res.json();
    const entry = data?.results?.[target];
    return entry || { ok: false, message: 'لم تصل استجابة من السيرفر' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'تعذر اختبار حدث التتبع' };
  }
}

export async function sendWhatsAppViaApi(
  params: {
    storeId: string;
    phone?: string;
    message: string;
    orderNumber?: string;
    customerName?: string;
    status?: string;
    trackingCode?: string;
    total?: number;
    isTest?: boolean;
  },
  config?: StoreApiConfig
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  try {
    const res = await fetch('/api/integrations/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, config })
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, message: err?.message || 'تعذر استدعاء واجهة واتساب' };
  }
}

export function buildAutoOrderTextMessage(
  storeName: string,
  order: {
    orderNumber: string;
    customerName: string;
    bundleLabel?: string;
    total: number;
    wilayaName: string;
    commune?: string;
    deliveryType?: DeliveryType;
    shippingFee?: number;
    trackingCode?: string;
  },
  kind: 'confirm' | 'shipping',
  customTemplate?: string
): string {
  const bundle = order.bundleLabel || 'المنتج';
  const deliveryLabel = order.deliveryType === 'stop' ? 'مكتب الشحن Stop Desk' : 'توصيل للمنزل';
  if (customTemplate?.trim()) {
    return renderWhatsAppTemplate(customTemplate, {
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      storeName,
      bundle,
      deliveryType: deliveryLabel,
      shippingCost: formatPlainDZD(order.shippingFee || 0),
      total: formatPlainDZD(order.total),
      wilaya: order.wilayaName,
      commune: order.commune || '',
      trackingCode: order.trackingCode || ''
    });
  }
  if (kind === 'shipping') {
    return (
      `مرحباً ${order.customerName}،\n` +
      `طلبيتك رقم ${order.orderNumber} من متجر ${storeName} خرجت مع شركة التوصيل وفي الطريق إليك.\n` +
      `المنتج: ${bundle}\n` +
      (order.trackingCode ? `رمز التتبع: ${order.trackingCode}\n` : '') +
      `المبلغ عند الاستلام: ${formatPlainDZD(order.total)}\n` +
      `شكراً لثقتك بنا.`
    );
  }
  return (
    `السلام عليكم ${order.customerName}،\n` +
    `تم استلام وتأكيد طلبك رقم ${order.orderNumber} من متجر ${storeName}.\n` +
    `الطلب: ${bundle}\n` +
    `العنوان: ${order.wilayaName}${order.commune ? ' - ' + order.commune : ''}\n` +
    `المبلغ عند الاستلام: ${formatPlainDZD(order.total)}\n` +
    `سنخبرك فور خروج الطرد للتوصيل.`
  );
}

export function triggerAutoOrderWhatsApp(params: {
  storeId: string;
  storeName: string;
  phone: string;
  orderNumber: string;
  customerName: string;
  bundleDetails: string;
  total: number;
  wilayaName: string;
  commune: string;
}): void {
  if (!params.storeId || typeof fetch === 'undefined') return;
  void fetch('/api/integrations/order-whatsapp-hook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  }).catch(() => {});
}

export function triggerMerchantOrderAlert(params: {
  storeId: string;
  storeName: string;
  eventType: 'new_order' | 'payment_received' | 'abandoned_order';
  dedupeKey?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  wilayaName?: string;
  commune?: string;
  deliveryType?: 'home' | 'stop';
  bundleDetails?: string;
  total?: number;
  paymentMethod?: 'cod' | 'chargily' | 'baridimob';
  paymentStatus?: string;
  paymentReference?: string;
}): void {
  if (!params.storeId || typeof fetch === 'undefined') return;
  void fetch('/api/integrations/merchant-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  }).catch(() => {});
}

export async function testMerchantAlertChannel(params: {
  storeId: string;
  storeName: string;
  channel: 'telegram' | 'whatsapp' | 'sms';
  config: StoreApiConfig;
}): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  try {
    const res = await fetch('/api/integrations/test-merchant-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      return { ok: false, message: 'تعذر قراءة استجابة الخادم' };
    }
    return {
      ok: Boolean(data.ok),
      message: String(data.message || (data.ok ? 'تم الإرسال بنجاح' : 'تعذر الإرسال')),
      latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined
    };
  } catch {
    return { ok: false, message: 'تعذر الاتصال بالخادم لاختبار التنبيه' };
  }
}

export interface StoreAppsScriptOptions {
  name?: string;
  phone?: string;
  defaultWhatsapp?: string;
  customDomain?: string;
  subdomain?: string;
}

function formatSupportPhoneForAppsScript(rawPhone?: string): string {
  const digits = String(rawPhone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  let dzLocal = '';
  if (digits.startsWith('00213') && digits.length >= 14) dzLocal = digits.slice(5, 14);
  else if (digits.startsWith('213') && digits.length >= 12) dzLocal = digits.slice(3, 12);
  else if (digits.startsWith('0') && digits.length === 10 && ['5', '6', '7'].includes(digits[1])) {
    dzLocal = digits.slice(1);
  } else if (digits.length === 9 && ['5', '6', '7'].includes(digits[0])) {
    dzLocal = digits;
  }
  if (dzLocal.length === 9) {
    return `+213 ${dzLocal.slice(0, 3)} ${dzLocal.slice(3, 5)} ${dzLocal.slice(5, 7)} ${dzLocal.slice(7, 9)}`;
  }
  if (digits.length >= 8) {
    return `+${digits}`;
  }
  return String(rawPhone || '').trim();
}

function resolveStoreTrackingUrlForAppsScript(
  store?: StoreAppsScriptOptions,
  fallbackOrigin?: string
): string {
  const normalizedDomain = normalizeDomainHost(store?.customDomain || '');
  if (normalizedDomain && isValidCustomDomain(normalizedDomain)) {
    return `https://${normalizedDomain}/`;
  }
  const cleanOrigin = String(fallbackOrigin || '').trim().replace(/\/+$/, '');
  const cleanSubdomain = String(store?.subdomain || '').trim();
  if (cleanOrigin) {
    if (cleanSubdomain && cleanSubdomain !== 'bright-dz') {
      return `${cleanOrigin}/?store=${encodeURIComponent(cleanSubdomain)}`;
    }
    return `${cleanOrigin}/`;
  }
  return 'https://brightdz.vercel.app/';
}

export function buildGoogleAppsScriptForStore(
  store?: StoreAppsScriptOptions,
  fallbackOrigin?: string
): string {
  const storeName = String(store?.name || '').trim() || 'متجرنا';
  const supportPhone = formatSupportPhoneForAppsScript(store?.defaultWhatsapp || store?.phone || '');
  const trackingUrl = resolveStoreTrackingUrlForAppsScript(store, fallbackOrigin);

  return `var SCRIPT_VERSION = 4;
var ABANDONED_SHEET_NAME = "الطلبات المتروكة";
var STORE_NAME = ${JSON.stringify(storeName)};
var STORE_SUPPORT_PHONE = ${JSON.stringify(supportPhone)};
var STORE_TRACKING_URL = ${JSON.stringify(trackingUrl)};

function normalizeDzPhone(raw) {
  var digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.indexOf("00213") === 0 && digits.length >= 13) digits = "0" + digits.slice(5);
  else if (digits.indexOf("213") === 0 && digits.length >= 11) digits = "0" + digits.slice(3);
  else if (digits.length === 9 && (digits[0] === "5" || digits[0] === "6" || digits[0] === "7")) digits = "0" + digits;
  return digits;
}

function isValidDzPhone(raw) {
  var p = normalizeDzPhone(raw);
  if (!/^0[567][0-9]{8}$/.test(p)) return false;
  var sub = p.slice(2);
  if (/^([0-9])\\1{7}$/.test(sub)) return false;
  if (/([0-9])\\1{5,}/.test(sub)) return false;
  if (/^([0-9]{2})\\1{3}$/.test(sub)) return false;
  if ("01234567890".indexOf(sub) !== -1 || "98765432109".indexOf(sub) !== -1) return false;
  return true;
}

function getOrCreateAbandonedSheet(ss) {
  var abSheet = ss.getSheetByName(ABANDONED_SHEET_NAME);
  if (!abSheet) {
    abSheet = ss.insertSheet(ABANDONED_SHEET_NAME);
  }
  if (abSheet.getLastRow() === 0) {
    abSheet.appendRow([
      "التاريخ", "معرّف الجلسة", "الاسم الكامل", "الهاتف", "الولاية", "البلدية",
      "طريقة التوصيل", "المنتج / العرض", "المبلغ الإجمالي", "الحالة",
      "تذكير عبر واتساب", "آخر تحديث"
    ]);
  }
  return abSheet;
}

function generateAbandonedWhatsAppFormula(phone, fullName, productText, totalPrice) {
  var formatted = normalizeDzPhone(phone);
  if (formatted.indexOf("0") === 0) formatted = "213" + formatted.substring(1);
  var greeting = fullName ? ("السلام عليكم " + fullName + "،") : "السلام عليكم،";
  var msg = greeting + "\\n" +
            "لاحظنا أنك بدأت بتسجيل طلبك من متجر " + STORE_NAME + " ولم تكمل التأكيد.\\n" +
            (productText ? ("المنتج: " + productText + "\\n") : "") +
            (totalPrice > 0 ? ("المبلغ الإجمالي: " + totalPrice + " دج (الدفع عند الاستلام)\\n") : "") +
            "إذا واجهتك أي مشكلة أو أردت منا تأكيد الطلب لك مباشرة، أجبنا هنا فقط وسنجهز لك الطرد بكل سرور.";
  var url = "https://wa.me/" + formatted + "?text=" + encodeURIComponent(msg);
  return '=HYPERLINK("' + url + '", "💬 تذكير عبر واتساب")';
}

function doPost(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "message": "No parameters provided"})).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = String(e.parameter.action || "create").trim().toLowerCase();

  // --- مسارات ورقة الطلبات المتروكة المنفصلة ---
  if (action === "abandoned_upsert") {
    var sessionId = String(e.parameter.sessionId || "").trim();
    var abPhone = normalizeDzPhone(e.parameter.phone || "");
    if (!sessionId || !isValidDzPhone(abPhone)) {
      return ContentService.createTextOutput(JSON.stringify({"result": "rejected_invalid"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var abSheet = getOrCreateAbandonedSheet(ss);
    var abFullName = String(e.parameter.fullName || "").trim();
    var abWilaya = String(e.parameter.wilaya || "").trim();
    var abCommune = String(e.parameter.commune || "").trim();
    var abShip = String(e.parameter.shippingType || "").trim();
    var abOrder = String(e.parameter.order || "").trim();
    var abTotal = parseFloat(e.parameter.totalPrice) || 0;
    var abStatus = String(e.parameter.status || "جديد").trim();
    var nowIso = new Date().toISOString();
    var waFormula = generateAbandonedWhatsAppFormula(abPhone, abFullName, abOrder, abTotal);

    var abRows = abSheet.getDataRange().getValues();
    for (var a = 1; a < abRows.length; a++) {
      if (String(abRows[a][1] || "").trim() === sessionId) {
        var rIdx = a + 1;
        if (abFullName) abSheet.getRange(rIdx, 3).setValue(abFullName);
        abSheet.getRange(rIdx, 4).setValue(abPhone);
        if (abWilaya) abSheet.getRange(rIdx, 5).setValue(abWilaya);
        if (abCommune) abSheet.getRange(rIdx, 6).setValue(abCommune);
        if (abShip) abSheet.getRange(rIdx, 7).setValue(abShip);
        if (abOrder) abSheet.getRange(rIdx, 8).setValue(abOrder);
        if (abTotal > 0) abSheet.getRange(rIdx, 9).setValue(abTotal);
        abSheet.getRange(rIdx, 11).setValue(waFormula);
        abSheet.getRange(rIdx, 12).setValue(nowIso);
        return ContentService.createTextOutput(JSON.stringify({"result": "abandoned_updated"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    abSheet.appendRow([
      new Date(),
      sessionId,
      abFullName,
      abPhone,
      abWilaya,
      abCommune,
      abShip,
      abOrder,
      abTotal,
      abStatus,
      waFormula,
      nowIso
    ]);
    return ContentService.createTextOutput(JSON.stringify({"result": "abandoned_created"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "abandoned_status") {
    var stSessionId = String(e.parameter.sessionId || "").trim();
    var stVal = String(e.parameter.status || "").trim();
    if (!stSessionId) {
      return ContentService.createTextOutput(JSON.stringify({"result": "invalid_session"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var stSheet = ss.getSheetByName(ABANDONED_SHEET_NAME);
    if (stSheet) {
      var stRows = stSheet.getDataRange().getValues();
      for (var s = 1; s < stRows.length; s++) {
        if (String(stRows[s][1] || "").trim() === stSessionId) {
          if (stVal) stSheet.getRange(s + 1, 10).setValue(stVal);
          stSheet.getRange(s + 1, 12).setValue(new Date().toISOString());
          return ContentService.createTextOutput(JSON.stringify({"result": "abandoned_status_updated"}))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({"result": "not_found"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "abandoned_delete") {
    var delSessionId = String(e.parameter.sessionId || "").trim();
    if (!delSessionId) {
      return ContentService.createTextOutput(JSON.stringify({"result": "invalid_session"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var rmSheet = ss.getSheetByName(ABANDONED_SHEET_NAME);
    var removedAny = false;
    if (rmSheet) {
      var rmRows = rmSheet.getDataRange().getValues();
      for (var m = rmRows.length - 1; m >= 1; m--) {
        if (String(rmRows[m][1] || "").trim() === delSessionId) {
          rmSheet.deleteRow(m + 1);
          removedAny = true;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({"result": removedAny ? "abandoned_deleted" : "not_found"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = ss.getSheetByName("Orders") || ss.getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "التاريخ", "رقم الطلب", "الاسم الكامل", "الهاتف", "الولاية", "البلدية",
      "طريقة التوصيل", "المنتج", "الحالة", "مبلغ التوصيل", "مبلغ البضاعة",
      "الخصم", "سبب الخصم", "المجموع الكلي", "رمز التوصيل",
      "تأكيد عبر واتساب", "شحن عبر واتساب", "رابط التتبع", "آخر تعديل من الشيت"
    ]);
  }

  var orderId = String(e.parameter.orderId || "").replace(/^#/, "").trim();

  // 1. حذف صف عند حذف الطلب من لوحة المتجر
  if (action === "delete") {
    if (!orderId) {
      return ContentService.createTextOutput(JSON.stringify({"result": "invalid_order_id"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var delRows = sheet.getDataRange().getValues();
    var deletedAny = false;
    for (var d = delRows.length - 1; d >= 1; d--) {
      var delOrderId = String(delRows[d][1] || "").replace(/^#/, "").trim().toLowerCase();
      if (delOrderId === orderId.toLowerCase()) {
        sheet.deleteRow(d + 1);
        deletedAny = true;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({"result": deletedAny ? "deleted" : "not_found"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. تحديث صف موجود عند التعديل من لوحة المتجر أو صفحة الهبوط
  if (action === "update") {
    if (!orderId) {
      return ContentService.createTextOutput(JSON.stringify({"result": "invalid_order_id"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var existingOrderId = String(rows[i][1] || "").replace(/^#/, "").trim().toLowerCase();
      if (existingOrderId === orderId.toLowerCase()) {
        var rowNum = i + 1;
        if (e.parameter.wilaya !== undefined) sheet.getRange(rowNum, 5).setValue(e.parameter.wilaya);
        if (e.parameter.commune !== undefined) sheet.getRange(rowNum, 6).setValue(e.parameter.commune);
        if (e.parameter.shippingType !== undefined) sheet.getRange(rowNum, 7).setValue(e.parameter.shippingType);
        if (e.parameter.order !== undefined) sheet.getRange(rowNum, 8).setValue(e.parameter.order);
        if (e.parameter.status !== undefined && e.parameter.status !== "") sheet.getRange(rowNum, 9).setValue(e.parameter.status);
        if (e.parameter.shippingCost !== undefined) sheet.getRange(rowNum, 10).setValue(parseFloat(e.parameter.shippingCost) || 0);
        if (e.parameter.productPrice !== undefined) sheet.getRange(rowNum, 11).setValue(parseFloat(e.parameter.productPrice) || 0);
        if (e.parameter.trackingCode !== undefined) sheet.getRange(rowNum, 15).setValue(e.parameter.trackingCode);

        // مسح علامة التعديل اليدوي من الشيت لأن التحديث قادم من المتجر
        sheet.getRange(rowNum, 19).setValue("");
        SpreadsheetApp.flush();

        var uFullName = sheet.getRange(rowNum, 3).getValue();
        var uPhone = sheet.getRange(rowNum, 4).getValue();
        var uWilaya = sheet.getRange(rowNum, 5).getValue();
        var uCommune = sheet.getRange(rowNum, 6).getValue();
        var uShippingType = sheet.getRange(rowNum, 7).getValue();
        var uOrder = sheet.getRange(rowNum, 8).getValue();
        var uStatus = sheet.getRange(rowNum, 9).getValue();
        var uShippingCost = parseFloat(sheet.getRange(rowNum, 10).getValue()) || 0;
        var uProductPrice = parseFloat(sheet.getRange(rowNum, 11).getValue()) || 0;
        var uDiscount = parseFloat(sheet.getRange(rowNum, 12).getValue()) || 0;
        var uTrackingCode = sheet.getRange(rowNum, 15).getValue();

        var uFormattedPhone = normalizeDzPhone(uPhone);
        if (uFormattedPhone.indexOf("0") === 0) {
          uFormattedPhone = "213" + uFormattedPhone.substring(1);
        }

        var uFormulas = generateWhatsAppFormulas(
          uFormattedPhone, uFullName, uOrder, uWilaya, uCommune, uShippingType,
          uShippingCost, uProductPrice, uDiscount, orderId, uStatus, uTrackingCode
        );
        sheet.getRange(rowNum, 16).setValue(uFormulas.confirmFormula);
        sheet.getRange(rowNum, 17).setValue(uFormulas.shippingFormula);
        sheet.getRange(rowNum, 18).setValue(uFormulas.trackingFormula);

        return ContentService.createTextOutput(JSON.stringify({"result": "updated"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({"result": "not_found"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // رفض أي إجراء غير معروف لمنع إضافة صفوف فارغة
  if (action !== "create") {
    return ContentService.createTextOutput(JSON.stringify({"result": "ignored"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. التحقق الصارم قبل إضافة طلب جديد (منع الطلبات الوهمية أو الفارغة)
  var fullName = String(e.parameter.fullName || "").replace(/\\s+/g, " ").trim();
  var phone = normalizeDzPhone(e.parameter.phone || "");
  var wilaya = String(e.parameter.wilaya || "").trim();
  var commune = String(e.parameter.commune || "").trim();
  var shippingType = String(e.parameter.shippingType || "").trim();
  var order = String(e.parameter.order || "").trim();
  var status = String(e.parameter.status || "قيد التأكيد").trim();
  var nameLetters = fullName.replace(/[^\\u0621-\\u064A\\u0671-\\u06D3a-zA-Z]/g, "");

  if (!orderId || nameLetters.length < 2 || !isValidDzPhone(phone) || (!wilaya && !order)) {
    return ContentService.createTextOutput(JSON.stringify({"result": "rejected_invalid_or_empty"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // منع تكرار نفس رقم الطلب مرتين في الجدول
  var existingRows = sheet.getDataRange().getValues();
  for (var k = 1; k < existingRows.length; k++) {
    if (String(existingRows[k][1] || "").replace(/^#/, "").trim().toLowerCase() === orderId.toLowerCase()) {
      return ContentService.createTextOutput(JSON.stringify({"result": "duplicate_ignored"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  var shippingCost = parseFloat(e.parameter.shippingCost) || 0;
  var productPrice = parseFloat(e.parameter.productPrice) || 0;
  var discount = parseFloat(e.parameter.discount) || 0;
  var discountReason = e.parameter.discountReason || "";
  var trackingCode = e.parameter.trackingCode || "";
  var date = new Date();
  var nextRow = sheet.getLastRow() + 1;

  var formattedPhone = phone;
  if (formattedPhone.indexOf("0") === 0) {
    formattedPhone = "213" + formattedPhone.substring(1);
  }

  var formulas = generateWhatsAppFormulas(
    formattedPhone, fullName, order, wilaya, commune, shippingType,
    shippingCost, productPrice, discount, orderId, status, trackingCode
  );

  sheet.appendRow([
    date,
    orderId,
    fullName,
    phone,
    wilaya,
    commune,
    shippingType,
    order,
    status,
    shippingCost,
    productPrice,
    discount,
    discountReason,
    "=J" + nextRow + "+K" + nextRow + "-L" + nextRow,
    trackingCode,
    formulas.confirmFormula,
    formulas.shippingFormula,
    formulas.trackingFormula,
    ""
  ]);

  return ContentService.createTextOutput(JSON.stringify({"result": "success"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== "Orders") return;

  var row = e.range.getRow();
  var col = e.range.getColumn();

  if (row <= 1) return;

  if (col >= 2 && col <= 15) {
    var wilaya = sheet.getRange(row, 5).getValue();
    var commune = sheet.getRange(row, 6).getValue();
    var shippingType = sheet.getRange(row, 7).getValue();
    var order = sheet.getRange(row, 8).getValue();
    var status = sheet.getRange(row, 9).getValue();
    var shippingCost = parseFloat(sheet.getRange(row, 10).getValue()) || 0;
    var productPrice = parseFloat(sheet.getRange(row, 11).getValue()) || 0;
    var discount = parseFloat(sheet.getRange(row, 12).getValue()) || 0;
    var trackingCode = sheet.getRange(row, 15).getValue();

    var phone = sheet.getRange(row, 4).getValue();
    var fullName = sheet.getRange(row, 3).getValue();
    var orderId = sheet.getRange(row, 2).getValue();

    var formattedPhone = normalizeDzPhone(phone);
    if (formattedPhone.indexOf("0") === 0) {
      formattedPhone = "213" + formattedPhone.substring(1);
    }

    var formulas = generateWhatsAppFormulas(
      formattedPhone, fullName, order, wilaya, commune, shippingType,
      shippingCost, productPrice, discount, orderId, status, trackingCode
    );

    sheet.getRange(row, 16).setValue(formulas.confirmFormula);
    sheet.getRange(row, 17).setValue(formulas.shippingFormula);
    sheet.getRange(row, 18).setValue(formulas.trackingFormula);
    sheet.getRange(row, 19).setValue(new Date().toISOString());
  }
}

function generateWhatsAppFormulas(phone, fullName, order, wilaya, commune, shippingType, shippingCost, productPrice, discount, orderId, status, trackingCode) {
  var totalCalculated = (shippingCost + productPrice) - discount;

  var confirmMsg = "السلام عليكم " + fullName + "،\\n" +
                   "وصلتنا طلبيتك من متجر " + STORE_NAME + ".\\n" +
                   "المنتج: " + order + "\\n" +
                   (discount > 0 ? "المبلغ الأصلي: " + (shippingCost + productPrice) + " دج\\nخصم خاص: -" + discount + " دج\\n" : "") +
                   "المبلغ الإجمالي: " + totalCalculated + " دج (الدفع عند الاستلام)\\n" +
                   "التوصيل: " + (shippingType ? shippingType : "توصيل") + (wilaya ? " إلى " + wilaya : "") + (commune ? " (" + commune + ")" : "") + "\\n\\n" +
                   "باش نبعثوها، أكّد الطلب بالرد على هذه الرسالة (اكتب: تأكيد).\\n" +
                   (STORE_SUPPORT_PHONE ? ("لأي سؤال، كلّمنا على WhatsApp في الرقم " + STORE_SUPPORT_PHONE + ".\\n") : "") +
                   "شكراً على ثقتك.";
  var confirmUrl = "https://wa.me/" + phone + "?text=" + encodeURIComponent(confirmMsg);
  var confirmFormula = '=HYPERLINK("' + confirmUrl + '", "💬 اضغط للتأكيد")';

  var shippingMsg = "مرحباً الزبون الكريم " + fullName + "،\\n\\n" +
                    "نود إعلامك أن طلبيتك رقم (" + orderId + ") الخاصة بـ (" + order + ") حالتها الآن: *" + (status || "في شركة التوصيل") + "*.\\n\\n" +
                    (trackingCode ? "رمز التوصيل الخاص بك لدى شركة الشحن هو: *" + trackingCode + "*\\n\\n" : "") +
                    "سيتصل بك عامل التوصيل قريباً لتسليمك الطلبية، فضلاً حضّر المبلغ " + totalCalculated + " دج للدفع عند الاستلام.\\n\\n" +
                    "شكراً لتسوقك معنا في متجر " + STORE_NAME + "! 🌍";
  var shippingUrl = "https://wa.me/" + phone + "?text=" + encodeURIComponent(shippingMsg);
  var shippingFormula = '=HYPERLINK("' + shippingUrl + '", "📦 اضغط لإرسال رمز الشحن")';

  var trackingSiteUrl = STORE_TRACKING_URL;
  var trackingMsg = "مرحباً " + fullName + " 👋\\n\\n" +
                    "يمكنك متابعة حالة طلبيتك رقم (" + orderId + ") بشكل مباشر عبر زيارة صفحة التتبع في متجرنا:\\n" +
                    trackingSiteUrl + "\\n\\n" +
                    "رقم الطلب الخاص بك: *" + orderId + "*\\n" +
                    "شكراً لتسوقك مع " + STORE_NAME + "! 🌍";
  var trackingUrl = "https://wa.me/" + phone + "?text=" + encodeURIComponent(trackingMsg);
  var trackingFormula = '=HYPERLINK("' + trackingUrl + '", "🔍 رابط تتبع الطلب")';

  return {
    confirmFormula: confirmFormula,
    shippingFormula: shippingFormula,
    trackingFormula: trackingFormula
  };
}

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "scriptVersion": SCRIPT_VERSION, "message": "No parameters"})).setMimeType(ContentService.MimeType.JSON);
  }

  var callback = e.parameter.callback;
  var action = String(e.parameter.action || "").trim().toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // إرجاع قائمة الطلبات المتروكة من الورقة المنفصلة
  if (action === "list_abandoned") {
    var abSheet = ss.getSheetByName(ABANDONED_SHEET_NAME);
    var abList = [];
    if (abSheet && abSheet.getLastRow() > 1) {
      var abData = abSheet.getDataRange().getValues();
      for (var q = 1; q < abData.length; q++) {
        var sId = String(abData[q][1] || "").trim();
        var sPhone = normalizeDzPhone(abData[q][3] || "");
        if (!isValidDzPhone(sPhone)) continue;
        abList.push({
          createdAt: abData[q][0] instanceof Date ? abData[q][0].toISOString() : String(abData[q][0] || ""),
          sessionId: sId || ("GS-AB-" + (q + 1)),
          fullName: String(abData[q][2] || "").trim(),
          phone: sPhone,
          wilaya: String(abData[q][4] || "").trim(),
          commune: String(abData[q][5] || "").trim(),
          shippingType: String(abData[q][6] || "").trim(),
          orderName: String(abData[q][7] || "").trim(),
          total: parseFloat(abData[q][8]) || 0,
          status: String(abData[q][9] || "جديد").trim(),
          updatedAt: abData[q][11] ? String(abData[q][11]) : ""
        });
      }
    }
    var abOut = JSON.stringify({ status: "success", scriptVersion: SCRIPT_VERSION, abandoned: abList });
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + abOut + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(abOut)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = ss.getSheetByName("Orders") || ss.getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // إرجاع جميع الطلبات للمزامنة التلقائية مع لوحة المتجر (مع تجاهل الصفوف الفارغة)
  if (action === "list") {
    var ordersList = [];
    for (var j = 1; j < data.length; j++) {
      var rowOrderId = String(data[j][1] || "").replace(/^#/, "").trim();
      var rowName = String(data[j][2] || "").trim();
      var rowPhone = String(data[j][3] || "").trim();
      var rowWilaya = String(data[j][4] || "").trim();
      var rowOrderName = String(data[j][7] || "").trim();
      if (!rowOrderId) continue;
      if ((!rowName && !rowPhone) || (!rowPhone && !rowWilaya && !rowOrderName)) continue;

      ordersList.push({
        createdAt: data[j][0] instanceof Date ? data[j][0].toISOString() : String(data[j][0] || ""),
        orderId: rowOrderId,
        fullName: rowName,
        phone: rowPhone,
        wilaya: rowWilaya,
        commune: String(data[j][5] || ""),
        shippingType: String(data[j][6] || ""),
        orderName: rowOrderName,
        orderStatus: String(data[j][8] || "قيد التأكيد"),
        shippingCost: parseFloat(data[j][9]) || 0,
        productPrice: parseFloat(data[j][10]) || 0,
        discount: parseFloat(data[j][11]) || 0,
        total: data[j][13],
        trackingCode: String(data[j][14] || ""),
        sheetUpdatedAt: data[j][18] ? String(data[j][18]) : ""
      });
    }
    var listOutput = JSON.stringify({ status: "success", scriptVersion: SCRIPT_VERSION, orders: ordersList });
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + listOutput + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(listOutput)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // البحث عن طلب واحد لصفحة تتبع الزبون
  var searchOrderId = String(e.parameter.orderId || e.parameter.id || "").replace(/^#/, "").trim().toLowerCase();
  var result = {
    status: "not_found",
    scriptVersion: SCRIPT_VERSION,
    orderStatus: "قيد التأكيد",
    orderName: "",
    wilaya: "",
    commune: "",
    shippingType: "",
    total: "",
    fullName: "",
    trackingCode: "",
    sheetUpdatedAt: ""
  };

  if (searchOrderId !== "") {
    for (var i = 1; i < data.length; i++) {
      var cellOrderId = String(data[i][1] || "").replace(/^#/, "").trim().toLowerCase();
      if (cellOrderId === searchOrderId) {
        var calculatedTotal = data[i][13];
        var totalText = (calculatedTotal !== "" && calculatedTotal !== null && calculatedTotal !== undefined) ? (calculatedTotal + " دج") : "";

        result = {
          status: "success",
          scriptVersion: SCRIPT_VERSION,
          orderId: String(data[i][1] || "").replace(/^#/, "").trim(),
          fullName: data[i][2] || "",
          wilaya: data[i][4] || "",
          commune: data[i][5] || "",
          shippingType: data[i][6] || "",
          orderName: data[i][7] || "",
          orderStatus: data[i][8] || "قيد التأكيد",
          total: totalText,
          trackingCode: data[i][14] || "",
          sheetUpdatedAt: data[i][18] ? String(data[i][18]) : ""
        };
        break;
      }
    }
  }

  var jsonOutput = JSON.stringify(result);

  if (callback) {
    return ContentService.createTextOutput(callback + "(" + jsonOutput + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(jsonOutput)
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = buildGoogleAppsScriptForStore(
  {
    name: 'Bright DZ',
    phone: '+213 798 35 31 65',
    subdomain: 'bright-dz'
  },
  'https://brightdz.vercel.app'
);

export function normalizePhoneCanonical(raw?: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  let clean = digits;
  if (clean.startsWith('00213')) clean = '0' + clean.slice(5);
  else if (clean.startsWith('213') && clean.length >= 11) clean = '0' + clean.slice(3);
  else if (clean.length === 9 && (clean.startsWith('5') || clean.startsWith('6') || clean.startsWith('7'))) {
    clean = '0' + clean;
  }
  return clean;
}

function escapeCsvCell(val: unknown, preserveNewlines = false): string {
  const raw = String(val ?? '');
  const str = preserveNewlines ? raw.replace(/\r\n/g, '\n') : raw.replace(/\r?\n/g, ' ');
  return `"${str.replace(/"/g, '""')}"`;
}

function escapeHtmlCell(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerFileDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const COURIER_EXPORT_HEADERS = [
  'reference commande',
  'nom et prenom du destinataire*',
  'telephone*',
  'telephone 2',
  'code wilaya*',
  'wilaya de livraison',
  'commune de livraison*',
  'adresse de livraison*',
  'produit*',
  'poids (kg)',
  'montant du colis*',
  'remarque',
  'FRAGILE\n( si oui mettez OUI sinon laissez vide )',
  'ECHANGE\n( si oui mettez OUI sinon laissez vide )',
  'PICK UP\n( si oui mettez OUI sinon laissez vide )',
  'RECOUVREMENT\n( si oui mettez OUI sinon laissez vide )',
  'STOP DESK\n( si oui mettez OUI sinon laissez vide )',
  'Lien map'
] as const;

function buildCourierExportRow(o: Order): Array<string | number> {
  const wilayaMeta = getWilayaById(o.wilayaId);
  const numericWilayaCode = parseInt(String(o.wilayaId || ''), 10);
  const resolved = resolveOfficialEcotrackCommune(
    Number.isFinite(numericWilayaCode) ? numericWilayaCode : 16,
    o.commune
  );
  const codeWilaya = String(resolved.wilayaCode);
  const wilayaLabel = (
    wilayaMeta?.nameFr ||
    ECOTRACK_WILAYA_HUB[resolved.wilayaCode] ||
    o.wilayaName ||
    ''
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const communeLabel = resolved.commune;
  const addressLabel =
    (o.address || '').trim() ||
    `${wilayaLabel}${communeLabel && communeLabel !== wilayaLabel ? ' - ' + communeLabel : ''}`;
  const productLabel = (o.bundleLabel || '').trim() || o.items.map(it => it.title).join(' + ');
  const baseNotes = (o.notes || '').trim();
  const originalCommune = (o.commune || '').trim();
  const notesWithCommune =
    !resolved.matched && originalCommune && !baseNotes.includes(originalCommune)
      ? [baseNotes, `بلدية الزبون: ${originalCommune}`].filter(Boolean).join(' | ')
      : baseNotes;

  return [
    o.orderNumber,
    o.customerName,
    normalizePhoneCanonical(o.customerPhone) || o.customerPhone,
    '',
    codeWilaya,
    wilayaLabel,
    communeLabel,
    addressLabel,
    productLabel,
    1,
    Math.round(o.total || 0),
    notesWithCommune,
    '',
    '',
    '',
    '',
    o.deliveryType === 'stop' ? 'OUI' : '',
    ''
  ];
}

export function exportOrdersToCourierCsv(orders: Order[], filenamePrefix = 'orders-courier'): void {
  const headerLine = COURIER_EXPORT_HEADERS.map(h => escapeCsvCell(h, true)).join(',');
  const dataLines = orders.map(o =>
    buildCourierExportRow(o)
      .map(cell => escapeCsvCell(cell, false))
      .join(',')
  );

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerFileDownload(blob, `${filenamePrefix}-${dateTag}.csv`);
}

export function exportOrdersToExcel(orders: Order[], _storeName = 'Store', filenamePrefix = 'orders-excel'): void {
  const headersHtml = COURIER_EXPORT_HEADERS.map(h => {
    const formatted = escapeHtmlCell(h).replace(/\n/g, '<br style="mso-data-placement:same-cell;" />');
    return `<th>${formatted}</th>`;
  }).join('');

  const textColIndexes = new Set([0, 2, 3, 4]);
  const rowsHtml = orders
    .map(o => {
      const cells = buildCourierExportRow(o)
        .map((val, idx) =>
          textColIndexes.has(idx)
            ? `<td style="mso-number-format:'\\@'">${escapeHtmlCell(val)}</td>`
            : `<td>${escapeHtmlCell(val)}</td>`
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html dir="ltr" lang="fr">
<head>
<meta charset="UTF-8" />
<style>
  table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
  th { background-color: #059669; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px; vertical-align: middle; text-align: center; }
  td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
</style>
</head>
<body>
  <table>
    <thead>
      <tr>${headersHtml}</tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerFileDownload(blob, `${filenamePrefix}-${dateTag}.xls`);
}
