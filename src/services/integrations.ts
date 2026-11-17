import { DeliveryType, OrderStatus } from '../types';
import { formatDZD } from '../data/wilayas';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

const initializedPixels = new Set<string>();

export function trackMetaPixelPage(
  pixelId: string | undefined,
  contentName: string,
  category: string,
  value: number
): void {
  const cleanId = pixelId?.trim();
  if (!cleanId || typeof window === 'undefined' || typeof document === 'undefined') return;

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
      window.fbq('track', 'ViewContent', {
        content_name: contentName,
        content_category: category,
        value,
        currency: 'DZD'
      });
    }
  } catch {
    // Never break storefront UX if ad blockers block Facebook Pixel
  }
}

export function trackMetaPixelPurchase(
  pixelId: string | undefined,
  contentName: string,
  value: number,
  orderNumber: string
): void {
  const cleanId = pixelId?.trim();
  if (!cleanId || typeof window === 'undefined' || !window.fbq) return;
  try {
    window.fbq('track', 'Purchase', {
      content_name: contentName,
      value,
      currency: 'DZD',
      order_id: orderNumber
    });
  } catch {
    // Ignore pixel blocking errors
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

