import type { ServerStoreApiConfig } from './apiApp.ts';

export type MerchantAlertEventType =
  | 'new_order'
  | 'payment_received'
  | 'abandoned_order'
  | 'test';

export type MerchantAlertChannel = 'telegram' | 'whatsapp' | 'sms';

export interface MerchantAlertEventPayload {
  storeId: string;
  storeName?: string;
  eventType: MerchantAlertEventType;
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
}

export interface ChannelDispatchResult {
  channel: MerchantAlertChannel;
  ok: boolean;
  sent: number;
  failed: number;
  latencyMs: number;
  message: string;
}

export type StoreWhatsAppDispatcher = (
  cfg: ServerStoreApiConfig,
  payload: {
    phone?: string;
    message?: string;
    orderNumber?: string;
    customerName?: string;
    status?: string;
    total?: number;
    isTest?: boolean;
  }
) => Promise<{ ok: boolean; message: string; latencyMs: number }>;

const MAX_RECIPIENTS_PER_CHANNEL = 15;
const DEDUPE_TTL_MS = 30 * 60 * 1000;
const recentAlertDedupeMap = new Map<string, number>();

function pruneDedupeMap(now: number) {
  if (recentAlertDedupeMap.size < 400) return;
  for (const [k, ts] of recentAlertDedupeMap.entries()) {
    if (now - ts > DEDUPE_TTL_MS) {
      recentAlertDedupeMap.delete(k);
    }
  }
}

export function isDuplicateAlert(dedupeKey?: string): boolean {
  if (!dedupeKey) return false;
  const now = Date.now();
  pruneDedupeMap(now);
  const prev = recentAlertDedupeMap.get(dedupeKey);
  if (prev && now - prev < DEDUPE_TTL_MS) {
    return true;
  }
  recentAlertDedupeMap.set(dedupeKey, now);
  return false;
}

/**
 * Validates that a user-supplied webhook URL is an external http(s) endpoint
 * and blocks loopback, link-local, metadata, and private RFC1918 networks.
 */
export function isSafeExternalWebhookUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      !host ||
      host === 'localhost' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('169.254.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parseRecipientList(raw?: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of String(raw).split(/[\n,;]+/)) {
    const cleaned = part.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    items.push(cleaned);
    if (items.length >= MAX_RECIPIENTS_PER_CHANNEL) break;
  }
  return items;
}

export function normalizePhoneE164(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00213') && digits.length >= 14) return `+213${digits.slice(5, 14)}`;
  if (digits.startsWith('213') && digits.length >= 12) return `+213${digits.slice(3, 12)}`;
  if (digits.startsWith('0') && digits.length === 10 && ['5', '6', '7'].includes(digits[1])) {
    return `+213${digits.slice(1)}`;
  }
  if (digits.length === 9 && ['5', '6', '7'].includes(digits[0])) {
    return `+213${digits}`;
  }
  if (digits.startsWith('00') && digits.length >= 10) return `+${digits.slice(2)}`;
  return `+${digits}`;
}

export function normalizeWhatsAppDigits(raw: string): string {
  return normalizePhoneE164(raw).replace(/^\+/, '');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 9500
): Promise<{ ok: boolean; status: number; text: string; json: any; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      text,
      json,
      latencyMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

function formatPaymentMethodAr(method?: string): string {
  if (method === 'chargily') return 'البطاقة الذهبية / CIB';
  if (method === 'baridimob') return 'تحويل بريدي موب';
  return 'الدفع عند الاستلام';
}

function formatDzdPlain(amount?: number): string {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  return `${n.toLocaleString('en-US')} دج`;
}

export function buildMerchantAlertText(
  payload: MerchantAlertEventPayload,
  compact = false
): string {
  const storeTitle = (payload.storeName || 'متجرك').trim();
  const phone = (payload.customerPhone || '').trim();
  const waDigits = phone ? normalizeWhatsAppDigits(phone) : '';
  const deliveryLabel =
    payload.deliveryType === 'stop' ? 'مكتب التوصيل' : 'توصيل للمنزل';
  const location = [payload.wilayaName, payload.commune].filter(Boolean).join(' - ');

  if (payload.eventType === 'test') {
    const nowTime = new Date().toLocaleTimeString('ar-DZ', {
      hour: '2-digit',
      minute: '2-digit'
    });
    if (compact) {
      return `رسالة تجريبية من ${storeTitle} (${nowTime}): تنبيهات الطلبات مفعلة بنجاح.`;
    }
    return (
      `تنبيه تجريبي ناجح — ${storeTitle}\n` +
      `تم ربط هذه القناة بنجاح لاستقبال إشعارات الطلبات الجديدة ووصولات الدفع والطلبات المتروكة.\n` +
      `الوقت: ${nowTime}`
    );
  }

  if (payload.eventType === 'abandoned_order') {
    if (compact) {
      return (
        `طلب متروك (${storeTitle}): ${payload.customerName || 'زبون'} ${phone}` +
        `${location ? ' - ' + location : ''}` +
        `${payload.total ? ' | ' + formatDzdPlain(payload.total) : ''}`
      );
    }
    return [
      `طلبية متروكة جديدة — ${storeTitle}`,
      payload.customerName ? `الزبون: ${payload.customerName}` : null,
      phone ? `الهاتف: ${phone}` : null,
      location ? `الوجهة: ${location}` : null,
      payload.bundleDetails ? `المنتج: ${payload.bundleDetails}` : null,
      payload.total ? `القيمة التقديرية: ${formatDzdPlain(payload.total)}` : null,
      waDigits ? `تواصل عبر واتساب: https://wa.me/${waDigits}` : null
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (payload.eventType === 'payment_received') {
    const statusText =
      payload.paymentStatus === 'paid'
        ? 'تم تأكيد الدفع بنجاح'
        : 'تم إرفاق وصل تحويل بانتظار المراجعة';
    if (compact) {
      return (
        `دفع إلكتروني #${payload.orderNumber || ''} (${storeTitle}): ` +
        `${formatPaymentMethodAr(payload.paymentMethod)} - ${formatDzdPlain(payload.total)} - ${statusText}`
      );
    }
    return [
      `إشعار دفع إلكتروني — ${storeTitle}`,
      payload.orderNumber ? `رقم الطلب: #${payload.orderNumber}` : null,
      `الطريقة: ${formatPaymentMethodAr(payload.paymentMethod)}`,
      `الحالة: ${statusText}`,
      payload.total ? `المبلغ: ${formatDzdPlain(payload.total)}` : null,
      payload.paymentReference ? `المرجع: ${payload.paymentReference}` : null,
      payload.customerName ? `الزبون: ${payload.customerName}` : null,
      phone ? `الهاتف: ${phone}` : null
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Default: new_order
  if (compact) {
    return (
      `طلب جديد #${payload.orderNumber || ''} (${storeTitle}): ` +
      `${payload.customerName || ''} ${phone} | ` +
      `${location || ''} | ${formatDzdPlain(payload.total)}`
    );
  }
  return [
    `طلبية جديدة — ${storeTitle}`,
    payload.orderNumber ? `رقم الطلب: #${payload.orderNumber}` : null,
    payload.customerName ? `الزبون: ${payload.customerName}` : null,
    phone ? `الهاتف: ${phone}` : null,
    location ? `الوجهة: ${location} (${deliveryLabel})` : null,
    payload.bundleDetails ? `المنتج / العرض: ${payload.bundleDetails}` : null,
    `طريقة الدفع: ${formatPaymentMethodAr(payload.paymentMethod)}`,
    `المجموع الكلي: ${formatDzdPlain(payload.total)}`,
    waDigits ? `مراسلة الزبون: https://wa.me/${waDigits}` : null
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendTelegramAlerts(
  cfg: ServerStoreApiConfig,
  text: string
): Promise<ChannelDispatchResult> {
  const started = Date.now();
  const token = String(cfg.telegramBotToken || '').trim();
  const chatIds = parseRecipientList(cfg.telegramChatIds);

  if (!token) {
    return {
      channel: 'telegram',
      ok: false,
      sent: 0,
      failed: 1,
      latencyMs: 0,
      message: 'يرجى إدخال رمز بوت تيليغرام أولاً'
    };
  }
  if (chatIds.length === 0) {
    return {
      channel: 'telegram',
      ok: false,
      sent: 0,
      failed: 1,
      latencyMs: 0,
      message: 'يرجى إدخال معرف محادثة أو مجموعة تيليغرام واحد على الأقل'
    };
  }

  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const results = await Promise.allSettled(
    chatIds.map(async chatId => {
      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true
        })
      });
      if (!res.ok || res.json?.ok === false) {
        const desc = res.json?.description || `HTTP ${res.status}`;
        throw new Error(`${chatId}: ${desc}`);
      }
      return chatId;
    })
  );

  let sent = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') sent += 1;
    else errors.push(r.reason?.message || 'فشل الإرسال');
  }
  const failed = results.length - sent;
  const latencyMs = Date.now() - started;

  return {
    channel: 'telegram',
    ok: sent > 0 && failed === 0,
    sent,
    failed,
    latencyMs,
    message:
      failed === 0
        ? `تم إرسال تنبيه تيليغرام بنجاح إلى ${sent} مستلم`
        : sent > 0
          ? `تم الإرسال إلى ${sent} وفشل ${failed} (${errors[0]})`
          : `فشل إرسال تيليغرام: ${errors[0] || 'تحقق من رمز البوت ومعرف المحادثة'}`
  };
}

async function sendMerchantWhatsAppAlerts(
  cfg: ServerStoreApiConfig,
  text: string,
  payload: MerchantAlertEventPayload,
  storeWhatsAppDispatcher: StoreWhatsAppDispatcher
): Promise<ChannelDispatchResult> {
  const started = Date.now();
  const mode = cfg.merchantWhatsappMode || 'store_api';
  const recipients = parseRecipientList(cfg.merchantWhatsappRecipients);

  if (recipients.length === 0) {
    return {
      channel: 'whatsapp',
      ok: false,
      sent: 0,
      failed: 1,
      latencyMs: 0,
      message:
        mode === 'callmebot'
          ? 'يرجى إدخال رقم الهاتف ومفتاح التنبيه بصيغة 213XXXXXXXXX:APIKEY'
          : 'يرجى إدخال رقم واتساب واحد على الأقل لاستلام التنبيهات'
    };
  }

  if (mode === 'callmebot') {
    const results = await Promise.allSettled(
      recipients.map(async entry => {
        const [rawPhone, rawKey] = entry.split(/[:|]/).map(s => s.trim());
        const phone = normalizeWhatsAppDigits(rawPhone || '');
        if (!phone || !rawKey) {
          throw new Error('صيغة غير صحيحة — اكتب الرقم ثم نقطتين ثم المفتاح');
        }
        const url =
          `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
          `&text=${encodeURIComponent(text)}` +
          `&apikey=${encodeURIComponent(rawKey)}`;
        const res = await fetchWithTimeout(url, { method: 'GET' });
        if (!res.ok || /error|invalid|apikey/i.test(res.text)) {
          throw new Error(res.text.slice(0, 100) || `HTTP ${res.status}`);
        }
        return phone;
      })
    );

    let sent = 0;
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') sent += 1;
      else errors.push(r.reason?.message || 'فشل الإرسال');
    }
    const failed = results.length - sent;
    return {
      channel: 'whatsapp',
      ok: sent > 0 && failed === 0,
      sent,
      failed,
      latencyMs: Date.now() - started,
      message:
        failed === 0
          ? `تم إرسال تنبيه واتساب بنجاح إلى ${sent} رقم`
          : sent > 0
            ? `تم الإرسال إلى ${sent} وفشل ${failed} (${errors[0]})`
            : `فشل تنبيه واتساب: ${errors[0]}`
    };
  }

  // store_api mode — reuses configured Meta Cloud / Evolution / Webhook WhatsApp provider
  if (!cfg.whatsappProvider || cfg.whatsappProvider === 'none') {
    return {
      channel: 'whatsapp',
      ok: false,
      sent: 0,
      failed: recipients.length,
      latencyMs: 0,
      message:
        'يرجى تفعيل مزود واتساب في القسم 5 أعلاه أو اختيار وضع التنبيه الشخصي المجاني'
    };
  }

  const results = await Promise.allSettled(
    recipients.map(async rawPhone => {
      const res = await storeWhatsAppDispatcher(cfg, {
        phone: rawPhone,
        message: text,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        status: payload.eventType,
        total: payload.total,
        isTest: payload.eventType === 'test'
      });
      if (!res.ok) {
        throw new Error(`${rawPhone}: ${res.message}`);
      }
      return rawPhone;
    })
  );

  let sent = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') sent += 1;
    else errors.push(r.reason?.message || 'فشل الإرسال');
  }
  const failed = results.length - sent;
  return {
    channel: 'whatsapp',
    ok: sent > 0 && failed === 0,
    sent,
    failed,
    latencyMs: Date.now() - started,
    message:
      failed === 0
        ? `تم إرسال تنبيه واتساب بنجاح إلى ${sent} رقم`
        : sent > 0
          ? `تم الإرسال إلى ${sent} وفشل ${failed} (${errors[0]})`
          : `فشل تنبيه واتساب: ${errors[0]}`
  };
}

async function sendSmsAlerts(
  cfg: ServerStoreApiConfig,
  compactText: string,
  payload: MerchantAlertEventPayload
): Promise<ChannelDispatchResult> {
  const started = Date.now();
  const provider = cfg.smsProvider || 'twilio';
  const recipients = parseRecipientList(cfg.smsRecipients)
    .map(normalizePhoneE164)
    .filter(p => p.length >= 9);

  if (recipients.length === 0) {
    return {
      channel: 'sms',
      ok: false,
      sent: 0,
      failed: 1,
      latencyMs: 0,
      message: 'يرجى إدخال رقم هاتف واحد على الأقل لاستلام الرسائل القصيرة'
    };
  }

  if (provider === 'twilio') {
    const sid = String(cfg.smsAccountSid || '').trim();
    const token = String(cfg.smsAuthToken || '').trim();
    const from = String(cfg.smsFromNumber || '').trim();
    if (!sid || !token || !from) {
      return {
        channel: 'sms',
        ok: false,
        sent: 0,
        failed: recipients.length,
        latencyMs: 0,
        message: 'يرجى إكمال بيانات Twilio (معرف الحساب، رمز التوثيق، ورقم المرسل)'
      };
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const basicAuth = Buffer.from(`${sid}:${token}`).toString('base64');

    const results = await Promise.allSettled(
      recipients.map(async to => {
        const form = new URLSearchParams({ To: to, From: from, Body: compactText });
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: form.toString()
        });
        if (!res.ok) {
          throw new Error(res.json?.message || `HTTP ${res.status}`);
        }
        return to;
      })
    );

    let sent = 0;
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') sent += 1;
      else errors.push(r.reason?.message || 'فشل الإرسال');
    }
    const failed = results.length - sent;
    return {
      channel: 'sms',
      ok: sent > 0 && failed === 0,
      sent,
      failed,
      latencyMs: Date.now() - started,
      message:
        failed === 0
          ? `تم إرسال الرسالة القصيرة بنجاح إلى ${sent} رقم`
          : sent > 0
            ? `تم الإرسال إلى ${sent} وفشل ${failed} (${errors[0]})`
            : `فشل إرسال الرسالة القصيرة: ${errors[0]}`
    };
  }

  if (provider === 'vonage') {
    const apiKey = String(cfg.smsAccountSid || '').trim();
    const apiSecret = String(cfg.smsAuthToken || '').trim();
    const from = String(cfg.smsFromNumber || payload.storeName || 'BrightDZ').trim().slice(0, 11);
    if (!apiKey || !apiSecret) {
      return {
        channel: 'sms',
        ok: false,
        sent: 0,
        failed: recipients.length,
        latencyMs: 0,
        message: 'يرجى إدخال مفتاح وسر بوابة Vonage SMS'
      };
    }

    const results = await Promise.allSettled(
      recipients.map(async to => {
        const res = await fetchWithTimeout('https://rest.nexmo.com/sms/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            api_secret: apiSecret,
            from,
            to: to.replace(/^\+/, ''),
            text: compactText,
            type: 'unicode'
          })
        });
        const msgStatus = res.json?.messages?.[0]?.status;
        if (!res.ok || (msgStatus && msgStatus !== '0')) {
          throw new Error(res.json?.messages?.[0]?.['error-text'] || `HTTP ${res.status}`);
        }
        return to;
      })
    );

    let sent = 0;
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') sent += 1;
      else errors.push(r.reason?.message || 'فشل الإرسال');
    }
    const failed = results.length - sent;
    return {
      channel: 'sms',
      ok: sent > 0 && failed === 0,
      sent,
      failed,
      latencyMs: Date.now() - started,
      message:
        failed === 0
          ? `تم إرسال الرسالة القصيرة بنجاح إلى ${sent} رقم`
          : sent > 0
            ? `تم الإرسال إلى ${sent} وفشل ${failed} (${errors[0]})`
            : `فشل إرسال الرسالة القصيرة: ${errors[0]}`
    };
  }

  // Custom HTTP Webhook SMS Gateway (supports local Algerian providers & Android SMS Gateway apps)
  const webhookUrl = String(cfg.smsWebhookUrl || '').trim();
  if (!webhookUrl || !isSafeExternalWebhookUrl(webhookUrl)) {
    return {
      channel: 'sms',
      ok: false,
      sent: 0,
      failed: recipients.length,
      latencyMs: 0,
      message: 'يرجى إدخال رابط خارجي صالح لبوابة الرسائل القصيرة المخصصة (https://...)'
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secretToken = String(cfg.smsAuthToken || '').trim();
  if (secretToken) {
    headers.Authorization = secretToken.includes(' ') ? secretToken : `Bearer ${secretToken}`;
  }

  const results = await Promise.allSettled(
    recipients.map(async to => {
      const res = await fetchWithTimeout(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to,
          phone: to,
          message: compactText,
          text: compactText,
          from: cfg.smsFromNumber || payload.storeName || '',
          event: payload.eventType,
          orderNumber: payload.orderNumber || '',
          total: payload.total || 0
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return to;
    })
  );

  let sent = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') sent += 1;
    else errors.push(r.reason?.message || 'فشل الإرسال');
  }
  const failed = results.length - sent;
  return {
    channel: 'sms',
    ok: sent > 0 && failed === 0,
    sent,
    failed,
    latencyMs: Date.now() - started,
    message:
      failed === 0
        ? `تم إرسال الرسالة عبر البوابة المخصصة إلى ${sent} رقم`
        : sent > 0
          ? `تم الإرسال إلى ${sent} وفشل ${failed} (${errors[0]})`
          : `فشل إرسال الرسالة عبر البوابة المخصصة: ${errors[0]}`
  };
}

function isEventEnabledForStore(
  cfg: ServerStoreApiConfig,
  eventType: MerchantAlertEventType
): boolean {
  if (eventType === 'test') return true;
  if (eventType === 'new_order') return cfg.merchantAlertsOnNewOrder !== false;
  if (eventType === 'payment_received') return cfg.merchantAlertsOnPayment !== false;
  if (eventType === 'abandoned_order') return cfg.merchantAlertsOnAbandoned !== false;
  return false;
}

export async function dispatchMerchantAlert(
  cfg: ServerStoreApiConfig | undefined,
  payload: MerchantAlertEventPayload,
  storeWhatsAppDispatcher: StoreWhatsAppDispatcher
): Promise<{
  ok: boolean;
  skipped?: boolean;
  channels: ChannelDispatchResult[];
}> {
  if (!cfg) {
    return { ok: true, skipped: true, channels: [] };
  }

  const hasAnyChannel =
    Boolean(cfg.telegramAlertsEnabled) ||
    Boolean(cfg.merchantWhatsappAlertsEnabled) ||
    Boolean(cfg.smsAlertsEnabled);

  if (!hasAnyChannel || !isEventEnabledForStore(cfg, payload.eventType)) {
    return { ok: true, skipped: true, channels: [] };
  }

  if (payload.eventType !== 'test' && isDuplicateAlert(payload.dedupeKey)) {
    return { ok: true, skipped: true, channels: [] };
  }

  const fullText = buildMerchantAlertText(payload, false);
  const compactText = buildMerchantAlertText(payload, true);

  const tasks: Array<Promise<ChannelDispatchResult>> = [];
  if (cfg.telegramAlertsEnabled) {
    tasks.push(sendTelegramAlerts(cfg, fullText));
  }
  if (cfg.merchantWhatsappAlertsEnabled) {
    tasks.push(sendMerchantWhatsAppAlerts(cfg, fullText, payload, storeWhatsAppDispatcher));
  }
  if (cfg.smsAlertsEnabled) {
    tasks.push(sendSmsAlerts(cfg, compactText, payload));
  }

  const settled = await Promise.all(tasks);
  const anySent = settled.some(r => r.sent > 0);
  return {
    ok: anySent || settled.length === 0,
    channels: settled
  };
}

export async function testMerchantAlertChannel(
  cfg: ServerStoreApiConfig,
  channel: MerchantAlertChannel,
  storeName: string,
  storeWhatsAppDispatcher: StoreWhatsAppDispatcher
): Promise<ChannelDispatchResult> {
  const payload: MerchantAlertEventPayload = {
    storeId: cfg.storeId,
    storeName,
    eventType: 'test'
  };
  const fullText = buildMerchantAlertText(payload, false);
  const compactText = buildMerchantAlertText(payload, true);

  if (channel === 'telegram') {
    return sendTelegramAlerts(cfg, fullText);
  }
  if (channel === 'whatsapp') {
    return sendMerchantWhatsAppAlerts(cfg, fullText, payload, storeWhatsAppDispatcher);
  }
  return sendSmsAlerts(cfg, compactText, payload);
}
