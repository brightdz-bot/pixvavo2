import express from 'express';
import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type CourierProvider =
  | 'none'
  | 'ecotrack'
  | 'yalidine'
  | 'zrexpress'
  | 'guepex'
  | 'maystro'
  | 'procolis';

export type WhatsAppProvider = 'none' | 'meta_cloud' | 'evolution' | 'webhook';

export interface ServerStoreApiConfig {
  storeId: string;
  courierProvider: CourierProvider;
  courierApiId?: string;
  courierApiToken?: string;
  courierFromWilayaId?: string;
  courierFromWilayaName?: string;
  courierSenderName?: string;
  courierBaseUrl?: string;
  courierAutoSendOnConfirm?: boolean;
  metaPixelId?: string;
  metaCapiEnabled?: boolean;
  metaCapiToken?: string;
  metaTestEventCode?: string;
  tiktokPixelId?: string;
  tiktokEventsEnabled?: boolean;
  tiktokEventsToken?: string;
  tiktokTestEventCode?: string;
  whatsappProvider: WhatsAppProvider;
  whatsappApiUrl?: string;
  whatsappInstance?: string;
  whatsappPhoneNumberId?: string;
  whatsappApiToken?: string;
  whatsappTemplateName?: string;
  whatsappAutoSendOnOrder?: boolean;
  whatsappAutoSendOnShipping?: boolean;
  googleSheetWebhook?: string;
}

const RUNTIME_CONFIG_PATH = process.env.VERCEL
  ? '/tmp/.brightdz-api-cache.json'
  : path.resolve(process.cwd(), '.brightdz-api-cache.json');

const storeConfigMap = new Map<string, ServerStoreApiConfig>();

function loadPersistedServerConfigs() {
  try {
    if (fs.existsSync(RUNTIME_CONFIG_PATH)) {
      const raw = fs.readFileSync(RUNTIME_CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, ServerStoreApiConfig>;
      Object.entries(parsed).forEach(([k, v]) => {
        if (v && k) storeConfigMap.set(k, v);
      });
    }
  } catch {
    // non-fatal cache load
  }
}

function persistServerConfigs() {
  try {
    const obj: Record<string, ServerStoreApiConfig> = {};
    storeConfigMap.forEach((v, k) => {
      obj[k] = v;
    });
    fs.writeFileSync(RUNTIME_CONFIG_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch {
    // non-fatal cache save
  }
}

loadPersistedServerConfigs();

function sha256(val?: string): string | undefined {
  const clean = (val || '').trim().toLowerCase();
  if (!clean) return undefined;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function normalizePhoneE164Digits(raw?: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('213')) return digits;
  if (digits.startsWith('0')) return '213' + digits.slice(1);
  if (digits.length === 9 && (digits.startsWith('5') || digits.startsWith('6') || digits.startsWith('7'))) {
    return '213' + digits;
  }
  return digits;
}

function normalizeLocalPhone(raw?: string): string {
  const e164 = normalizePhoneE164Digits(raw);
  if (e164.startsWith('213') && e164.length >= 12) {
    return '0' + e164.slice(3);
  }
  return String(raw || '').replace(/[^\d]/g, '');
}

function getCourierDefaults(
  provider: CourierProvider,
  customBaseUrl?: string
): { baseUrl: string; label: string } {
  const cleanOverride = (customBaseUrl || '').trim().replace(/\/+$/, '');
  switch (provider) {
    case 'ecotrack': {
      const origin = (cleanOverride || 'https://48hr.ecotrack.dz').replace(/\/api\/v1$/i, '');
      return { baseUrl: `${origin}/api/v1`, label: 'Ecotrack (48Hr Express)' };
    }
    case 'yalidine':
      return { baseUrl: cleanOverride || 'https://api.yalidine.app/v1', label: 'Yalidine' };
    case 'guepex':
      return { baseUrl: cleanOverride || 'https://api.guepex.app/v1', label: 'Guepex' };
    case 'zrexpress':
      return { baseUrl: cleanOverride || 'https://procolis.com/api_v1', label: 'ZR Express' };
    case 'procolis':
      return { baseUrl: cleanOverride || 'https://procolis.com/api_v1', label: 'Procolis' };
    case 'maystro':
      return {
        baseUrl: cleanOverride || 'https://backend.maystro-delivery.com/api/stores',
        label: 'Maystro Delivery'
      };
    default:
      return { baseUrl: cleanOverride, label: 'غير محدد' };
  }
}

function mapCourierStatusToAppStatus(
  rawStatus: string
): 'new' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled' {
  const s = (rawStatus || '').trim().toLowerCase();
  if (!s) return 'shipping';
  if (
    s.includes('livré') ||
    s.includes('livre') ||
    s.includes('delivered') ||
    s.includes('تم التسليم') ||
    s.includes('encais')
  ) {
    return 'delivered';
  }
  if (
    s.includes('retour') ||
    s.includes('annul') ||
    s.includes('cancel') ||
    s.includes('échec') ||
    s.includes('echec') ||
    s.includes('ملغ')
  ) {
    return 'cancelled';
  }
  if (
    s.includes('préparation') ||
    s.includes('preparation') ||
    s.includes('prêt') ||
    s.includes('pret') ||
    s.includes('confirm')
  ) {
    return 'confirmed';
  }
  return 'shipping';
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
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

// Optional cold-start lookup from Supabase when running on serverless hosts (e.g. Vercel)
async function getOrFetchServerConfig(storeId: string): Promise<ServerStoreApiConfig | undefined> {
  if (!storeId) return undefined;
  const cached = storeConfigMap.get(storeId);
  if (cached) return cached;

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) return undefined;

  try {
    const res = await fetchJsonWithTimeout(
      `${supabaseUrl}/rest/v1/store_api_configs?store_id=eq.${encodeURIComponent(storeId)}&select=config&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          // New sb_secret_ keys are not JWTs and must only be sent in `apikey`.
          ...(serviceRoleKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
          Accept: 'application/json'
        }
      },
      6000
    );
    const row = Array.isArray(res.json) ? res.json[0] : null;
    if (res.ok && row?.config) {
      const cfg = { storeId, ...(row.config as Partial<ServerStoreApiConfig>) } as ServerStoreApiConfig;
      storeConfigMap.set(storeId, cfg);
      return cfg;
    }
  } catch {
    // non-fatal serverless lookup fallback
  }
  return undefined;
}

async function resolveConfigAsync(body: any): Promise<ServerStoreApiConfig> {
  const storeId = String(body?.storeId || '').trim();
  const cached = storeId ? await getOrFetchServerConfig(storeId) : undefined;
  const incoming = (body?.config || {}) as Partial<ServerStoreApiConfig>;
  return {
    storeId,
    courierProvider: incoming.courierProvider || cached?.courierProvider || 'none',
    courierApiId: incoming.courierApiId ?? cached?.courierApiId ?? '',
    courierApiToken: incoming.courierApiToken ?? cached?.courierApiToken ?? '',
    courierFromWilayaId: incoming.courierFromWilayaId ?? cached?.courierFromWilayaId ?? '16',
    courierFromWilayaName: incoming.courierFromWilayaName ?? cached?.courierFromWilayaName ?? 'الجزائر العاصمة',
    courierSenderName: incoming.courierSenderName ?? cached?.courierSenderName ?? '',
    courierBaseUrl: incoming.courierBaseUrl ?? cached?.courierBaseUrl ?? '',
    courierAutoSendOnConfirm: incoming.courierAutoSendOnConfirm ?? cached?.courierAutoSendOnConfirm ?? false,
    metaPixelId: incoming.metaPixelId ?? cached?.metaPixelId ?? '',
    metaCapiEnabled: incoming.metaCapiEnabled ?? cached?.metaCapiEnabled ?? false,
    metaCapiToken: incoming.metaCapiToken ?? cached?.metaCapiToken ?? '',
    metaTestEventCode: incoming.metaTestEventCode ?? cached?.metaTestEventCode ?? '',
    tiktokPixelId: incoming.tiktokPixelId ?? cached?.tiktokPixelId ?? '',
    tiktokEventsEnabled: incoming.tiktokEventsEnabled ?? cached?.tiktokEventsEnabled ?? false,
    tiktokEventsToken: incoming.tiktokEventsToken ?? cached?.tiktokEventsToken ?? '',
    tiktokTestEventCode: incoming.tiktokTestEventCode ?? cached?.tiktokTestEventCode ?? '',
    whatsappProvider: incoming.whatsappProvider || cached?.whatsappProvider || 'none',
    whatsappApiUrl: incoming.whatsappApiUrl ?? cached?.whatsappApiUrl ?? '',
    whatsappInstance: incoming.whatsappInstance ?? cached?.whatsappInstance ?? '',
    whatsappPhoneNumberId: incoming.whatsappPhoneNumberId ?? cached?.whatsappPhoneNumberId ?? '',
    whatsappApiToken: incoming.whatsappApiToken ?? cached?.whatsappApiToken ?? '',
    whatsappTemplateName: incoming.whatsappTemplateName ?? cached?.whatsappTemplateName ?? '',
    whatsappAutoSendOnOrder: incoming.whatsappAutoSendOnOrder ?? cached?.whatsappAutoSendOnOrder ?? false,
    whatsappAutoSendOnShipping: incoming.whatsappAutoSendOnShipping ?? cached?.whatsappAutoSendOnShipping ?? false,
    googleSheetWebhook: incoming.googleSheetWebhook ?? cached?.googleSheetWebhook ?? ''
  };
}

async function dispatchWhatsAppMessage(
  cfg: ServerStoreApiConfig,
  payload: {
    phone?: string;
    message?: string;
    orderNumber?: string;
    customerName?: string;
    status?: string;
    trackingCode?: string;
    total?: number;
    isTest?: boolean;
  }
): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const {
    phone = '',
    message = '',
    orderNumber = '',
    customerName = '',
    status = '',
    trackingCode = '',
    total = 0,
    isTest = false
  } = payload || {};

  const provider = cfg.whatsappProvider;
  if (provider === 'none') {
    return { ok: false, message: 'مزود WhatsApp API غير مفعّل (الوضع اليدوي فقط)', latencyMs: 0 };
  }

  const e164Phone = normalizePhoneE164Digits(phone);

  try {
    if (provider === 'meta_cloud') {
      const phoneNumberId = (cfg.whatsappPhoneNumberId || '').trim();
      const token = (cfg.whatsappApiToken || '').trim();
      if (!phoneNumberId || !token) {
        return { ok: false, message: 'يرجى إدخال Phone Number ID و Access Token', latencyMs: 0 };
      }

      if (isTest && !e164Phone) {
        const check = await fetchJsonWithTimeout(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        return {
          ok: check.ok,
          latencyMs: check.latencyMs,
          message: check.ok
            ? `اتصال سليم مع WhatsApp Cloud (${check.json?.display_phone_number || phoneNumberId})`
            : check.json?.error?.message || `فشل التحقق (HTTP ${check.status})`
        };
      }

      if (!e164Phone) {
        return { ok: false, message: 'رقم هاتف المستلم مطلوب لإرسال الرسالة', latencyMs: 0 };
      }

      const bodyPayload = cfg.whatsappTemplateName?.trim()
        ? {
            messaging_product: 'whatsapp',
            to: e164Phone,
            type: 'template',
            template: {
              name: cfg.whatsappTemplateName.trim(),
              language: { code: 'ar' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: customerName || 'الزبون الكريم' },
                    { type: 'text', text: orderNumber || '-' }
                  ]
                }
              ]
            }
          }
        : {
            messaging_product: 'whatsapp',
            to: e164Phone,
            type: 'text',
            text: { body: message }
          };

      const sendRes = await fetchJsonWithTimeout(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bodyPayload)
        }
      );

      return {
        ok: sendRes.ok,
        latencyMs: sendRes.latencyMs,
        message: sendRes.ok
          ? 'تم إرسال رسالة WhatsApp بنجاح عبر Meta Cloud API'
          : sendRes.json?.error?.message || `فشل إرسال الرسالة (HTTP ${sendRes.status})`
      };
    }

    if (provider === 'evolution') {
      const base = (cfg.whatsappApiUrl || '').trim().replace(/\/+$/, '');
      const instance = (cfg.whatsappInstance || '').trim();
      const token = (cfg.whatsappApiToken || '').trim();
      if (!base || !instance || !token) {
        return { ok: false, message: 'يرجى إدخال رابط السيرفر واسم الـ Instance و API Key', latencyMs: 0 };
      }

      if (isTest && !e164Phone) {
        const check = await fetchJsonWithTimeout(
          `${base}/instance/connectionState/${encodeURIComponent(instance)}`,
          {
            method: 'GET',
            headers: { apikey: token }
          }
        );
        return {
          ok: check.ok,
          latencyMs: check.latencyMs,
          message: check.ok
            ? `اتصال ناجح بـ Evolution API (${check.json?.instance?.state || 'connected'})`
            : `تعذر الاتصال بـ Evolution API (HTTP ${check.status})`
        };
      }

      const sendRes = await fetchJsonWithTimeout(
        `${base}/message/sendText/${encodeURIComponent(instance)}`,
        {
          method: 'POST',
          headers: {
            apikey: token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ number: e164Phone, text: message })
        }
      );
      return {
        ok: sendRes.ok,
        latencyMs: sendRes.latencyMs,
        message: sendRes.ok ? 'تم إرسال رسالة واتساب تلقائياً' : `فشل الإرسال (HTTP ${sendRes.status})`
      };
    }

    if (provider === 'webhook') {
      const url = (cfg.whatsappApiUrl || '').trim();
      if (!url) {
        return { ok: false, message: 'يرجى إدخال رابط WhatsApp Webhook أولاً', latencyMs: 0 };
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cfg.whatsappApiToken?.trim()) {
        headers.Authorization = `Bearer ${cfg.whatsappApiToken.trim()}`;
      }
      const sendRes = await fetchJsonWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: isTest ? 'test' : 'whatsapp_message',
          phone: e164Phone,
          message,
          orderNumber,
          customerName,
          status,
          trackingCode,
          total
        })
      });
      return {
        ok: sendRes.ok,
        latencyMs: sendRes.latencyMs,
        message: sendRes.ok
          ? 'تم استدعاء WhatsApp Webhook بنجاح'
          : `استجاب Webhook برمز HTTP ${sendRes.status}`
      };
    }

    return { ok: false, message: 'مزود WhatsApp غير مدعوم', latencyMs: 0 };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: 0,
      message: `خطأ اتصال بواجهة واتساب: ${err?.message || 'غير معروف'}`
    };
  }
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, runtime: process.env.VERCEL ? 'vercel' : 'node' });
  });

  // Sync merchant store API config to server runtime cache
  app.post('/api/integrations/config', (req: Request, res: Response) => {
    const cfg = req.body as ServerStoreApiConfig;
    if (!cfg || !cfg.storeId) {
      res.status(400).json({ ok: false, message: 'Missing storeId' });
      return;
    }
    storeConfigMap.set(cfg.storeId, cfg);
    persistServerConfigs();
    res.json({ ok: true });
  });

  // 1. Test Courier API Connection
  app.post('/api/integrations/test-courier', async (req: Request, res: Response) => {
    const cfg = await resolveConfigAsync(req.body);
    const provider = cfg.courierProvider;
    const apiId = (cfg.courierApiId || '').trim();
    const apiToken = (cfg.courierApiToken || '').trim();

    if (provider === 'none') {
      res.json({ ok: false, message: 'يرجى اختيار شركة التوصيل أولاً', latencyMs: 0 });
      return;
    }
    if (!apiToken) {
      res.json({ ok: false, message: 'يرجى إدخال API Token (رمز التوثيق) قبل الاختبار', latencyMs: 0 });
      return;
    }
    if (
      (provider === 'yalidine' ||
        provider === 'guepex' ||
        provider === 'zrexpress' ||
        provider === 'procolis') &&
      !apiId
    ) {
      res.json({ ok: false, message: 'يرجى إدخال API ID و API Token كاملين قبل الاختبار', latencyMs: 0 });
      return;
    }

    const { baseUrl, label } = getCourierDefaults(provider, cfg.courierBaseUrl);
    try {
      if (provider === 'yalidine' || provider === 'guepex') {
        const result = await fetchJsonWithTimeout(`${baseUrl}/wilayas/`, {
          method: 'GET',
          headers: {
            'X-API-ID': apiId,
            'X-API-TOKEN': apiToken,
            Accept: 'application/json'
          }
        });
        res.json({
          ok: result.ok,
          latencyMs: result.latencyMs,
          message: result.ok
            ? `تم الاتصال بنجاح مع ${label} (الحساب مفعّل والبيانات متصلة)`
            : `رفضت ${label} الاتصال (HTTP ${result.status}): تحقق من API ID و API Token`
        });
        return;
      }

      if (provider === 'zrexpress' || provider === 'procolis') {
        const result = await fetchJsonWithTimeout(`${baseUrl}/token`, {
          method: 'GET',
          headers: {
            token: apiToken,
            key: apiId,
            Accept: 'application/json'
          }
        });
        const valid = result.ok && result.json?.Statut !== 'Error';
        res.json({
          ok: valid,
          latencyMs: result.latencyMs,
          message: valid
            ? `تم التحقق من مفاتيح ${label} بنجاح`
            : `تعذر التحقق من مفاتيح ${label} (HTTP ${result.status})`
        });
        return;
      }

      if (provider === 'ecotrack') {
        const result = await fetchJsonWithTimeout(`${baseUrl}/get/wilayas`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            Accept: 'application/json'
          }
        });
        res.json({
          ok: result.ok,
          latencyMs: result.latencyMs,
          message: result.ok
            ? `تم الاتصال بنجاح مع ${label} (رمز التوثيق مفعّل)`
            : `تعذر الاتصال مع ${label} (HTTP ${result.status}): تحقق من رابط المنصة ورمز التوثيق`
        });
        return;
      }

      if (provider === 'maystro') {
        const result = await fetchJsonWithTimeout(`${baseUrl}/orders/?limit=1`, {
          method: 'GET',
          headers: {
            Authorization: `Token ${apiToken}`,
            Accept: 'application/json'
          }
        });
        res.json({
          ok: result.ok,
          latencyMs: result.latencyMs,
          message: result.ok
            ? `تم الاتصال بنجاح مع ${label}`
            : `فشل الاتصال مع ${label} (HTTP ${result.status}): تحقق من Token`
        });
      }
    } catch (err: any) {
      res.json({
        ok: false,
        latencyMs: 0,
        message: `تعذر الوصول إلى خادم ${label}: ${err?.name === 'AbortError' ? 'انتهت مهلة الاتصال' : err?.message || 'خطأ شبكة'}`
      });
    }
  });

  // 2. Create Parcel in Courier API
  app.post('/api/courier/create-parcel', async (req: Request, res: Response) => {
    const cfg = await resolveConfigAsync(req.body);
    const order = req.body?.order;
    const provider = cfg.courierProvider;
    if (!order) {
      res.status(400).json({ ok: false, message: 'بيانات الطلب مفقودة' });
      return;
    }
    if (provider === 'none') {
      res.json({ ok: false, message: 'لم يتم تفعيل شركة توصيل في إعدادات الـ API' });
      return;
    }

    const apiId = (cfg.courierApiId || '').trim();
    const apiToken = (cfg.courierApiToken || '').trim();
    if (!apiToken) {
      res.json({ ok: false, message: 'مفتاح API Token لشركة التوصيل غير مضبوط' });
      return;
    }

    const { baseUrl, label } = getCourierDefaults(provider, cfg.courierBaseUrl);
    const nameParts = String(order.customerName || 'زبون').trim().split(/\s+/);
    const firstName = nameParts[0] || 'زبون';
    const familyName = nameParts.slice(1).join(' ') || firstName;
    const cleanPhone = normalizeLocalPhone(order.customerPhone);
    const isStopDesk = order.deliveryType === 'stop';
    const productList = String(order.bundleLabel || 'منتج').trim();
    const fromWilayaName = (cfg.courierFromWilayaName || 'Alger').trim();

    try {
      if (provider === 'yalidine' || provider === 'guepex') {
        const payload = [
          {
            order_id: order.orderNumber,
            from_wilaya_name: fromWilayaName,
            firstname: firstName,
            familyname: familyName,
            contact_phone: cleanPhone,
            address: order.address || `${order.wilayaName} - ${order.commune || ''}`,
            to_commune_name: order.commune || order.wilayaName,
            to_wilaya_name: order.wilayaName,
            product_list: productList,
            price: Math.round(Number(order.total || 0)),
            do_insurance: false,
            declared_value: Math.round(Number(order.total || 0)),
            freeshipping: Number(order.shippingFee || 0) === 0,
            is_stopdesk: isStopDesk,
            has_exchange: false
          }
        ];

        const result = await fetchJsonWithTimeout(`${baseUrl}/parcels/`, {
          method: 'POST',
          headers: {
            'X-API-ID': apiId,
            'X-API-TOKEN': apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const orderEntry = result.json?.[order.orderNumber] || Object.values(result.json || {})[0];
        const trackingCode = orderEntry?.tracking || result.json?.tracking || '';
        const labelUrl = orderEntry?.label || result.json?.label || '';
        if (result.ok && trackingCode) {
          res.json({
            ok: true,
            trackingCode,
            labelUrl,
            provider,
            latencyMs: result.latencyMs,
            message: `تم إنشاء الطرد في ${label} وتوليد رمز التتبع ${trackingCode}`
          });
          return;
        }
        const errDetail = orderEntry?.message || result.json?.message || result.text.slice(0, 180);
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `لم يتم قبول الطرد من ${label}: ${errDetail || `HTTP ${result.status}`}`
        });
        return;
      }

      if (provider === 'zrexpress' || provider === 'procolis') {
        const wilayaCode = parseInt(String(order.wilayaId || '16'), 10) || 16;
        const payload = {
          Colis: [
            {
              Tracking: order.orderNumber,
              TypeLivraison: isStopDesk ? '1' : '0',
              TypeColis: '0',
              Confrimee: '1',
              Client: order.customerName,
              MobileA: cleanPhone,
              MobileB: '',
              Adresse: order.address || `${order.wilayaName} - ${order.commune || ''}`,
              IDWilaya: String(wilayaCode),
              Commune: order.commune || order.wilayaName,
              Total: String(Math.round(Number(order.total || 0))),
              Note: order.notes || '',
              TProduit: productList
            }
          ]
        };

        const result = await fetchJsonWithTimeout(`${baseUrl}/add_colis`, {
          method: 'POST',
          headers: {
            token: apiToken,
            key: apiId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const firstRes = Array.isArray(result.json?.Colis) ? result.json.Colis[0] : result.json;
        const trackingCode = firstRes?.Tracking || result.json?.Tracking || order.orderNumber;
        if (result.ok && result.json?.Statut !== 'Error') {
          res.json({
            ok: true,
            trackingCode,
            labelUrl: firstRes?.label || '',
            provider,
            latencyMs: result.latencyMs,
            message: `تم إرسال الطرد إلى ${label} برمز التتبع ${trackingCode}`
          });
          return;
        }
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `فشل إرسال الطرد إلى ${label}: ${result.json?.Message || result.text.slice(0, 160)}`
        });
        return;
      }

      if (provider === 'ecotrack') {
        const wilayaCode = parseInt(String(order.wilayaId || '16'), 10) || 16;
        const payload = {
          reference: order.orderNumber,
          nom_client: order.customerName,
          telephone: cleanPhone,
          adresse: order.address || `${order.wilayaName} - ${order.commune || ''}`,
          code_wilaya: wilayaCode,
          commune: order.commune || order.wilayaName,
          montant: Math.round(Number(order.total || 0)),
          type: 1,
          stop_desk: isStopDesk ? 1 : 0,
          produit: productList,
          remarque: order.notes || ''
        };

        const result = await fetchJsonWithTimeout(`${baseUrl}/create/order`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const trackingCode = String(
          result.json?.tracking ||
            result.json?.data?.tracking ||
            result.json?.order?.tracking ||
            ''
        ).trim();
        const labelUrl = String(
          result.json?.label ||
            result.json?.label_url ||
            (trackingCode
              ? `${baseUrl}/get/order/label?tracking=${encodeURIComponent(trackingCode)}&api_token=${encodeURIComponent(apiToken)}`
              : '')
        ).trim();

        if (result.ok && trackingCode) {
          res.json({
            ok: true,
            trackingCode,
            labelUrl,
            provider,
            latencyMs: result.latencyMs,
            message: `تم إنشاء الطرد في ${label} وتوليد رمز التتبع ${trackingCode}`
          });
          return;
        }
        const errDetail = result.json?.message || result.json?.error || result.text.slice(0, 180);
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `لم يتم قبول الطرد من ${label}: ${errDetail || `HTTP ${result.status}`}`
        });
        return;
      }

      if (provider === 'maystro') {
        const wilayaIdNum = parseInt(String(order.wilayaId || '16'), 10) || 16;
        const payload = {
          external_id: order.orderNumber,
          customer_name: order.customerName,
          customer_phone: cleanPhone,
          wilaya: wilayaIdNum,
          commune_name: order.commune || order.wilayaName,
          destination_text: order.address || `${order.wilayaName} - ${order.commune || ''}`,
          delivery_type: isStopDesk ? 2 : 1,
          total_price: Math.round(Number(order.total || 0)),
          note_to_driver: order.notes || '',
          products: [{ description: productList, quantity: 1 }]
        };

        const result = await fetchJsonWithTimeout(`${baseUrl}/orders/`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const trackingCode = result.json?.tracking || result.json?.display_id || result.json?.id || '';
        if (result.ok && trackingCode) {
          res.json({
            ok: true,
            trackingCode: String(trackingCode),
            labelUrl: result.json?.label_url || '',
            provider,
            latencyMs: result.latencyMs,
            message: `تم إرسال الطرد إلى ${label} بنجاح (${trackingCode})`
          });
          return;
        }
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `فشل إرسال الطرد إلى ${label}: ${JSON.stringify(result.json || result.text).slice(0, 180)}`
        });
      }
    } catch (err: any) {
      res.json({
        ok: false,
        latencyMs: 0,
        message: `تعذر الاتصال بـ ${label}: ${err?.message || 'خطأ شبكة'}`
      });
    }
  });

  // 3. Track / Pull Parcel Status from Courier API
  app.post('/api/courier/track-parcel', async (req: Request, res: Response) => {
    const cfg = await resolveConfigAsync(req.body);
    const trackingCode = String(req.body?.trackingCode || '').trim();
    const provider = cfg.courierProvider;

    if (!trackingCode) {
      res.status(400).json({ ok: false, message: 'رمز التتبع مطلوب' });
      return;
    }
    if (provider === 'none') {
      res.json({ ok: false, message: 'شركة التوصيل غير مفعلة في إعدادات الـ API' });
      return;
    }

    const apiId = (cfg.courierApiId || '').trim();
    const apiToken = (cfg.courierApiToken || '').trim();
    const { baseUrl, label } = getCourierDefaults(provider, cfg.courierBaseUrl);

    try {
      if (provider === 'yalidine' || provider === 'guepex') {
        const result = await fetchJsonWithTimeout(
          `${baseUrl}/parcels/?tracking=${encodeURIComponent(trackingCode)}`,
          {
            method: 'GET',
            headers: {
              'X-API-ID': apiId,
              'X-API-TOKEN': apiToken,
              Accept: 'application/json'
            }
          }
        );
        const item = Array.isArray(result.json?.data) ? result.json.data[0] : result.json?.data;
        if (result.ok && item) {
          const rawSt = String(item.last_status || item.status || '');
          res.json({
            ok: true,
            courierStatus: rawSt,
            mappedStatus: mapCourierStatusToAppStatus(rawSt),
            labelUrl: item.label || '',
            latencyMs: result.latencyMs,
            message: `الحالة الحالية في ${label}: ${rawSt || 'جاري المعالجة'}`
          });
          return;
        }
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `لم يتم العثور على الطرد ${trackingCode} في ${label}`
        });
        return;
      }

      if (provider === 'zrexpress' || provider === 'procolis') {
        const result = await fetchJsonWithTimeout(`${baseUrl}/lire`, {
          method: 'POST',
          headers: {
            token: apiToken,
            key: apiId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ Colis: [{ Tracking: trackingCode }] })
        });
        const item = Array.isArray(result.json?.Colis) ? result.json.Colis[0] : result.json?.[0];
        if (result.ok && item) {
          const rawSt = String(item.Situation || item.Statut || '');
          res.json({
            ok: true,
            courierStatus: rawSt,
            mappedStatus: mapCourierStatusToAppStatus(rawSt),
            latencyMs: result.latencyMs,
            message: `الحالة الحالية في ${label}: ${rawSt || 'تم الاستلام'}`
          });
          return;
        }
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `تعذر جلب حالة الطرد من ${label}`
        });
        return;
      }

      if (provider === 'ecotrack') {
        const result = await fetchJsonWithTimeout(
          `${baseUrl}/get/tracking/info?tracking=${encodeURIComponent(trackingCode)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              Accept: 'application/json'
            }
          }
        );
        const activity = Array.isArray(result.json?.activity) ? result.json.activity : [];
        const latestActivity = activity.length > 0 ? activity[activity.length - 1] : null;
        const rawSt = String(
          latestActivity?.status || result.json?.status || result.json?.data?.status || ''
        ).trim();
        if (result.ok && rawSt) {
          res.json({
            ok: true,
            courierStatus: rawSt,
            mappedStatus: mapCourierStatusToAppStatus(rawSt),
            labelUrl: `${baseUrl}/get/order/label?tracking=${encodeURIComponent(trackingCode)}&api_token=${encodeURIComponent(apiToken)}`,
            latencyMs: result.latencyMs,
            message: `الحالة الحالية في ${label}: ${rawSt}`
          });
          return;
        }
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `تعذر العثور على تفاصيل الطرد ${trackingCode} في ${label}`
        });
        return;
      }

      if (provider === 'maystro') {
        const result = await fetchJsonWithTimeout(
          `${baseUrl}/orders/${encodeURIComponent(trackingCode)}/`,
          {
            method: 'GET',
            headers: {
              Authorization: `Token ${apiToken}`,
              Accept: 'application/json'
            }
          }
        );
        if (result.ok && result.json) {
          const rawSt = String(result.json.status_name || result.json.status || '');
          res.json({
            ok: true,
            courierStatus: rawSt,
            mappedStatus: mapCourierStatusToAppStatus(rawSt),
            labelUrl: result.json.label_url || '',
            latencyMs: result.latencyMs,
            message: `الحالة الحالية في ${label}: ${rawSt}`
          });
          return;
        }
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `تعذر العثور على الطرد في ${label}`
        });
      }
    } catch (err: any) {
      res.json({
        ok: false,
        latencyMs: 0,
        message: `تعذر سحب الحالة من ${label}: ${err?.message || 'خطأ اتصال'}`
      });
    }
  });

  // 4. Test Google Sheet Webhook Diagnostics
  app.post('/api/integrations/test-google-sheet', async (req: Request, res: Response) => {
    const webhookUrl = String(req.body?.webhookUrl || '').trim();
    if (!webhookUrl) {
      res.json({ ok: false, latencyMs: 0, message: 'يرجى إدخال رابط Google Apps Script Webhook أولاً' });
      return;
    }

    try {
      const target = new URL(webhookUrl);
      target.searchParams.set('action', 'list');
      const result = await fetchJsonWithTimeout(
        target.toString(),
        { method: 'GET', redirect: 'follow' },
        12000
      );

      if (result.ok && result.json && result.json.status === 'success') {
        const count = Array.isArray(result.json.orders) ? result.json.orders.length : 0;
        res.json({
          ok: true,
          latencyMs: result.latencyMs,
          rowCount: count,
          message: `الرابط متصل ويعمل بنجاح — تم اكتشاف ${count} طلب في الجدول`
        });
        return;
      }

      if (result.text && result.text.includes('<!DOCTYPE html')) {
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: 'الرابط يعيد صفحة HTML بدلاً من JSON: تأكد من نشر Apps Script بصلاحية "أي شخص (Anyone)" وتفعيل دالة doGet'
        });
        return;
      }

      res.json({
        ok: false,
        latencyMs: result.latencyMs,
        message: `استجابة غير متوقعة من Google Sheet (HTTP ${result.status}): تأكد من تحديث كود doGet`
      });
    } catch (err: any) {
      res.json({
        ok: false,
        latencyMs: 0,
        message: `فشل اختبار Google Sheet: ${err?.message || 'رابط غير صالح'}`
      });
    }
  });

  // 5. Server-side Tracking Events (Meta CAPI + TikTok Events API)
  app.post('/api/integrations/track-event', async (req: Request, res: Response) => {
    const cfg = await resolveConfigAsync(req.body);
    const {
      eventName = 'Purchase',
      eventId,
      orderNumber,
      value = 0,
      contentName = '',
      customerPhone = '',
      customerName = '',
      wilayaName = '',
      pageUrl = '',
      isTest = false,
      target = 'all'
    } = req.body || {};

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    const userAgent = req.headers['user-agent'] || '';
    const e164Phone = normalizePhoneE164Digits(customerPhone);
    const firstName = String(customerName || '').trim().split(/\s+/)[0] || '';
    const results: Record<string, { ok: boolean; message: string; latencyMs?: number }> = {};

    if (
      (target === 'all' || target === 'meta') &&
      (cfg.metaCapiEnabled || isTest) &&
      cfg.metaPixelId &&
      cfg.metaCapiToken
    ) {
      const metaEventPayload: any = {
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId || `${orderNumber || 'evt'}_${Date.now()}`,
            action_source: 'website',
            event_source_url: pageUrl || undefined,
            user_data: {
              client_ip_address: clientIp || undefined,
              client_user_agent: userAgent || undefined,
              ph: e164Phone ? [sha256(e164Phone)] : undefined,
              fn: firstName ? [sha256(firstName)] : undefined,
              ct: wilayaName ? [sha256(wilayaName)] : undefined,
              country: [sha256('dz')]
            },
            custom_data: {
              currency: 'DZD',
              value: Number(value) || 0,
              content_name: contentName || undefined,
              order_id: orderNumber || undefined
            }
          }
        ]
      };
      if (cfg.metaTestEventCode?.trim()) {
        metaEventPayload.test_event_code = cfg.metaTestEventCode.trim();
      }

      try {
        const metaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.metaPixelId.trim())}/events?access_token=${encodeURIComponent(cfg.metaCapiToken.trim())}`;
        const mRes = await fetchJsonWithTimeout(metaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metaEventPayload)
        });
        if (mRes.ok && mRes.json?.events_received) {
          results.meta = {
            ok: true,
            latencyMs: mRes.latencyMs,
            message: `تم استلام الحدث في Meta CAPI (${mRes.json.events_received} event)`
          };
        } else {
          results.meta = {
            ok: false,
            latencyMs: mRes.latencyMs,
            message: mRes.json?.error?.message || `فشل إرسال Meta CAPI (HTTP ${mRes.status})`
          };
        }
      } catch (err: any) {
        results.meta = { ok: false, message: err?.message || 'تعذر الاتصال بـ Meta Graph API' };
      }
    } else if (target === 'meta' && isTest) {
      results.meta = { ok: false, message: 'يرجى إدخال Meta Pixel ID و CAPI Access Token أولاً' };
    }

    if (
      (target === 'all' || target === 'tiktok') &&
      (cfg.tiktokEventsEnabled || isTest) &&
      cfg.tiktokPixelId &&
      cfg.tiktokEventsToken
    ) {
      const ttEvent = eventName === 'Purchase' ? 'CompletePayment' : eventName;
      const ttPayload: any = {
        event_source: 'web',
        event_source_id: cfg.tiktokPixelId.trim(),
        data: [
          {
            event: ttEvent,
            event_id: eventId || `${orderNumber || 'tt'}_${Date.now()}`,
            event_time: Math.floor(Date.now() / 1000),
            page: { url: pageUrl || '' },
            user: {
              ip: clientIp || undefined,
              user_agent: userAgent || undefined,
              phone: e164Phone ? sha256('+' + e164Phone) : undefined
            },
            properties: {
              currency: 'DZD',
              value: Number(value) || 0,
              content_name: contentName || undefined,
              order_id: orderNumber || undefined
            }
          }
        ]
      };
      if (cfg.tiktokTestEventCode?.trim()) {
        ttPayload.test_event_code = cfg.tiktokTestEventCode.trim();
      }

      try {
        const ttRes = await fetchJsonWithTimeout('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': cfg.tiktokEventsToken.trim()
          },
          body: JSON.stringify(ttPayload)
        });
        if (ttRes.ok && ttRes.json?.code === 0) {
          results.tiktok = {
            ok: true,
            latencyMs: ttRes.latencyMs,
            message: 'تم إرسال الحدث إلى TikTok Events API بنجاح'
          };
        } else {
          results.tiktok = {
            ok: false,
            latencyMs: ttRes.latencyMs,
            message: ttRes.json?.message || `فشل TikTok Events API (HTTP ${ttRes.status})`
          };
        }
      } catch (err: any) {
        results.tiktok = { ok: false, message: err?.message || 'تعذر الاتصال بـ TikTok API' };
      }
    } else if (target === 'tiktok' && isTest) {
      results.tiktok = { ok: false, message: 'يرجى إدخال TikTok Pixel ID و Events API Token أولاً' };
    }

    res.json({ ok: Object.values(results).every(r => r.ok), results });
  });

  // 6. WhatsApp API Dispatch & Storefront Auto-Order Hook
  app.post('/api/integrations/send-whatsapp', async (req: Request, res: Response) => {
    const cfg = await resolveConfigAsync(req.body);
    const result = await dispatchWhatsAppMessage(cfg, req.body || {});
    res.json(result);
  });

  app.post('/api/integrations/order-whatsapp-hook', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const cfg = storeId ? await getOrFetchServerConfig(storeId) : undefined;
    if (!cfg || cfg.whatsappProvider === 'none' || !cfg.whatsappAutoSendOnOrder) {
      res.json({ ok: true, skipped: true });
      return;
    }

    const {
      phone = '',
      orderNumber = '',
      customerName = '',
      bundleDetails = '',
      total = 0,
      wilayaName = '',
      commune = '',
      storeName = ''
    } = req.body || {};

    const message =
      `السلام عليكم ${customerName}،\n` +
      `تم استلام طلبك رقم ${orderNumber} من متجر ${storeName || 'المتجر'}.\n` +
      `المنتج: ${bundleDetails}\n` +
      `العنوان: ${wilayaName}${commune ? ' - ' + commune : ''}\n` +
      `المبلغ عند الاستلام: ${Math.round(Number(total) || 0)} دج\n` +
      `سنتواصل معك قريباً لتأكيد الإرسال.`;

    const result = await dispatchWhatsAppMessage(cfg, {
      phone,
      message,
      orderNumber,
      customerName,
      status: 'new',
      total
    });
    res.json(result);
  });

  return app;
}
