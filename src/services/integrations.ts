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
    formData.append('totalPrice', formatDZD(payload.totalPrice));

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
  } catch (err) {
    console.warn('Google Sheet webhook request failed (non-blocking):', err);
  }
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
