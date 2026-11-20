import { CourierProvider, DeliveryType, Order, OrderStatus, StoreApiConfig } from '../types';
import { formatPlainDZD, getWilayaById } from '../data/wilayas';

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
  if (!cleanUrl) return;

  try {
    const formData = new URLSearchParams();
    formData.append('orderId', payload.orderId);
    formData.append('fullName', payload.fullName);
    formData.append('phone', payload.phone);
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
  if (!cleanUrl || !payload.orderId.trim()) return;

  try {
    const formData = new URLSearchParams();
    formData.append('action', 'update');
    formData.append('orderId', payload.orderId.trim());
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
  const cleanOrderId = orderId?.trim();
  if (!cleanUrl || !cleanOrderId) return;

  try {
    const formData = new URLSearchParams();
    formData.append('action', 'delete');
    formData.append('orderId', cleanOrderId);

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
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
      if (!rawId && !fullName && !phone) return;

      const orderId = rawId || `GS-ROW-${idx + 2}`;
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
        wilaya: String(r.wilaya ?? r.wilayaName ?? r['الولاية'] ?? '').trim(),
        commune: String(r.commune ?? r['البلدية'] ?? '').trim(),
        deliveryType: parsedDeliveryType,
        orderName: String(
          r.orderName ?? r.order ?? r.product ?? r.bundleLabel ?? r['المنتج'] ?? ''
        ).trim(),
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

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "error" })).setMimeType(ContentService.MimeType.JSON);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Orders") || ss.getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["التاريخ", "رقم الطلب", "الاسم الكامل", "الهاتف", "الولاية", "البلدية", "طريقة التوصيل", "المنتج", "الحالة", "مبلغ التوصيل", "مبلغ البضاعة", "الخصم", "سبب الخصم", "المجموع الكلي", "رمز التوصيل", "تأكيد عبر واتساب", "شحن عبر واتساب", "رابط التتبع", "آخر تحديث"]);
  }

  var action = String(e.parameter.action || "create").trim();
  var orderId = String(e.parameter.orderId || "").replace(/^#/, "").trim();

  if (action === "delete" && orderId) {
    var delData = sheet.getDataRange().getValues();
    for (var d = delData.length - 1; d >= 1; d--) {
      if (String(delData[d][1] || "").replace(/^#/, "").trim().toUpperCase() === orderId.toUpperCase()) {
        sheet.deleteRow(d + 1);
        return ContentService.createTextOutput(JSON.stringify({ "result": "deleted" })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ "result": "not_found" })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "update" && orderId) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1] || "").replace(/^#/, "").trim().toUpperCase() === orderId.toUpperCase()) {
        var r = i + 1;
        if (e.parameter.wilaya) sheet.getRange(r, 5).setValue(e.parameter.wilaya);
        if (e.parameter.commune !== undefined) sheet.getRange(r, 6).setValue(e.parameter.commune);
        if (e.parameter.shippingType) sheet.getRange(r, 7).setValue(e.parameter.shippingType);
        if (e.parameter.order) sheet.getRange(r, 8).setValue(e.parameter.order);
        if (e.parameter.status) sheet.getRange(r, 9).setValue(e.parameter.status);
        if (e.parameter.shippingCost !== undefined) sheet.getRange(r, 10).setValue(parseFloat(e.parameter.shippingCost) || 0);
        if (e.parameter.productPrice !== undefined) sheet.getRange(r, 11).setValue(parseFloat(e.parameter.productPrice) || 0);
        if (e.parameter.trackingCode !== undefined) sheet.getRange(r, 15).setValue(e.parameter.trackingCode);
        sheet.getRange(r, 19).setValue(new Date().toISOString());
        return ContentService.createTextOutput(JSON.stringify({ "result": "updated" })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  var nextRow = sheet.getLastRow() + 1;
  var shippingCost = parseFloat(e.parameter.shippingCost) || 0;
  var productPrice = parseFloat(e.parameter.productPrice) || 0;
  var discount = parseFloat(e.parameter.discount) || 0;
  var nowIso = new Date().toISOString();

  sheet.appendRow([
    new Date(),
    orderId,
    e.parameter.fullName || "",
    e.parameter.phone || "",
    e.parameter.wilaya || "",
    e.parameter.commune || "",
    e.parameter.shippingType || "",
    e.parameter.order || "",
    e.parameter.status || "قيد التأكيد",
    shippingCost,
    productPrice,
    discount,
    e.parameter.discountReason || "",
    "=J" + nextRow + "+K" + nextRow + "-L" + nextRow,
    e.parameter.trackingCode || "",
    "",
    "",
    "",
    nowIso
  ]);

  return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Orders") || ss.getActiveSheet();
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : "";
  var orderId = (e && e.parameter && e.parameter.orderId) ? String(e.parameter.orderId).replace(/^#/, "").trim().toUpperCase() : "";
  var callback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback).trim() : "";
  var rows = sheet.getDataRange().getValues();
  var result = { status: "error" };

  if (action === "list") {
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      var id = String(rows[i][1] || "").replace(/^#/, "").trim();
      var name = String(rows[i][2] || "").trim();
      var phone = String(rows[i][3] || "").trim();
      if (!id && !name && !phone) continue;
      list.push({
        createdAt: rows[i][0] instanceof Date ? rows[i][0].toISOString() : String(rows[i][0] || ""),
        orderId: id || ("GS-ROW-" + (i + 1)),
        fullName: name,
        phone: phone,
        wilaya: rows[i][4] || "",
        commune: rows[i][5] || "",
        shippingType: rows[i][6] || "",
        orderName: rows[i][7] || "",
        orderStatus: rows[i][8] || "قيد التأكيد",
        shippingCost: Number(rows[i][9]) || 0,
        productPrice: Number(rows[i][10]) || 0,
        discount: Number(rows[i][11]) || 0,
        total: rows[i][13] || "",
        trackingCode: rows[i][14] || "",
        sheetUpdatedAt: rows[i][18] || ""
      });
    }
    result = { status: "success", orders: list };
  } else if (orderId) {
    for (var j = 1; j < rows.length; j++) {
      if (String(rows[j][1] || "").replace(/^#/, "").trim().toUpperCase() === orderId) {
        result = {
          status: "success",
          orderId: String(rows[j][1]).replace(/^#/, "").trim(),
          fullName: rows[j][2] || "",
          wilaya: rows[j][4] || "",
          commune: rows[j][5] || "",
          shippingType: rows[j][6] || "",
          orderName: rows[j][7] || "",
          orderStatus: rows[j][8] || "قيد التأكيد",
          total: rows[j][13] || "",
          trackingCode: rows[j][14] || "",
          sheetUpdatedAt: rows[j][18] || ""
        };
        break;
      }
    }
  }

  var out = JSON.stringify(result);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + out + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.source.getActiveSheet();
  var row = e.range.getRow();
  if (row > 1 && e.range.getColumn() < 19) {
    sheet.getRange(row, 19).setValue(new Date().toISOString());
  }
}`;

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
  const codeWilaya = Number.isFinite(numericWilayaCode) ? String(numericWilayaCode) : String(o.wilayaId || '');
  const wilayaLabel = wilayaMeta?.nameFr || o.wilayaName || '';
  const communeLabel = (o.commune || '').trim() || wilayaLabel;
  const addressLabel =
    (o.address || '').trim() ||
    `${wilayaLabel}${communeLabel && communeLabel !== wilayaLabel ? ' - ' + communeLabel : ''}`;
  const productLabel = (o.bundleLabel || '').trim() || o.items.map(it => it.title).join(' + ');

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
    (o.notes || '').trim(),
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
