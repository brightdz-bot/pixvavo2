import { CourierProvider, DeliveryType, Order, OrderStatus, StoreApiConfig } from '../types';
import { formatDZD } from '../data/wilayas';

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

export function generateTrackingEventId(prefix = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    tiktokPixelId?: string;
  }
): void {
  const cleanId = pixelId?.trim();
  const eventId = generateTrackingEventId('view');

  if (options?.tiktokPixelId) {
    trackTikTokPixelPage(options.tiktokPixelId, contentName, value, eventId);
  }

  if (cleanId && typeof window !== 'undefined' && typeof document !== 'undefined') {
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
          const s = b.getElementsByTagName(e)[0];
          if (s && s.parentNode) {
            s.parentNode.insertBefore(t, s);
          } else {
            b.head.appendChild(t);
          }
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      }

      if (window.fbq) {
        if (!initializedPixels.has(cleanId)) {
          window.fbq('init', cleanId);
          initializedPixels.add(cleanId);
        }
        window.fbq('track', 'PageView');
        window.fbq(
          'track',
          'ViewContent',
          {
            content_name: contentName,
            content_category: category,
            value,
            currency: 'DZD'
          },
          { eventID: eventId }
        );
      }
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
        eventName: 'ViewContent',
        eventId,
        value,
        contentName,
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
    tiktokPixelId?: string;
    customerPhone?: string;
    customerName?: string;
    wilayaName?: string;
  }
): void {
  const cleanId = pixelId?.trim();
  const eventId = `purchase_${orderNumber}`;

  if (cleanId && typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq(
        'track',
        'Purchase',
        {
          content_name: contentName,
          value,
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
          value,
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
        eventName: 'Purchase',
        eventId,
        orderNumber,
        value,
        contentName,
        customerPhone: options.customerPhone,
        customerName: options.customerName,
        wilayaName: options.wilayaName,
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
      payload.deliveryType === 'home' ? 'توصيل للمنزل 🏠' : 'مكتب الشحن Stop Desk 🏢'
    );
    formData.append('order', payload.orderDetails);
    formData.append('status', payload.statusLabel);
    formData.append('shippingCost', String(payload.shippingCost));
    formData.append('productPrice', String(payload.productPrice));
    formData.append('discount', String(payload.discount || 0));
    formData.append('discountReason', payload.discountReason || '');
    formData.append('totalPrice', formatDZD(payload.totalPrice));
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
        payload.deliveryType === 'home' ? 'توصيل للمنزل 🏠' : 'مكتب الشحن Stop Desk 🏢'
      );
    }
    if (payload.orderDetails !== undefined) formData.append('order', payload.orderDetails);
    if (payload.statusLabel !== undefined) formData.append('status', payload.statusLabel);
    if (payload.shippingCost !== undefined) formData.append('shippingCost', String(payload.shippingCost));
    if (payload.productPrice !== undefined) formData.append('productPrice', String(payload.productPrice));
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
  if (!cleanUrl || !cleanId || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise(resolve => {
    let settled = false;
    const cbName = '__dzSheetCb_' + Math.random().toString(36).slice(2, 10);
    const script = document.createElement('script');

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {
        (window as any)[cbName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }, 5500);

    (window as any)[cbName] = (data: any) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();

      if (!data || data.status !== 'success') {
        resolve(null);
        return;
      }

      const rawTotal = String(data.total || '').replace(/[^\d.]/g, '');
      const parsedTotal = parseFloat(rawTotal) || 0;
      const fullName = String(data.fullName || '').trim();
      const rawShippingType = String(data.shippingType || data.deliveryType || '').trim().toLowerCase();
      const parsedDeliveryType: DeliveryType | undefined = rawShippingType
        ? rawShippingType.includes('stop') || rawShippingType.includes('مكتب')
          ? 'stop'
          : 'home'
        : undefined;

      resolve({
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
      });
    };

    try {
      const targetUrl = new URL(cleanUrl);
      targetUrl.searchParams.set('orderId', cleanId);
      targetUrl.searchParams.set('callback', cbName);
      script.src = targetUrl.toString();
      script.async = true;
      script.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      };
      document.head.appendChild(script);
    } catch {
      window.clearTimeout(timer);
      cleanup();
      resolve(null);
    }
  });
}

export async function fetchAllOrdersFromGoogleSheet(
  webhookUrl: string | undefined
): Promise<SheetOrderRow[] | null> {
  const cleanUrl = webhookUrl?.trim();
  if (!cleanUrl || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise(resolve => {
    let settled = false;
    const cbName = '__dzSheetListCb_' + Math.random().toString(36).slice(2, 10);
    const script = document.createElement('script');

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {
        (window as any)[cbName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }, 6500);

    (window as any)[cbName] = (data: any) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();

      if (!data || data.status !== 'success' || !Array.isArray(data.orders)) {
        resolve(null);
        return;
      }

      const rows: SheetOrderRow[] = data.orders
        .filter((r: any) => r && String(r.orderId || '').trim())
        .map((r: any) => {
          const rawShippingType = String(r.shippingType || r.deliveryType || '').trim().toLowerCase();
          const parsedDeliveryType: DeliveryType | undefined = rawShippingType
            ? rawShippingType.includes('stop') || rawShippingType.includes('مكتب')
              ? 'stop'
              : 'home'
            : undefined;
          const shippingCost = Number(r.shippingCost) || 0;
          const productPrice = Number(r.productPrice) || 0;
          const discount = Number(r.discount) || 0;
          const rawTotal = String(r.total ?? '').replace(/[^\d.]/g, '');
          const parsedTotal = parseFloat(rawTotal) || Math.max(0, shippingCost + productPrice - discount);

          return {
            orderId: String(r.orderId).trim(),
            fullName: String(r.fullName || '').trim(),
            phone: normalizeSheetPhone(r.phone),
            wilaya: String(r.wilaya || '').trim(),
            commune: String(r.commune || '').trim(),
            deliveryType: parsedDeliveryType,
            orderName: String(r.orderName || '').trim(),
            orderStatus: String(r.orderStatus || '').trim(),
            status: mapSheetStatusToOrderStatus(r.orderStatus),
            shippingCost,
            productPrice,
            discount,
            total: parsedTotal,
            trackingCode: String(r.trackingCode || '').trim(),
            sheetUpdatedAt: r.sheetUpdatedAt ? String(r.sheetUpdatedAt).trim() : undefined
          };
        });

      resolve(rows);
    };

    try {
      const targetUrl = new URL(cleanUrl);
      targetUrl.searchParams.set('action', 'list');
      targetUrl.searchParams.set('callback', cbName);
      script.src = targetUrl.toString();
      script.async = true;
      script.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      };
      document.head.appendChild(script);
    } catch {
      window.clearTimeout(timer);
      cleanup();
      resolve(null);
    }
  });
}

export function normalizeWhatsAppNumber(raw?: string): string {
  const digits = (raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('213')) return digits;
  if (digits.startsWith('0')) return '213' + digits.slice(1);
  return digits;
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
  }
): string {
  const phone = normalizeWhatsAppNumber(rawWhatsapp);
  const deliveryLabel = params.deliveryType === 'home' ? 'توصيل للمنزل' : 'مكتب الشحن Stop Desk';
  const displayPhone = phone.startsWith('213') ? '0' + phone.slice(3) : phone;
  const msg =
    `السلام ${params.customerName}،\n` +
    `وصلتنا طلبيتك رقم ${params.orderNumber} من متجر ${storeName}.\n` +
    `المنتج: ${params.bundleDetails}\n` +
    `طريقة التوصيل: ${deliveryLabel}\n` +
    `تكلفة التوصيل: ${formatDZD(params.shippingCost)}\n` +
    `المبلغ الإجمالي: ${formatDZD(params.total)} (الدفع عند الاستلام)\n` +
    `العنوان: ${params.wilayaName}${params.commune ? ' - ' + params.commune : ''}\n` +
    `أؤكد طلبيتي لإرسالها.` +
    (displayPhone ? `\nلأي استفسار: ${displayPhone}` : '');

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
  }
): string {
  const phone = normalizeWhatsAppNumber(rawWhatsapp);
  let msg = '';
  if (params.status === 'shipping') {
    msg =
      `مرحباً ${params.customerName || 'الزبون الكريم'}،\n` +
      `طلبيتك رقم ${params.orderNumber} من ${storeName} خرجت مع شركة التوصيل وفي الطريق إليك.\n` +
      `المنتج: ${params.bundleDetails}\n` +
      (params.trackingCode ? `رمز التتبع لدى شركة التوصيل: ${params.trackingCode}\n` : '') +
      `المبلغ المطلوب عند الاستلام: ${formatDZD(params.total)}\n` +
      `شكراً على ثقتك.`;
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
    trackingCode?: string;
  },
  kind: 'confirm' | 'shipping'
): string {
  const bundle = order.bundleLabel || 'المنتج';
  if (kind === 'shipping') {
    return (
      `مرحباً ${order.customerName}،\n` +
      `طلبيتك رقم ${order.orderNumber} من متجر ${storeName} خرجت مع شركة التوصيل وفي الطريق إليك.\n` +
      `المنتج: ${bundle}\n` +
      (order.trackingCode ? `رمز التتبع: ${order.trackingCode}\n` : '') +
      `المبلغ عند الاستلام: ${formatDZD(order.total)}\n` +
      `شكراً لثقتك بنا.`
    );
  }
  return (
    `السلام عليكم ${order.customerName}،\n` +
    `تم استلام وتأكيد طلبك رقم ${order.orderNumber} من متجر ${storeName}.\n` +
    `الطلب: ${bundle}\n` +
    `العنوان: ${order.wilayaName}${order.commune ? ' - ' + order.commune : ''}\n` +
    `المبلغ عند الاستلام: ${formatDZD(order.total)}\n` +
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
  var orderId = String(e.parameter.orderId || "").trim();

  if (action === "update" && orderId) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toUpperCase() === orderId.toUpperCase()) {
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
  var orderId = (e && e.parameter && e.parameter.orderId) ? String(e.parameter.orderId).trim().toUpperCase() : "";
  var callback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback).trim() : "";
  var rows = sheet.getDataRange().getValues();
  var result = { status: "error" };

  if (action === "list") {
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      var id = String(rows[i][1] || "").trim();
      if (!id) continue;
      list.push({
        orderId: id,
        fullName: rows[i][2] || "",
        phone: rows[i][3] || "",
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
      if (String(rows[j][1] || "").trim().toUpperCase() === orderId) {
        result = {
          status: "success",
          orderId: String(rows[j][1]).trim(),
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
