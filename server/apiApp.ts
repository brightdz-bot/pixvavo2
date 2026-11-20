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
  antiFraudEnabled?: boolean;
  duplicateWindowHours?: number;
  dailyMaxOrdersPerPhone?: number;
  autoFlagReturnsThreshold?: number;
  blacklistedPhones?: Array<{ phone: string; reason?: string; addedAt?: string }>;
  promoCoupons?: Array<{
    id: string;
    code: string;
    type: 'fixed' | 'percent';
    value: number;
    minOrder?: number;
    isActive: boolean;
  }>;
  whatsappConfirmTemplate?: string;
  whatsappShippingTemplate?: string;
  faviconUrl?: string;
}

const RUNTIME_CONFIG_PATH = process.env.VERCEL
  ? '/tmp/.brightdz-api-cache.json'
  : path.resolve(process.cwd(), '.brightdz-api-cache.json');

const storeConfigMap = new Map<string, ServerStoreApiConfig>();
const recentPhoneOrdersMap = new Map<string, number[]>();

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

function normalizeHttpsUrl(raw: string): string {
  const clean = (raw || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://${clean}`;
}

function getCourierDefaults(
  provider: CourierProvider,
  customBaseUrl?: string
): { baseUrl: string; label: string } {
  const cleanOverride = normalizeHttpsUrl(customBaseUrl || '');
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

const WILAYA_ENTRIES: Array<{ code: string; nameAr: string; nameFr: string }> = [
  { code: '01', nameAr: 'أدرار', nameFr: 'Adrar' },
  { code: '02', nameAr: 'الشلف', nameFr: 'Chlef' },
  { code: '03', nameAr: 'الأغواط', nameFr: 'Laghouat' },
  { code: '04', nameAr: 'أم البواقي', nameFr: 'Oum El Bouaghi' },
  { code: '05', nameAr: 'باتنة', nameFr: 'Batna' },
  { code: '06', nameAr: 'بجاية', nameFr: 'Béjaïa' },
  { code: '07', nameAr: 'بسكرة', nameFr: 'Biskra' },
  { code: '08', nameAr: 'بشار', nameFr: 'Béchar' },
  { code: '09', nameAr: 'البليدة', nameFr: 'Blida' },
  { code: '10', nameAr: 'البويرة', nameFr: 'Bouira' },
  { code: '11', nameAr: 'تمنراست', nameFr: 'Tamanrasset' },
  { code: '12', nameAr: 'تبسة', nameFr: 'Tébessa' },
  { code: '13', nameAr: 'تلمسان', nameFr: 'Tlemcen' },
  { code: '14', nameAr: 'تيارت', nameFr: 'Tiaret' },
  { code: '15', nameAr: 'تيزي وزو', nameFr: 'Tizi Ouzou' },
  { code: '16', nameAr: 'الجزائر العاصمة', nameFr: 'Alger' },
  { code: '17', nameAr: 'الجلفة', nameFr: 'Djelfa' },
  { code: '18', nameAr: 'جيجل', nameFr: 'Jijel' },
  { code: '19', nameAr: 'سطيف', nameFr: 'Sétif' },
  { code: '20', nameAr: 'سعيدة', nameFr: 'Saïda' },
  { code: '21', nameAr: 'سكيكدة', nameFr: 'Skikda' },
  { code: '22', nameAr: 'سيدي بلعباس', nameFr: 'Sidi Bel Abbès' },
  { code: '23', nameAr: 'عنابة', nameFr: 'Annaba' },
  { code: '24', nameAr: 'قالمة', nameFr: 'Guelma' },
  { code: '25', nameAr: 'قسنطينة', nameFr: 'Constantine' },
  { code: '26', nameAr: 'المدية', nameFr: 'Médéa' },
  { code: '27', nameAr: 'مستغانم', nameFr: 'Mostaganem' },
  { code: '28', nameAr: 'المسيلة', nameFr: "M'Sila" },
  { code: '29', nameAr: 'معسكر', nameFr: 'Mascara' },
  { code: '30', nameAr: 'ورقلة', nameFr: 'Ouargla' },
  { code: '31', nameAr: 'وهران', nameFr: 'Oran' },
  { code: '32', nameAr: 'البيض', nameFr: 'El Bayadh' },
  { code: '33', nameAr: 'إليزي', nameFr: 'Illizi' },
  { code: '34', nameAr: 'برج بوعريريج', nameFr: 'Bordj Bou Arréridj' },
  { code: '35', nameAr: 'بومرداس', nameFr: 'Boumerdès' },
  { code: '36', nameAr: 'الطارف', nameFr: 'El Tarf' },
  { code: '37', nameAr: 'تندوف', nameFr: 'Tindouf' },
  { code: '38', nameAr: 'تيسمسيلت', nameFr: 'Tissemsilt' },
  { code: '39', nameAr: 'الوادي', nameFr: 'El Oued' },
  { code: '40', nameAr: 'خنشلة', nameFr: 'Khenchela' },
  { code: '41', nameAr: 'سوق أهراس', nameFr: 'Souk Ahras' },
  { code: '42', nameAr: 'تيبازة', nameFr: 'Tipaza' },
  { code: '43', nameAr: 'ميلة', nameFr: 'Mila' },
  { code: '44', nameAr: 'عين الدفلى', nameFr: 'Aïn Defla' },
  { code: '45', nameAr: 'النعامة', nameFr: 'Naâma' },
  { code: '46', nameAr: 'عين تموشنت', nameFr: 'Aïn Témouchent' },
  { code: '47', nameAr: 'غرداية', nameFr: 'Ghardaïa' },
  { code: '48', nameAr: 'غليزان', nameFr: 'Relizane' },
  { code: '49', nameAr: 'تيميمون', nameFr: 'Timimoun' },
  { code: '50', nameAr: 'برج باجي مختار', nameFr: 'Bordj Badji Mokhtar' },
  { code: '51', nameAr: 'أولاد جلال', nameFr: 'Ouled Djellal' },
  { code: '52', nameAr: 'بني عباس', nameFr: 'Béni Abbès' },
  { code: '53', nameAr: 'عين صالح', nameFr: 'In Salah' },
  { code: '54', nameAr: 'عين قزام', nameFr: 'In Guezzam' },
  { code: '55', nameAr: 'تقرت', nameFr: 'Touggourt' },
  { code: '56', nameAr: 'جانت', nameFr: 'Djanet' },
  { code: '57', nameAr: 'المغير', nameFr: "El M'Ghair" },
  { code: '58', nameAr: 'المنيعة', nameFr: 'El Menia' }
];

function stripLatinDiacritics(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasArabicChars(input?: string): boolean {
  return /[\u0600-\u06FF]/.test(String(input || ''));
}

function resolveWilayaMeta(wilayaIdRaw?: string, wilayaNameRaw?: string) {
  const numId = parseInt(String(wilayaIdRaw || ''), 10);
  if (numId >= 1 && numId <= 58) {
    const code = String(numId).padStart(2, '0');
    const found = WILAYA_ENTRIES.find(w => w.code === code);
    if (found) return found;
  }
  const cleanName = String(wilayaNameRaw || '').trim();
  const normLatin = stripLatinDiacritics(cleanName);
  const byMatch = WILAYA_ENTRIES.find(
    w =>
      w.nameAr === cleanName ||
      cleanName.includes(w.nameAr) ||
      (normLatin && stripLatinDiacritics(w.nameFr) === normLatin)
  );
  return byMatch || WILAYA_ENTRIES[15];
}

function transliterateArabicToLatin(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^ال(?=[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهوي])/, 'el ')
    .replace(/\s+ال/g, ' el ')
    .replace(/أولاد|اولاد/g, 'ouled')
    .replace(/سيدي/g, 'sidi')
    .replace(/عين/g, 'ain')
    .replace(/بني/g, 'beni')
    .replace(/وادي|واد/g, 'oued')
    .replace(/برج/g, 'bordj')
    .replace(/بئر/g, 'bir')
    .replace(/حاسي/g, 'hassi')
    .replace(/باب/g, 'bab')
    .replace(/الجزائر الوسطى/g, 'alger centre')
    .replace(/أم/g, 'oum')
    .replace(/بو/g, 'bou')
    .replace(/بن/g, 'ben')
    .replace(/ش/g, 'ch')
    .replace(/ث/g, 'th')
    .replace(/ذ/g, 'dh')
    .replace(/خ/g, 'kh')
    .replace(/غ/g, 'gh')
    .replace(/ص/g, 's')
    .replace(/ض/g, 'd')
    .replace(/ط/g, 't')
    .replace(/ظ/g, 'z')
    .replace(/ق/g, 'k')
    .replace(/ف/g, 'f')
    .replace(/ع/g, 'a')
    .replace(/ح/g, 'h')
    .replace(/ه/g, 'h')
    .replace(/خ/g, 'kh')
    .replace(/ج/g, 'j')
    .replace(/د/g, 'd')
    .replace(/ر/g, 'r')
    .replace(/ز/g, 'z')
    .replace(/س/g, 's')
    .replace(/ت/g, 't')
    .replace(/ن/g, 'n')
    .replace(/م/g, 'm')
    .replace(/ل/g, 'l')
    .replace(/ك/g, 'k')
    .replace(/ب/g, 'b')
    .replace(/و/g, 'ou')
    .replace(/ي|ى/g, 'i')
    .replace(/ة/g, 'a')
    .replace(/ا|أ|إ|آ/g, 'a')
    .replace(/ئ|ء|ؤ/g, 'a');
  return stripLatinDiacritics(cleaned);
}

function bigramScore(a: string, b: string): number {
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1[0] === s2[0] ? 0.5 : 0;
  const map = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const c = map.get(bg) || 0;
    if (c > 0) {
      map.set(bg, c - 1);
      matches++;
    }
  }
  return (2 * matches) / (s1.length - 1 + (s2.length - 1));
}

function pickBestCandidateName(
  desiredRaw: string,
  candidates: Array<{ name: string; arName?: string; preferred?: boolean }>,
  wilayaFallbackFr?: string
): string {
  if (candidates.length === 0) return desiredRaw;
  const desiredTrim = String(desiredRaw || '').trim();
  const desiredArExact = candidates.find(c => c.arName && c.arName.trim() === desiredTrim);
  if (desiredArExact) return desiredArExact.name;

  const desiredLatin = hasArabicChars(desiredTrim)
    ? transliterateArabicToLatin(desiredTrim)
    : stripLatinDiacritics(desiredTrim);

  let best = candidates.find(c => c.preferred) || candidates[0];
  let bestScore = -1;
  const wilayaNorm = stripLatinDiacritics(wilayaFallbackFr || '');

  for (const cand of candidates) {
    const candLatin = stripLatinDiacritics(cand.name);
    if (!candLatin) continue;
    let score = bigramScore(desiredLatin, candLatin);
    if (candLatin === desiredLatin) score += 1;
    if (cand.preferred) score += 0.05;
    if (wilayaNorm && (candLatin === wilayaNorm || candLatin === `${wilayaNorm} centre`)) {
      score += 0.04;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return best.name;
}

const courierMetaCache = new Map<string, { expiresAt: number; data: any }>();

async function cachedCourierGet(
  cacheKey: string,
  url: string,
  headers: Record<string, string>
): Promise<any | null> {
  const cached = courierMetaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  try {
    const res = await fetchJsonWithTimeout(url, { method: 'GET', headers }, 7000);
    if (res.ok && res.json) {
      courierMetaCache.set(cacheKey, {
        expiresAt: Date.now() + 30 * 60 * 1000,
        data: res.json
      });
      return res.json;
    }
  } catch {
    // non-fatal metadata lookup fallback
  }
  return null;
}

function extractCourierApiError(json: any, fallbackText: string): string {
  if (json && typeof json === 'object') {
    if (json.errors && typeof json.errors === 'object') {
      const msgs: string[] = [];
      Object.entries(json.errors).forEach(([field, val]) => {
        if (Array.isArray(val)) msgs.push(`${field}: ${val.join(', ')}`);
        else if (val) msgs.push(`${field}: ${String(val)}`);
      });
      if (msgs.length > 0) return msgs.join(' | ');
    }
    if (typeof json.message === 'string' && json.message.trim()) return json.message.trim();
    if (typeof json.Message === 'string' && json.Message.trim()) return json.Message.trim();
    if (typeof json.error === 'string' && json.error.trim()) return json.error.trim();
    if (typeof json.detail === 'string' && json.detail.trim()) return json.detail.trim();
  }
  return String(fallbackText || '').trim().slice(0, 220);
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
  app.use(express.json({ limit: '2mb' }));

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
    if (
      (provider === 'yalidine' ||
        provider === 'guepex' ||
        provider === 'zrexpress' ||
        provider === 'procolis') &&
      !apiId
    ) {
      res.json({
        ok: false,
        message: 'يرجى إدخال API ID / API Key بجانب التوكن السري في "إعدادات الـ API" وحفظ التغييرات'
      });
      return;
    }

    const { baseUrl, label } = getCourierDefaults(provider, cfg.courierBaseUrl);
    const nameParts = String(order.customerName || 'زبون').trim().split(/\s+/);
    const firstName = nameParts[0] || 'زبون';
    const familyName = nameParts.slice(1).join(' ') || firstName;
    const cleanPhone = normalizeLocalPhone(order.customerPhone);
    const isStopDesk = order.deliveryType === 'stop';
    const productList = String(order.bundleLabel || 'منتج').trim();
    const toWilayaMeta = resolveWilayaMeta(order.wilayaId, order.wilayaName);
    const fromWilayaMeta = resolveWilayaMeta(cfg.courierFromWilayaId, cfg.courierFromWilayaName);
    const toWilayaCode = parseInt(toWilayaMeta.code, 10) || 16;
    const fromWilayaCode = parseInt(fromWilayaMeta.code, 10) || 16;

    try {
      if (provider === 'yalidine' || provider === 'guepex') {
        const yalHeaders = {
          'X-API-ID': apiId,
          'X-API-TOKEN': apiToken,
          Accept: 'application/json'
        };

        const [wilayasJson, communesJson, centersJson] = await Promise.all([
          cachedCourierGet(`${provider}:${baseUrl}:wilayas`, `${baseUrl}/wilayas/`, yalHeaders),
          cachedCourierGet(
            `${provider}:${baseUrl}:communes:${toWilayaCode}`,
            `${baseUrl}/communes/?wilaya_id=${toWilayaCode}`,
            yalHeaders
          ),
          isStopDesk
            ? cachedCourierGet(
                `${provider}:${baseUrl}:centers:${toWilayaCode}`,
                `${baseUrl}/centers/?wilaya_id=${toWilayaCode}`,
                yalHeaders
              )
            : Promise.resolve(null)
        ]);

        const wilayasList: any[] = Array.isArray(wilayasJson?.data) ? wilayasJson.data : [];
        const matchedFromWilaya = wilayasList.find(w => Number(w.id) === fromWilayaCode);
        const matchedToWilaya = wilayasList.find(w => Number(w.id) === toWilayaCode);

        const fromWilayaResolved =
          matchedFromWilaya?.name ||
          (hasArabicChars(cfg.courierFromWilayaName)
            ? stripLatinDiacritics(fromWilayaMeta.nameFr) === 'alger'
              ? 'Alger'
              : fromWilayaMeta.nameFr
            : (cfg.courierFromWilayaName || fromWilayaMeta.nameFr).trim());

        const toWilayaResolved = matchedToWilaya?.name || toWilayaMeta.nameFr;

        const communesList: any[] = Array.isArray(communesJson?.data) ? communesJson.data : [];
        const deliverableCommunes = communesList.filter(c => c?.is_deliverable !== false);
        const poolCommunes = deliverableCommunes.length > 0 ? deliverableCommunes : communesList;
        const communeCandidates = poolCommunes
          .map(c => ({
            name: String(c?.name || '').trim(),
            preferred: Boolean(c?.has_stop_desk)
          }))
          .filter(c => Boolean(c.name));

        const desiredCommune = String(order.commune || toWilayaMeta.nameFr).trim();
        let toCommuneResolved = desiredCommune;
        if (communeCandidates.length > 0) {
          toCommuneResolved = pickBestCandidateName(
            desiredCommune,
            communeCandidates,
            toWilayaResolved
          );
        } else if (hasArabicChars(desiredCommune)) {
          toCommuneResolved = toWilayaResolved;
        }

        let stopdeskId: number | undefined;
        if (isStopDesk) {
          const centersList: any[] = Array.isArray(centersJson?.data) ? centersJson.data : [];
          if (centersList.length > 0) {
            const centerByCommune = centersList.find(
              c =>
                stripLatinDiacritics(c?.commune_name || '') ===
                stripLatinDiacritics(toCommuneResolved)
            );
            const chosenCenter = centerByCommune || centersList[0];
            if (chosenCenter?.center_id) {
              stopdeskId = Number(chosenCenter.center_id);
              if (chosenCenter.commune_name) {
                toCommuneResolved = String(chosenCenter.commune_name).trim();
              }
            }
          }
        }

        const parcelItem: Record<string, any> = {
          order_id: order.orderNumber,
          from_wilaya_name: fromWilayaResolved,
          firstname: firstName,
          familyname: familyName,
          contact_phone: cleanPhone,
          address: order.address || `${toWilayaResolved} - ${toCommuneResolved}`,
          to_commune_name: toCommuneResolved,
          to_wilaya_name: toWilayaResolved,
          product_list: productList,
          price: Math.round(Number(order.total || 0)),
          do_insurance: false,
          declared_value: Math.round(Number(order.total || 0)),
          freeshipping: Number(order.shippingFee || 0) === 0,
          is_stopdesk: isStopDesk,
          has_exchange: false
        };
        if (isStopDesk && stopdeskId) {
          parcelItem.stopdesk_id = stopdeskId;
        }

        const result = await fetchJsonWithTimeout(`${baseUrl}/parcels/`, {
          method: 'POST',
          headers: {
            'X-API-ID': apiId,
            'X-API-TOKEN': apiToken,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify([parcelItem])
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
        const errDetail =
          orderEntry?.message || extractCourierApiError(result.json, result.text);
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `لم يتم قبول الطرد من ${label}: ${errDetail || `HTTP ${result.status}`}`
        });
        return;
      }

      if (provider === 'zrexpress' || provider === 'procolis') {
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
              IDWilaya: String(toWilayaCode),
              Commune: order.commune || toWilayaMeta.nameFr,
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
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const firstRes = Array.isArray(result.json?.Colis) ? result.json.Colis[0] : result.json;
        const trackingCode = firstRes?.Tracking || result.json?.Tracking || order.orderNumber;
        const hasZrError =
          !result.ok ||
          result.json?.Statut === 'Error' ||
          firstRes?.Statut === 'Error' ||
          firstRes?.Retour === 'Error';

        if (!hasZrError) {
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
        const zrErr =
          firstRes?.Message ||
          result.json?.Message ||
          extractCourierApiError(result.json, result.text);
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `فشل إرسال الطرد إلى ${label}: ${zrErr || `HTTP ${result.status}`}`
        });
        return;
      }

      if (provider === 'ecotrack') {
        const ecoHeaders = {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json'
        };
        const communesJson = await cachedCourierGet(
          `ecotrack:${baseUrl}:communes:${toWilayaCode}`,
          `${baseUrl}/get/communes?wilaya_id=${toWilayaCode}`,
          ecoHeaders
        );
        const flattenCommuneEntries = (raw: any): any[] => {
          if (Array.isArray(raw)) return raw;
          if (Array.isArray(raw?.data)) return raw.data;
          if (raw && typeof raw === 'object') {
            const vals = Object.values(raw);
            const items: any[] = [];
            vals.forEach(v => {
              if (Array.isArray(v)) items.push(...v);
              else if (v && typeof v === 'object' && ('nom' in v || 'commune' in v || 'name' in v)) {
                items.push(v);
              }
            });
            return items;
          }
          return [];
        };

        const allEntries = flattenCommuneEntries(communesJson);
        const hasWilayaField = allEntries.some(
          c => c?.wilaya_id !== undefined && c?.wilaya_id !== null
        );
        const wilayaEntries = hasWilayaField
          ? allEntries.filter(c => Number(c?.wilaya_id) === toWilayaCode)
          : allEntries;
        const poolEntries = wilayaEntries.length > 0 ? wilayaEntries : allEntries;

        const isTruthFlag = (val: any) =>
          val === 1 || val === true || val === '1' || String(val).toLowerCase() === 'true';

        const ecoCandidates = poolEntries
          .map(c => ({
            name: String(c?.nom || c?.commune || c?.name || '').trim(),
            arName: String(c?.ar_name || c?.nom_ar || '').trim(),
            hasStopDesk: isTruthFlag(c?.has_stop_desk) || isTruthFlag(c?.stop_desk) || isTruthFlag(c?.is_stopdesk)
          }))
          .filter(c => Boolean(c.name));

        const stopDeskCandidates = ecoCandidates.filter(c => c.hasStopDesk);
        const desiredCommune = String(order.commune || toWilayaMeta.nameFr).trim();

        const pickPool =
          isStopDesk && stopDeskCandidates.length > 0 ? stopDeskCandidates : ecoCandidates;

        let resolvedCommune = desiredCommune;
        if (pickPool.length > 0) {
          resolvedCommune = pickBestCandidateName(
            desiredCommune,
            pickPool.map(c => ({ name: c.name, arName: c.arName, preferred: c.hasStopDesk })),
            toWilayaMeta.nameFr
          );
        } else if (hasArabicChars(desiredCommune)) {
          resolvedCommune = toWilayaMeta.nameFr;
        }

        const buildEcoPayload = (communeName: string, extraNote = '') => {
          const baseNote = String(order.notes || '').trim();
          const combinedNote = [baseNote, extraNote].filter(Boolean).join(' | ');
          return {
            reference: order.orderNumber,
            nom_client: order.customerName,
            telephone: cleanPhone,
            adresse: order.address || `${toWilayaMeta.nameFr} - ${communeName}`,
            code_wilaya: toWilayaCode,
            commune: communeName,
            montant: Math.round(Number(order.total || 0)),
            type: 1,
            stop_desk: isStopDesk ? 1 : 0,
            produit: productList,
            remarque: combinedNote
          };
        };

        const sendEcoOrder = (communeName: string, extraNote = '') =>
          fetchJsonWithTimeout(`${baseUrl}/create/order`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(buildEcoPayload(communeName, extraNote))
          });

        let result = await sendEcoOrder(
          resolvedCommune,
          isStopDesk && desiredCommune && !desiredCommune.includes(resolvedCommune)
            ? `Stop Desk - بلدية الزبون: ${desiredCommune}`
            : ''
        );

        let trackingCode = String(
          result.json?.tracking ||
            result.json?.data?.tracking ||
            result.json?.order?.tracking ||
            ''
        ).trim();

        // If Ecotrack rejects Stop Desk on this commune, retry with likely stop-desk hub communes in the same wilaya
        if ((!result.ok || !trackingCode) && isStopDesk) {
          const errFirst = extractCourierApiError(result.json, result.text).toLowerCase();
          if (errFirst.includes('stop_desk') || errFirst.includes('stop desk')) {
            const tried = new Set<string>([resolvedCommune.toLowerCase()]);
            const fallbackNames: string[] = [];

            for (const c of stopDeskCandidates) {
              if (!tried.has(c.name.toLowerCase())) fallbackNames.push(c.name);
            }
            const wilayaNorm = stripLatinDiacritics(toWilayaMeta.nameFr);
            const sortedHubMatches = ecoCandidates
              .filter(c => {
                const n = stripLatinDiacritics(c.name);
                return (
                  n === wilayaNorm ||
                  n === `${wilayaNorm} centre` ||
                  n.includes('centre') ||
                  n.startsWith(wilayaNorm)
                );
              })
              .map(c => c.name);
            for (const hub of [...sortedHubMatches, toWilayaMeta.nameFr, ...ecoCandidates.slice(0, 4).map(c => c.name)]) {
              if (hub && !tried.has(hub.toLowerCase()) && !fallbackNames.includes(hub)) {
                fallbackNames.push(hub);
              }
            }

            for (const altCommune of fallbackNames.slice(0, 4)) {
              tried.add(altCommune.toLowerCase());
              const retryRes = await sendEcoOrder(
                altCommune,
                `Stop Desk - بلدية الزبون: ${desiredCommune}`
              );
              const retryTrack = String(
                retryRes.json?.tracking ||
                  retryRes.json?.data?.tracking ||
                  retryRes.json?.order?.tracking ||
                  ''
              ).trim();
              if (retryRes.ok && retryTrack) {
                result = retryRes;
                trackingCode = retryTrack;
                break;
              }
            }
          }
        }

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
        const errDetail = extractCourierApiError(result.json, result.text);
        const isStopDeskUnavailable =
          errDetail.toLowerCase().includes('stop_desk') ||
          errDetail.toLowerCase().includes('stop desk');
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: isStopDeskUnavailable
            ? `مكتب الشحن (Stop Desk) غير متوفر لهذه البلدية أو الولاية لدى ${label} (${errDetail}). يرجى فتح الطلب وتعديل طريقة التوصيل إلى "للمنزل" أو اختيار بلدية بها مكتب شحن.`
            : `لم يتم قبول الطرد من ${label}: ${errDetail || `HTTP ${result.status}`}`
        });
        return;
      }

      if (provider === 'maystro') {
        const payload = {
          external_id: order.orderNumber,
          customer_name: order.customerName,
          customer_phone: cleanPhone,
          wilaya: toWilayaCode,
          commune_name: order.commune || toWilayaMeta.nameFr,
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
            'Content-Type': 'application/json',
            Accept: 'application/json'
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
        const errDetail = extractCourierApiError(result.json, result.text);
        res.json({
          ok: false,
          latencyMs: result.latencyMs,
          message: `فشل إرسال الطرد إلى ${label}: ${errDetail || `HTTP ${result.status}`}`
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

  app.post('/api/integrations/google-sheet-read', async (req: Request, res: Response) => {
    const webhookUrl = String(req.body?.webhookUrl || '').trim();
    const action = String(req.body?.action || '').trim();
    const orderId = String(req.body?.orderId || '').trim();
    if (!webhookUrl) {
      res.json({ ok: false, data: null });
      return;
    }

    try {
      const target = new URL(webhookUrl);
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        res.json({ ok: false, data: null });
        return;
      }
      if (action) target.searchParams.set('action', action);
      if (orderId) target.searchParams.set('orderId', orderId);
      const result = await fetchJsonWithTimeout(
        target.toString(),
        { method: 'GET', redirect: 'follow', headers: { Accept: 'application/json' } },
        8000
      );
      if (result.ok && result.json && typeof result.json === 'object') {
        res.json({ ok: true, data: result.json });
        return;
      }
      res.json({ ok: false, data: null });
    } catch {
      res.json({ ok: false, data: null });
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
      contentId = '',
      numItems = 1,
      pixelId: incomingPixelId = '',
      customerPhone = '',
      customerName = '',
      wilayaName = '',
      fbp = '',
      fbc = '',
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
    const nameTokens = String(customerName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameTokens[0] || '';
    const lastName = nameTokens.slice(1).join(' ') || '';
    const effectiveMetaPixelId = String(incomingPixelId || cfg.metaPixelId || '').trim();
    const results: Record<string, { ok: boolean; message: string; latencyMs?: number }> = {};

    if (
      (target === 'all' || target === 'meta') &&
      (cfg.metaCapiEnabled || isTest) &&
      effectiveMetaPixelId &&
      cfg.metaCapiToken
    ) {
      const userData: Record<string, any> = {
        client_ip_address: clientIp || undefined,
        client_user_agent: userAgent || undefined,
        ph: e164Phone ? [sha256(e164Phone)] : undefined,
        fn: firstName ? [sha256(firstName)] : undefined,
        ln: lastName ? [sha256(lastName)] : undefined,
        ct: wilayaName ? [sha256(wilayaName)] : undefined,
        country: [sha256('dz')],
        external_id: e164Phone ? [sha256(e164Phone)] : orderNumber ? [sha256(String(orderNumber))] : undefined
      };
      if (String(fbp || '').trim()) userData.fbp = String(fbp).trim();
      if (String(fbc || '').trim()) userData.fbc = String(fbc).trim();

      const resolvedContentId = String(contentId || orderNumber || '').trim();
      const metaEventPayload: any = {
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId || `${orderNumber || 'evt'}_${Date.now()}`,
            action_source: 'website',
            event_source_url: pageUrl || undefined,
            user_data: userData,
            custom_data: {
              currency: 'DZD',
              value: Number(value) || 0,
              content_type: 'product',
              content_ids: resolvedContentId ? [resolvedContentId] : undefined,
              num_items: Number(numItems) || 1,
              content_name: contentName || undefined,
              order_id: orderNumber || undefined
            }
          }
        ]
      };
      // Only attach test_event_code on explicit test requests; attaching it to real orders excludes them from Ads Manager attribution!
      if (isTest && cfg.metaTestEventCode?.trim()) {
        metaEventPayload.test_event_code = cfg.metaTestEventCode.trim();
      }

      try {
        const metaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(effectiveMetaPixelId)}/events?access_token=${encodeURIComponent(cfg.metaCapiToken.trim())}`;
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
      if (isTest && cfg.tiktokTestEventCode?.trim()) {
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

    let message =
      `السلام عليكم ${customerName}،\n` +
      `تم استلام طلبك رقم ${orderNumber} من متجر ${storeName || 'المتجر'}.\n` +
      `المنتج: ${bundleDetails}\n` +
      `العنوان: ${wilayaName}${commune ? ' - ' + commune : ''}\n` +
      `المبلغ عند الاستلام: ${Math.round(Number(total) || 0)} دج\n` +
      `سنتواصل معك قريباً لتأكيد الإرسال.`;

    if (cfg.whatsappConfirmTemplate && cfg.whatsappConfirmTemplate.trim()) {
      const vars: Record<string, string> = {
        customerName: String(customerName),
        orderNumber: String(orderNumber),
        storeName: String(storeName || 'المتجر'),
        bundle: String(bundleDetails),
        total: `${Math.round(Number(total) || 0)} دج`,
        wilaya: String(wilayaName),
        commune: String(commune),
        deliveryType: 'توصيل',
        shippingCost: '',
        trackingCode: '',
        storePhone: ''
      };
      let rendered = cfg.whatsappConfirmTemplate;
      Object.entries(vars).forEach(([k, v]) => {
        rendered = rendered.split(`{${k}}`).join(v);
      });
      message = rendered.trim();
    }

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

  // 7. Anti-Fraud COD Pre-Check (Blacklist + Daily Order Limit per Phone)
  app.post('/api/orders/fraud-check', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const rawPhone = String(req.body?.phone || '').trim();
    const record = req.body?.record !== false;

    if (!storeId || !rawPhone) {
      res.json({ ok: true, allowed: true });
      return;
    }

    const cfg = await getOrFetchServerConfig(storeId);
    if (!cfg || cfg.antiFraudEnabled === false) {
      res.json({ ok: true, allowed: true });
      return;
    }

    const canonicalPhone = normalizeLocalPhone(rawPhone);
    const phoneKey = `${storeId}:${canonicalPhone}`;

    // 1. Check Blacklist
    const blacklisted = Array.isArray(cfg.blacklistedPhones) ? cfg.blacklistedPhones : [];
    const isBlocked = blacklisted.some(
      entry => normalizeLocalPhone(entry?.phone) === canonicalPhone && canonicalPhone.length >= 9
    );
    if (isBlocked) {
      res.json({
        ok: true,
        allowed: false,
        code: 'blacklisted',
        message: 'عذراً، تعذر تأكيد تسجيل الطلب لهذا الرقم حالياً. يرجى التواصل معنا عبر واتساب للمساعدة.'
      });
      return;
    }

    // 2. Check Daily Order Limit (last 24h)
    const dailyLimit = Number(cfg.dailyMaxOrdersPerPhone ?? 2);
    if (dailyLimit > 0 && canonicalPhone.length >= 9) {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const prevTs = (recentPhoneOrdersMap.get(phoneKey) || []).filter(ts => ts >= dayAgo);
      recentPhoneOrdersMap.set(phoneKey, prevTs);

      let dbRecentCount = 0;
      const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
      const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      if (supabaseUrl && serviceRoleKey) {
        try {
          const suffix = canonicalPhone.slice(-8);
          const sinceIso = new Date(dayAgo).toISOString();
          const qUrl =
            `${supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}` +
            `&created_at=gte.${encodeURIComponent(sinceIso)}` +
            `&customer_phone=ilike.*${encodeURIComponent(suffix)}*` +
            `&status=neq.cancelled&select=id,customer_phone`;
          const dbRes = await fetchJsonWithTimeout(
            qUrl,
            {
              method: 'GET',
              headers: {
                apikey: serviceRoleKey,
                ...(serviceRoleKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
                Accept: 'application/json'
              }
            },
            3500
          );
          if (dbRes.ok && Array.isArray(dbRes.json)) {
            dbRecentCount = dbRes.json.filter(
              (r: any) => normalizeLocalPhone(r?.customer_phone) === canonicalPhone
            ).length;
          }
        } catch {
          // non-fatal fallback to in-memory map
        }
      }

      const effectiveCount = Math.max(prevTs.length, dbRecentCount);
      if (effectiveCount >= dailyLimit) {
        res.json({
          ok: true,
          allowed: false,
          code: 'daily_limit',
          message: `تم بلوغ الحد الأقصى للطلبات المسموح بها لهذا الرقم اليوم (${dailyLimit} طلب خلال 24 ساعة). يمكنك متابعة أو تعديل طلبك السابق عبر صفحة التتبع.`
        });
        return;
      }

      if (record) {
        prevTs.push(now);
        recentPhoneOrdersMap.set(phoneKey, prevTs);
      }
    }

    res.json({ ok: true, allowed: true });
  });

  // 8. Public Storefront Settings (WhatsApp templates, favicon, and public Pixel IDs - non-secret)
  app.get('/api/store/public-settings', async (req: Request, res: Response) => {
    const storeId = String(req.query?.storeId || '').trim();
    if (!storeId) {
      res.json({
        ok: true,
        whatsappConfirmTemplate: '',
        whatsappShippingTemplate: '',
        faviconUrl: '',
        metaPixelId: '',
        tiktokPixelId: ''
      });
      return;
    }
    const cfg = await getOrFetchServerConfig(storeId);
    res.json({
      ok: true,
      whatsappConfirmTemplate: cfg?.whatsappConfirmTemplate || '',
      whatsappShippingTemplate: cfg?.whatsappShippingTemplate || '',
      faviconUrl: cfg?.faviconUrl || '',
      metaPixelId: cfg?.metaPixelId || '',
      tiktokPixelId: cfg?.tiktokPixelId || ''
    });
  });

  // 9. Public Storefront Promo Coupon Validator
  app.post('/api/store/validate-promo', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const rawCode = String(req.body?.code || '').trim().toUpperCase();
    const subtotal = Math.max(0, Number(req.body?.subtotal) || 0);

    if (!rawCode) {
      res.json({ ok: true, valid: false, message: 'يرجى إدخال رمز الكوبون' });
      return;
    }

    const cfg = storeId ? await getOrFetchServerConfig(storeId) : undefined;
    const coupons = Array.isArray(cfg?.promoCoupons) ? cfg.promoCoupons : [];
    const found = coupons.find(c => String(c.code || '').trim().toUpperCase() === rawCode);

    if (!found) {
      res.json({ ok: true, valid: false, notFoundOnServer: coupons.length === 0, message: 'كود الخصم غير صحيح أو منتهي الصلاحية' });
      return;
    }
    if (!found.isActive) {
      res.json({ ok: true, valid: false, message: 'هذا الكوبون متوقف حالياً' });
      return;
    }
    const minOrder = Number(found.minOrder) || 0;
    if (minOrder > 0 && subtotal < minOrder) {
      res.json({
        ok: true,
        valid: false,
        message: `هذا الكوبون يتطلب حداً أدنى للطلب قدره ${Math.round(minOrder)} دج`
      });
      return;
    }

    const rawDiscount =
      found.type === 'percent'
        ? Math.round((subtotal * Math.min(100, Math.max(0, Number(found.value) || 0))) / 100)
        : Math.max(0, Number(found.value) || 0);
    const discount = Math.min(subtotal, rawDiscount);
    const reason =
      found.type === 'percent'
        ? `كوبون ${found.code} (${found.value}%)`
        : `كوبون ${found.code} (-${found.value} دج)`;

    res.json({
      ok: true,
      valid: true,
      code: found.code,
      type: found.type,
      value: found.value,
      discount,
      reason
    });
  });

  return app;
}
