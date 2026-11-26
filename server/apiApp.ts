import express from 'express';
import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ECOTRACK_WILAYA_HUB,
  resolveOfficialEcotrackCommune
} from '../src/data/ecotrackCommunes.ts';
import {
  isRealSheetOrderRow,
  validateAlgerianPhone,
  validateCustomerName
} from '../src/utils/orderValidation.ts';

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

const RUNTIME_ABANDONED_PATH = process.env.VERCEL
  ? '/tmp/.brightdz-abandoned-cache.json'
  : path.resolve(process.cwd(), '.brightdz-abandoned-cache.json');

const storeConfigMap = new Map<string, ServerStoreApiConfig>();
const recentPhoneOrdersMap = new Map<string, number[]>();
const recentIpOrdersMap = new Map<string, number[]>();

interface CachedAbandonedOrder {
  id: string;
  sessionId: string;
  storeId: string;
  landingPageId?: string;
  landingPageTitle?: string;
  offerId?: string;
  bundleLabel?: string;
  variantLabel?: string;
  customerName?: string;
  customerPhone: string;
  wilayaId?: string;
  wilayaName?: string;
  commune?: string;
  deliveryType: 'home' | 'stop';
  subtotal: number;
  shippingFee: number;
  total: number;
  status: 'new' | 'contacted' | 'recovered' | 'dismissed';
  recoveredOrderNumber?: string;
  contactedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const abandonedByStoreMap = new Map<string, Map<string, CachedAbandonedOrder>>();
const deletedAbandonedByStore = new Map<string, Set<string>>();

function getServerDeletedAbandonedSet(storeId: string): Set<string> {
  let set = deletedAbandonedByStore.get(storeId);
  if (!set) {
    set = new Set<string>();
    deletedAbandonedByStore.set(storeId, set);
  }
  return set;
}

function loadPersistedAbandonedOrders() {
  try {
    if (fs.existsSync(RUNTIME_ABANDONED_PATH)) {
      const raw = fs.readFileSync(RUNTIME_ABANDONED_PATH, 'utf8');
      const parsed = JSON.parse(raw) as any;
      const itemsObj: Record<string, CachedAbandonedOrder[]> =
        parsed && typeof parsed === 'object' && parsed.__v === 2 ? parsed.items || {} : parsed || {};
      const deletedObj: Record<string, string[]> =
        parsed && typeof parsed === 'object' && parsed.__v === 2 ? parsed.deleted || {} : {};

      Object.entries(deletedObj).forEach(([storeId, keys]) => {
        if (!Array.isArray(keys)) return;
        deletedAbandonedByStore.set(storeId, new Set(keys.map(k => String(k || '').trim()).filter(Boolean)));
      });

      Object.entries(itemsObj).forEach(([storeId, list]) => {
        if (!Array.isArray(list)) return;
        const delSet = deletedAbandonedByStore.get(storeId);
        const m = new Map<string, CachedAbandonedOrder>();
        list.forEach(item => {
          if (!item?.sessionId) return;
          if (delSet && (delSet.has(item.sessionId) || delSet.has(item.id))) return;
          m.set(item.sessionId, item);
        });
        abandonedByStoreMap.set(storeId, m);
      });
    }
  } catch {
    // non-fatal
  }
}

function persistAbandonedOrders() {
  try {
    const items: Record<string, CachedAbandonedOrder[]> = {};
    abandonedByStoreMap.forEach((m, storeId) => {
      items[storeId] = Array.from(m.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 300);
    });
    const deleted: Record<string, string[]> = {};
    deletedAbandonedByStore.forEach((set, storeId) => {
      deleted[storeId] = Array.from(set).slice(-600);
    });
    fs.writeFileSync(
      RUNTIME_ABANDONED_PATH,
      JSON.stringify({ __v: 2, items, deleted }, null, 2),
      'utf8'
    );
  } catch {
    // non-fatal
  }
}

loadPersistedAbandonedOrders();

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
  const cleanName = String(wilayaNameRaw || '').trim();
  const normLatin = stripLatinDiacritics(cleanName);
  const byExactName = cleanName
    ? WILAYA_ENTRIES.find(
        w =>
          w.nameAr === cleanName ||
          (normLatin && stripLatinDiacritics(w.nameFr) === normLatin)
      )
    : undefined;

  const numId = parseInt(String(wilayaIdRaw || ''), 10);
  const byCode =
    numId >= 1 && numId <= 58
      ? WILAYA_ENTRIES.find(w => w.code === String(numId).padStart(2, '0'))
      : undefined;

  // Prefer an exact wilayaName match if wilayaId was defaulted/mismatched
  if (byExactName && (!byCode || byCode.code !== byExactName.code)) {
    return byExactName;
  }
  if (byCode) return byCode;

  const byPartialName = cleanName
    ? WILAYA_ENTRIES.find(w => cleanName.includes(w.nameAr))
    : undefined;
  return byPartialName || WILAYA_ENTRIES[15];
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

function rankCandidateNames(
  desiredRaw: string,
  candidates: Array<{ name: string; arName?: string; preferred?: boolean }>,
  wilayaFallbackFr?: string
): string[] {
  if (candidates.length === 0) return [];
  const desiredTrim = String(desiredRaw || '').trim();
  const desiredHasAr = hasArabicChars(desiredTrim);
  const desiredLatin = desiredHasAr
    ? transliterateArabicToLatin(desiredTrim)
    : stripLatinDiacritics(desiredTrim);
  // Algerian Arabic often transliterates ق as g (Timgad, Guelma, Ouargla, Touggourt)
  const desiredLatinAltG = desiredHasAr
    ? transliterateArabicToLatin(desiredTrim.replace(/ق/g, 'g'))
    : desiredLatin;
  const wilayaNorm = stripLatinDiacritics(wilayaFallbackFr || '');

  const scored = candidates
    .map(cand => {
      const candLatin = stripLatinDiacritics(cand.name);
      if (!candLatin) return { name: cand.name, score: -1 };
      let score = Math.max(
        bigramScore(desiredLatin, candLatin),
        bigramScore(desiredLatinAltG, candLatin)
      );
      if (cand.arName && cand.arName.trim() === desiredTrim) score += 2.5;
      if (candLatin === desiredLatin || candLatin === desiredLatinAltG) score += 1.5;
      if (
        desiredLatin.length >= 4 &&
        (candLatin.includes(desiredLatin) || desiredLatin.includes(candLatin))
      ) {
        score += 0.35;
      }
      if (cand.preferred) score += 0.05;
      if (wilayaNorm && (candLatin === wilayaNorm || candLatin === `${wilayaNorm} centre`)) {
        score += 0.04;
      }
      return { name: cand.name, score };
    })
    .sort((a, b) => b.score - a.score);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item.name);
    }
  }
  return unique;
}

function pickBestCandidateName(
  desiredRaw: string,
  candidates: Array<{ name: string; arName?: string; preferred?: boolean }>,
  wilayaFallbackFr?: string
): string {
  const ranked = rankCandidateNames(desiredRaw, candidates, wilayaFallbackFr);
  return ranked[0] || desiredRaw;
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
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
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

        const isTruthFlag = (val: any) =>
          val === 1 || val === true || val === '1' || String(val).toLowerCase() === 'true';
        const isFalseFlag = (val: any) =>
          val === 0 || val === false || val === '0' || String(val).toLowerCase() === 'false';

        const META_OBJECT_KEYS = new Set([
          'success',
          'status',
          'message',
          'error',
          'errors',
          'code',
          'meta',
          'links'
        ]);

        const flattenEcotrackCommunes = (raw: any, inheritedWilayaId?: number): any[] => {
          if (!raw) return [];
          if (Array.isArray(raw)) {
            const out: any[] = [];
            for (const item of raw) {
              if (typeof item === 'string' && item.trim()) {
                out.push({ nom: item.trim(), wilaya_id: inheritedWilayaId });
              } else if (item && typeof item === 'object') {
                out.push(
                  inheritedWilayaId && item.wilaya_id === undefined
                    ? { ...item, wilaya_id: inheritedWilayaId }
                    : item
                );
              }
            }
            return out;
          }
          if (typeof raw === 'object') {
            if (Array.isArray(raw.data)) return flattenEcotrackCommunes(raw.data, inheritedWilayaId);
            if (raw.data && typeof raw.data === 'object') {
              return flattenEcotrackCommunes(raw.data, inheritedWilayaId);
            }
            if (Array.isArray(raw.communes)) {
              return flattenEcotrackCommunes(raw.communes, inheritedWilayaId);
            }
            if (raw.communes && typeof raw.communes === 'object') {
              return flattenEcotrackCommunes(raw.communes, inheritedWilayaId);
            }
            const items: any[] = [];
            for (const [k, v] of Object.entries(raw)) {
              if (META_OBJECT_KEYS.has(k.toLowerCase())) continue;
              const numericKey = /^\d{1,2}$/.test(k) ? Number(k) : undefined;
              if (Array.isArray(v)) {
                items.push(...flattenEcotrackCommunes(v, numericKey ?? inheritedWilayaId));
              } else if (typeof v === 'string' && v.trim()) {
                items.push({ nom: v.trim(), wilaya_id: inheritedWilayaId });
              } else if (v && typeof v === 'object') {
                const obj = v as Record<string, any>;
                const hasNameField =
                  'nom' in obj || 'commune' in obj || 'commune_name' in obj || 'name' in obj;
                const hasCommuneShape =
                  hasNameField ||
                  'wilaya_id' in obj ||
                  'code_wilaya' in obj ||
                  'has_stop_desk' in obj ||
                  'stop_desk' in obj ||
                  'code_postal' in obj;
                if (hasCommuneShape) {
                  items.push({
                    ...obj,
                    nom:
                      obj.nom ||
                      obj.commune ||
                      obj.commune_name ||
                      obj.name ||
                      (!/^\d+$/.test(k) ? k.trim() : ''),
                    wilaya_id:
                      obj.wilaya_id ??
                      obj.code_wilaya ??
                      obj.wilaya_code ??
                      obj.id_wilaya ??
                      inheritedWilayaId
                  });
                } else {
                  items.push(...flattenEcotrackCommunes(obj, numericKey ?? inheritedWilayaId));
                }
              }
            }
            return items;
          }
          return [];
        };

        const extractWilayaEntries = (rawJson: any) => {
          const all = flattenEcotrackCommunes(rawJson);
          const hasWilayaField = all.some(
            c =>
              c?.wilaya_id !== undefined &&
              c?.wilaya_id !== null &&
              String(c?.wilaya_id).trim() !== ''
          );
          const filtered = hasWilayaField
            ? all.filter(c => Number(c?.wilaya_id) === toWilayaCode)
            : all;
          return filtered;
        };

        let wilayaEntries: any[] = [];
        const byWilayaJson = await cachedCourierGet(
          `ecotrack:${baseUrl}:communes:${toWilayaCode}`,
          `${baseUrl}/get/communes?wilaya_id=${toWilayaCode}&api_token=${encodeURIComponent(apiToken)}`,
          ecoHeaders
        );
        wilayaEntries = extractWilayaEntries(byWilayaJson);

        // Fallback: fetch full communes catalog if per-wilaya query returned empty
        if (wilayaEntries.length === 0) {
          courierMetaCache.delete(`ecotrack:${baseUrl}:communes:${toWilayaCode}`);
          const allCommunesJson = await cachedCourierGet(
            `ecotrack:${baseUrl}:communes:all`,
            `${baseUrl}/get/communes?api_token=${encodeURIComponent(apiToken)}`,
            ecoHeaders
          );
          wilayaEntries = extractWilayaEntries(allCommunesJson);
        }

        const parsedCommunes = wilayaEntries
          .map(c => ({
            name: String(c?.nom || c?.commune || c?.commune_name || c?.name || '').trim(),
            arName: String(c?.ar_name || c?.nom_ar || c?.arabic_name || '').trim(),
            hasStopDesk:
              isTruthFlag(c?.has_stop_desk) ||
              isTruthFlag(c?.stop_desk) ||
              isTruthFlag(c?.is_stopdesk),
            isDisabled:
              isFalseFlag(c?.active) ||
              isFalseFlag(c?.is_active) ||
              isFalseFlag(c?.deliverable) ||
              isFalseFlag(c?.is_deliverable) ||
              isFalseFlag(c?.enabled) ||
              isTruthFlag(c?.suspend) ||
              isTruthFlag(c?.suspended) ||
              isTruthFlag(c?.disabled)
          }))
          .filter(c => Boolean(c.name));

        const activeCommunes = parsedCommunes.filter(c => !c.isDisabled);
        const ecoCandidates = activeCommunes.length > 0 ? activeCommunes : parsedCommunes;
        const stopDeskCandidates = ecoCandidates.filter(c => c.hasStopDesk);
        const desiredCommune = String(order.commune || toWilayaMeta.nameFr).trim();

        // Always resolve against the exact official 58-wilaya Ecotrack / 48Hr Express French communes table
        const officialPdfRes = resolveOfficialEcotrackCommune(toWilayaCode, order.commune);
        const officialHub = ECOTRACK_WILAYA_HUB[toWilayaCode] || officialPdfRes.commune;

        const pickPool =
          isStopDesk && stopDeskCandidates.length > 0 ? stopDeskCandidates : ecoCandidates;

        const rankedFromPool = rankCandidateNames(
          officialPdfRes.matched ? officialPdfRes.commune : desiredCommune,
          pickPool.map(c => ({ name: c.name, arName: c.arName, preferred: c.hasStopDesk })),
          officialHub
        );

        // Prefer exact official PDF commune spelling (cross-checked with live active pool when available)
        const exactInLivePool = pickPool.find(
          c => stripLatinDiacritics(c.name) === stripLatinDiacritics(officialPdfRes.commune)
        );

        let resolvedCommune = officialPdfRes.commune;
        if (exactInLivePool) {
          resolvedCommune = exactInLivePool.name;
        } else if (isStopDesk && rankedFromPool.length > 0) {
          resolvedCommune = rankedFromPool[0];
        } else if (!officialPdfRes.matched && rankedFromPool.length > 0) {
          resolvedCommune = rankedFromPool[0];
        }

        const staticWilayaFallbacks = Array.from(
          new Set(
            [
              officialHub,
              officialPdfRes.commune,
              ...officialPdfRes.ranked.slice(0, 4),
              toWilayaCode === 16 ? 'Alger Centre' : '',
              toWilayaCode === 16 ? 'Bab El Oued' : '',
              toWilayaCode === 16 ? 'Hydra' : ''
            ].filter(Boolean)
          )
        );

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

        const initialNote =
          desiredCommune &&
          stripLatinDiacritics(desiredCommune) !== stripLatinDiacritics(resolvedCommune)
            ? `${isStopDesk ? 'Stop Desk - ' : ''}بلدية الزبون: ${desiredCommune}`
            : '';

        let finalUsedCommune = resolvedCommune;
        let result = await sendEcoOrder(resolvedCommune, initialNote);

        let trackingCode = String(
          result.json?.tracking ||
            result.json?.data?.tracking ||
            result.json?.order?.tracking ||
            ''
        ).trim();

        // Auto-retry when Ecotrack rejects either stop_desk OR commune spelling/disabled/wilaya mismatch
        if (!result.ok || !trackingCode) {
          const errFirst = extractCourierApiError(result.json, result.text).toLowerCase();
          const isStopDeskErr =
            isStopDesk && (errFirst.includes('stop_desk') || errFirst.includes('stop desk'));
          const isCommuneErr =
            errFirst.includes('commune') ||
            errFirst.includes('mal écrite') ||
            errFirst.includes('mal ecrite') ||
            errFirst.includes('désactiv') ||
            errFirst.includes('desactiv') ||
            errFirst.includes('erron') ||
            errFirst.includes('appartient pas');

          if (isStopDeskErr || isCommuneErr) {
            const tried = new Set<string>([resolvedCommune.toLowerCase()]);
            const fallbackNames: string[] = [];
            const pushCandidate = (name: string) => {
              const clean = String(name || '').trim();
              if (!clean) return;
              const key = clean.toLowerCase();
              if (!tried.has(key) && !fallbackNames.some(f => f.toLowerCase() === key)) {
                fallbackNames.push(clean);
              }
            };

            // 1. Next-best ranked matches from the active pool
            for (const name of rankedFromPool.slice(1, 5)) {
              pushCandidate(name);
            }

            // 2. Stop-desk hubs when stop_desk order
            if (isStopDesk) {
              for (const c of stopDeskCandidates) pushCandidate(c.name);
            }

            // 3. Wilaya chef-lieu / centre hubs from Ecotrack catalog
            const wilayaNorm = stripLatinDiacritics(toWilayaMeta.nameFr);
            for (const c of ecoCandidates) {
              const n = stripLatinDiacritics(c.name);
              if (
                n === wilayaNorm ||
                n === `${wilayaNorm} centre` ||
                n.includes('centre') ||
                n.startsWith(wilayaNorm)
              ) {
                pushCandidate(c.name);
              }
            }

            // 4. Static ASCII chef-lieu names + top active communes in this wilaya
            for (const name of staticWilayaFallbacks) pushCandidate(name);
            for (const c of ecoCandidates.slice(0, 5)) pushCandidate(c.name);

            for (const altCommune of fallbackNames.slice(0, 6)) {
              tried.add(altCommune.toLowerCase());
              const retryRes = await sendEcoOrder(
                altCommune,
                `${isStopDesk ? 'Stop Desk - ' : ''}بلدية الزبون: ${desiredCommune}`
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
                finalUsedCommune = altCommune;
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
          const usedFallbackNote =
            finalUsedCommune.toLowerCase() !== resolvedCommune.toLowerCase()
              ? ` (تم اعتماد بلدية "${finalUsedCommune}" وإرفاق بلدية الزبون في الملاحظات)`
              : '';
          res.json({
            ok: true,
            trackingCode,
            labelUrl,
            provider,
            latencyMs: result.latencyMs,
            message: `تم إنشاء الطرد في ${label} وتوليد رمز التتبع ${trackingCode}${usedFallbackNote}`
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
      res.json({ ok: false, data: null, error: 'رابط Google Sheet غير محدد' });
      return;
    }

    try {
      const target = new URL(webhookUrl);
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        res.json({ ok: false, data: null, error: 'رابط Google Sheet غير صالح' });
        return;
      }
      if (action) target.searchParams.set('action', action);
      if (orderId) target.searchParams.set('orderId', orderId);
      const result = await fetchJsonWithTimeout(
        target.toString(),
        { method: 'GET', redirect: 'follow', headers: { Accept: 'application/json, text/plain, */*' } },
        16000
      );

      let parsed: any = result.json;
      if (!parsed && result.text) {
        const trimmed = result.text.trim();
        // Support JSONP-wrapped response if Apps Script returns callback(...)
        const jsonpMatch = trimmed.match(/^[a-zA-Z0-9_$.]+\(([\s\S]*)\);?$/);
        if (jsonpMatch && jsonpMatch[1]) {
          try {
            parsed = JSON.parse(jsonpMatch[1]);
          } catch {
            parsed = null;
          }
        }
      }

      if (result.ok && parsed && typeof parsed === 'object') {
        res.json({ ok: true, data: parsed });
        return;
      }

      if (result.text && (result.text.includes('<!DOCTYPE html') || result.text.includes('<html'))) {
        res.json({
          ok: false,
          data: null,
          error: 'رابط Google Sheet يعيد صفحة HTML بدلاً من JSON: تأكد من تحديث كود Apps Script (دالة doGet) ونشره بصلاحية "Anyone / أي شخص"'
        });
        return;
      }

      res.json({
        ok: false,
        data: null,
        error: `تعذر قراءة Google Sheet (HTTP ${result.status}) — تأكد من نشر كود doGet الصحيح`
      });
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      res.json({
        ok: false,
        data: null,
        error: isAbort
          ? 'انتهت مهلة الاتصال بـ Google Sheet — يرجى المحاولة مرة أخرى'
          : `تعذر الاتصال بـ Google Sheet: ${err?.message || 'خطأ شبكة'}`
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

  // 7. Anti-Fraud COD Pre-Check (Bot/Format Validation + IP Rate Limit + Blacklist + Daily Order Limit)
  app.post('/api/orders/fraud-check', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const rawPhone = String(req.body?.phone || '').trim();
    const rawName = req.body?.customerName !== undefined ? String(req.body.customerName || '').trim() : undefined;
    const honeypot = String(req.body?.honeypot || '').trim();
    const fillTimeMs = Number(req.body?.fillTimeMs);
    const record = req.body?.record !== false;

    // 0a. Bot trap & inhuman fill speed
    if (honeypot.length > 0) {
      res.json({
        ok: true,
        allowed: false,
        code: 'bot_detected',
        message: 'تعذر التحقق من الطلب، يرجى إعادة تحميل الصفحة والمحاولة مجدداً.'
      });
      return;
    }
    if (Number.isFinite(fillTimeMs) && fillTimeMs > 0 && fillTimeMs < 1200) {
      res.json({
        ok: true,
        allowed: false,
        code: 'too_fast',
        message: 'يرجى مراجعة معلوماتك قبل الضغط على تأكيد الطلب.'
      });
      return;
    }

    // 0b. Strict Algerian phone & customer name validation (always enforced to stop empty/fake orders)
    const phoneValidation = validateAlgerianPhone(rawPhone);
    if (!phoneValidation.valid) {
      res.json({
        ok: true,
        allowed: false,
        code: phoneValidation.code || 'invalid_phone',
        message: phoneValidation.error || 'يرجى إدخال رقم هاتف جزائري حقيقي وصحيح (05 / 06 / 07)'
      });
      return;
    }
    if (rawName !== undefined) {
      const nameValidation = validateCustomerName(rawName);
      if (!nameValidation.valid) {
        res.json({
          ok: true,
          allowed: false,
          code: nameValidation.code || 'invalid_name',
          message: nameValidation.error || 'يرجى إدخال الاسم الكامل بشكل صحيح'
        });
        return;
      }
    }

    if (!storeId) {
      res.json({ ok: true, allowed: true });
      return;
    }

    const cfg = await getOrFetchServerConfig(storeId);
    if (cfg && cfg.antiFraudEnabled === false) {
      res.json({ ok: true, allowed: true });
      return;
    }

    const canonicalPhone = normalizeLocalPhone(phoneValidation.normalized);
    const phoneKey = `${storeId}:${canonicalPhone}`;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // 1. Check Blacklist
    const blacklisted = Array.isArray(cfg?.blacklistedPhones) ? cfg.blacklistedPhones : [];
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

    // 2. IP-Based Burst & Daily Rate Limit (blocks rotating fake numbers from the same device/IP)
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientIp = forwardedFor || String(req.ip || req.socket?.remoteAddress || '').trim();
    const ipKey = clientIp ? `${storeId}:${clientIp}` : '';
    const dailyLimit = Number(cfg?.dailyMaxOrdersPerPhone ?? 2);
    if (ipKey) {
      const ipDailyTs = (recentIpOrdersMap.get(ipKey) || []).filter(ts => ts >= dayAgo);
      recentIpOrdersMap.set(ipKey, ipDailyTs);
      const fifteenMinAgo = now - 15 * 60 * 1000;
      const ipBurstCount = ipDailyTs.filter(ts => ts >= fifteenMinAgo).length;
      if (ipBurstCount >= 3) {
        res.json({
          ok: true,
          allowed: false,
          code: 'ip_burst_limit',
          message: 'تم إرسال عدة طلبات متتالية من نفس الجهاز في وقت قصير. يرجى الانتظار 15 دقيقة أو التواصل معنا عبر واتساب.'
        });
        return;
      }
      const ipDailyMax = Math.max(5, (dailyLimit > 0 ? dailyLimit : 2) * 3);
      if (ipDailyTs.length >= ipDailyMax) {
        res.json({
          ok: true,
          allowed: false,
          code: 'ip_daily_limit',
          message: 'تم بلوغ الحد الأقصى للطلبات المسموح بها من هذا الجهاز اليوم. يرجى التواصل معنا عبر واتساب للمساعدة.'
        });
        return;
      }
    }

    // 3. Check Daily Order Limit per Phone (last 24h)
    if (dailyLimit > 0 && canonicalPhone.length >= 9) {
      const prevTs = (recentPhoneOrdersMap.get(phoneKey) || []).filter(ts => ts >= dayAgo);
      recentPhoneOrdersMap.set(phoneKey, prevTs);

      let dbRecentCount = 0;
      const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
      const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
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

    if (record && ipKey) {
      const ipDailyTs = (recentIpOrdersMap.get(ipKey) || []).filter(ts => ts >= dayAgo);
      ipDailyTs.push(now);
      recentIpOrdersMap.set(ipKey, ipDailyTs);
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

  // 10. Authenticated Merchant Order Actions (Import missing Google Sheet orders + Delete orders)
  const verifySupabaseStoreOwner = async (
    req: Request,
    storeId: string
  ): Promise<
    | { ok: true; supabaseUrl: string; serviceRoleKey: string; userId: string }
    | { ok: false; status: number; code: string; message: string }
  > => {
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
      .trim()
      .replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
    const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        ok: false,
        status: 501,
        code: 'missing_service_key',
        message: 'مفتاح السيرفر SUPABASE_SERVICE_ROLE_KEY غير مضبوط'
      };
    }

    const authHeader = String(req.headers.authorization || '').trim();
    const accessToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!accessToken) {
      return { ok: false, status: 401, code: 'unauthorized', message: 'يرجى تسجيل الدخول كمالك المتجر أولاً' };
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)) {
      return { ok: false, status: 400, code: 'invalid_store', message: 'معرّف المتجر غير صالح' };
    }

    try {
      const userRes = await fetchJsonWithTimeout(
        `${supabaseUrl}/auth/v1/user`,
        {
          method: 'GET',
          headers: {
            apikey: anonKey || serviceRoleKey,
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        },
        6000
      );
      const userId = String(userRes.json?.id || '').trim();
      if (!userRes.ok || !userId) {
        return { ok: false, status: 401, code: 'invalid_session', message: 'انتهت جلسة تسجيل الدخول، يرجى تحديث الصفحة' };
      }

      const srHeaders: Record<string, string> = {
        apikey: serviceRoleKey,
        ...(serviceRoleKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
        Accept: 'application/json'
      };

      const storeRes = await fetchJsonWithTimeout(
        `${supabaseUrl}/rest/v1/stores?id=eq.${encodeURIComponent(storeId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
        { method: 'GET', headers: srHeaders },
        6000
      );
      const ownsStore = storeRes.ok && Array.isArray(storeRes.json) && storeRes.json.length > 0;
      if (!ownsStore) {
        const adminRes = await fetchJsonWithTimeout(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&role=eq.admin&select=id&limit=1`,
          { method: 'GET', headers: srHeaders },
          6000
        );
        const isAdmin = adminRes.ok && Array.isArray(adminRes.json) && adminRes.json.length > 0;
        if (!isAdmin) {
          return { ok: false, status: 403, code: 'forbidden', message: 'غير مصرح لك بتنفيذ هذا الإجراء على هذا المتجر' };
        }
      }

      return { ok: true, supabaseUrl, serviceRoleKey, userId };
    } catch (err: any) {
      return {
        ok: false,
        status: 500,
        code: 'verify_failed',
        message: `تعذر التحقق من الصلاحيات: ${err?.message || 'خطأ شبكة'}`
      };
    }
  };

  // 10b. AI copywriting for landing pages (Gemini, server-side key, store-owner only)
  const aiRateByStore = new Map<string, { count: number; resetAt: number }>();
  app.post('/api/ai/generate-copy', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const auth = await verifySupabaseStoreOwner(req, storeId);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, code: auth.code, message: auth.message });
      return;
    }
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(501).json({
        ok: false,
        code: 'missing_gemini_key',
        message: 'مفتاح GEMINI_API_KEY غير مضبوط في إعدادات Vercel.'
      });
      return;
    }

    const now = Date.now();
    const rate = aiRateByStore.get(storeId);
    if (rate && rate.resetAt > now && rate.count >= 20) {
      res.status(429).json({ ok: false, code: 'rate_limited', message: 'بلغت حد 20 توليدًا في الساعة، حاول لاحقًا.' });
      return;
    }
    aiRateByStore.set(
      storeId,
      rate && rate.resetAt > now ? { count: rate.count + 1, resetAt: rate.resetAt } : { count: 1, resetAt: now + 3600_000 }
    );

    const productName = String(req.body?.productName || '').trim().slice(0, 150);
    const details = String(req.body?.details || '').trim().slice(0, 800);
    const tone = String(req.body?.tone || 'مقنع وواضح').trim().slice(0, 60);
    const dialect = req.body?.dialect === 'darija' ? 'darija' : 'fusha';
    if (productName.length < 2) {
      res.status(400).json({ ok: false, code: 'missing_product', message: 'اكتب اسم المنتج أولاً.' });
      return;
    }

    const language =
      dialect === 'darija'
        ? 'اللهجة الجزائرية (الدارجة) المكتوبة بالحروف العربية، بسيطة ومفهومة'
        : 'العربية الفصحى المبسطة';
    const prompt = [
      'أنت كاتب إعلانات لمتجر إلكتروني جزائري يبيع بالدفع عند الاستلام.',
      `اكتب نص صفحة هبوط للمنتج: ${productName}.`,
      details ? `تفاصيل يعرفها التاجر: ${details}` : '',
      `اللغة: ${language}. النبرة: ${tone}.`,
      'القواعد: لا تخترع مواصفات أو أرقامًا أو ضمانات أو نتائج طبية غير مذكورة في التفاصيل. لا تذكر أسعارًا. لا مبالغة كاذبة.',
      'أعد JSON فقط بالحقول: title (عنوان المنتج، حتى 60 حرفًا)، highlightTitle (عبارة مميزة قصيرة تكمل العنوان، حتى 40 حرفًا)، description (وصف من 2 إلى 4 جمل قصيرة، حتى 400 حرف)، badgeText (شارة من كلمتين أو ثلاث).'
    ]
      .filter(Boolean)
      .join('\n');

    const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    try {
      const r = await fetchJsonWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  title: { type: 'STRING' },
                  highlightTitle: { type: 'STRING' },
                  description: { type: 'STRING' },
                  badgeText: { type: 'STRING' }
                },
                required: ['title', 'highlightTitle', 'description', 'badgeText']
              }
            }
          })
        },
        25000
      );
      if (!r.ok) {
        res.status(502).json({
          ok: false,
          code: 'gemini_error',
          message: 'رفض Gemini الطلب. تأكد من صحة المفتاح واسم النموذج (GEMINI_MODEL).'
        });
        return;
      }
      const text = String((r.json as any)?.candidates?.[0]?.content?.parts?.[0]?.text || '');
      const parsed = JSON.parse(text);
      const clip = (v: unknown, n: number) => String(v || '').trim().slice(0, n);
      res.json({
        ok: true,
        copy: {
          title: clip(parsed.title, 80),
          highlightTitle: clip(parsed.highlightTitle, 60),
          description: clip(parsed.description, 600),
          badgeText: clip(parsed.badgeText, 30)
        }
      });
    } catch {
      res.status(502).json({ ok: false, code: 'gemini_parse', message: 'تعذر قراءة رد الذكاء الاصطناعي، حاول مجدداً.' });
    }
  });

  app.post('/api/orders/import-from-sheet', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const rawOrders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    if (!storeId || rawOrders.length === 0) {
      res.json({ ok: true, importedCount: 0, skippedCount: 0 });
      return;
    }

    const auth = await verifySupabaseStoreOwner(req, storeId);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, code: auth.code, message: auth.message });
      return;
    }

    const allowedStatuses = new Set(['new', 'confirmed', 'shipping', 'delivered', 'cancelled']);
    const validWilayaCodes = new Set(WILAYA_ENTRIES.map(w => w.code));

    const payloadRows = rawOrders
      .slice(0, 200)
      .map((item: any) => {
        const orderNumber = String(item?.orderNumber || '').replace(/^#/, '').trim().toUpperCase();
        if (!orderNumber) return null;

        // Skip phantom/blank sheet rows (e.g. rows containing ONLY date and order number)
        if (
          !isRealSheetOrderRow({
            fullName: item?.customerName,
            phone: item?.customerPhone,
            wilaya: item?.wilayaName,
            orderName: item?.bundleLabel
          })
        ) {
          return null;
        }

        const rawWilayaId = String(item?.wilayaId || '').trim().padStart(2, '0');
        const wilayaEntry =
          WILAYA_ENTRIES.find(w => w.code === rawWilayaId) ||
          WILAYA_ENTRIES.find(
            w =>
              item?.wilayaName &&
              (w.nameAr === String(item.wilayaName).trim() ||
                String(item.wilayaName).trim().includes(w.nameAr) ||
                w.nameFr.toLowerCase() === String(item.wilayaName).trim().toLowerCase())
          ) ||
          WILAYA_ENTRIES[15]; // Default to 16 - الجزائر العاصمة

        const wilayaId = validWilayaCodes.has(wilayaEntry.code) ? wilayaEntry.code : '16';
        const wilayaName = String(item?.wilayaName || '').trim() || wilayaEntry.nameAr;
        const commune = String(item?.commune || '').trim().slice(0, 120);
        const deliveryType = item?.deliveryType === 'stop' ? 'stop' : 'home';
        const status = allowedStatuses.has(String(item?.status || ''))
          ? String(item.status)
          : 'new';
        const customerName = String(item?.customerName || '').trim().slice(0, 100);
        const customerPhone = String(item?.customerPhone || '').trim().slice(0, 30);
        const bundleLabel = String(item?.bundleLabel || '').trim().slice(0, 200) || 'طلب من Google Sheet';
        const subtotal = Math.max(0, Number(item?.subtotal) || 0);
        const shippingFee = Math.max(0, Number(item?.shippingFee) || 0);
        const total = Math.max(0, Number(item?.total) || subtotal + shippingFee);
        const trackingCode = String(item?.trackingCode || '').trim().slice(0, 120) || null;
        const address =
          String(item?.address || '').trim().slice(0, 250) ||
          `${wilayaName}${commune ? ' - ' + commune : ''}${deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''}`;
        const parsedDate = item?.createdAt ? new Date(item.createdAt) : null;
        const createdIso =
          parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : new Date().toISOString();

        return {
          order_number: orderNumber,
          store_id: storeId,
          landing_page_id:
            item?.landingPageId &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.landingPageId))
              ? String(item.landingPageId)
              : null,
          bundle_label: bundleLabel,
          customer_name: customerName,
          customer_phone: customerPhone,
          wilaya_id: wilayaId,
          wilaya_name: wilayaName,
          commune: commune || null,
          delivery_type: deliveryType,
          address,
          items: [
            {
              productId: String(item?.landingPageId || 'sheet_import'),
              title: bundleLabel,
              price: subtotal || total,
              quantity: 1,
              variantText: bundleLabel
            }
          ],
          subtotal: subtotal || Math.max(0, total - shippingFee),
          shipping_fee: shippingFee,
          total,
          status,
          tracking_code: trackingCode,
          status_history: [
            {
              status,
              timestamp: createdIso,
              note: 'تم استيراد الطلب تلقائياً من Google Sheet'
            }
          ],
          payment_method: 'cod',
          notes: 'مستورد من Google Sheet',
          created_at: createdIso
        };
      })
      .filter(Boolean);

    if (payloadRows.length === 0) {
      res.json({ ok: true, importedCount: 0, skippedCount: 0 });
      return;
    }

    try {
      const insertRes = await fetchJsonWithTimeout(
        `${auth.supabaseUrl}/rest/v1/orders?on_conflict=order_number`,
        {
          method: 'POST',
          headers: {
            apikey: auth.serviceRoleKey,
            ...(auth.serviceRoleKey.startsWith('eyJ')
              ? { Authorization: `Bearer ${auth.serviceRoleKey}` }
              : {}),
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'resolution=ignore-duplicates,return=representation'
          },
          body: JSON.stringify(payloadRows)
        },
        12000
      );

      if (!insertRes.ok) {
        res.status(insertRes.status || 500).json({
          ok: false,
          message: `تعذر استيراد الطلبات إلى قاعدة البيانات: ${extractCourierApiError(insertRes.json, insertRes.text)}`
        });
        return;
      }

      const inserted = Array.isArray(insertRes.json) ? insertRes.json : [];
      res.json({
        ok: true,
        importedCount: inserted.length,
        skippedCount: Math.max(0, payloadRows.length - inserted.length)
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        message: `تعذر استيراد الطلبات من Google Sheet: ${err?.message || 'خطأ شبكة'}`
      });
    }
  });

  app.post('/api/orders/delete', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const rawIds: unknown[] = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const orderIds = Array.from(
      new Set(
        rawIds
          .map(id => String(id || '').trim())
          .filter(id => uuidRegex.test(id))
      )
    );

    if (!storeId || orderIds.length === 0) {
      res.status(400).json({ ok: false, message: 'يرجى تحديد طلب واحد على الأقل للحذف' });
      return;
    }

    const auth = await verifySupabaseStoreOwner(req, storeId);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, code: auth.code, message: auth.message });
      return;
    }

    try {
      const inList = orderIds.join(',');
      const delRes = await fetchJsonWithTimeout(
        `${auth.supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}&id=in.(${inList})`,
        {
          method: 'DELETE',
          headers: {
            apikey: auth.serviceRoleKey,
            ...(auth.serviceRoleKey.startsWith('eyJ')
              ? { Authorization: `Bearer ${auth.serviceRoleKey}` }
              : {}),
            Accept: 'application/json',
            Prefer: 'return=representation'
          }
        },
        10000
      );

      if (!delRes.ok) {
        res.status(delRes.status || 500).json({
          ok: false,
          message: `تعذر حذف الطلبات: ${extractCourierApiError(delRes.json, delRes.text)}`
        });
        return;
      }

      const deletedRows = Array.isArray(delRes.json) ? delRes.json : [];
      res.json({ ok: true, deletedCount: deletedRows.length });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        message: `تعذر حذف الطلبات: ${err?.message || 'خطأ شبكة'}`
      });
    }
  });

  // 11. Abandoned Checkout Capture & Owner Recovery Endpoints
  const mapDbAbandonedRow = (row: any): CachedAbandonedOrder => ({
    id: String(row.id || ''),
    sessionId: String(row.session_id || row.sessionId || ''),
    storeId: String(row.store_id || row.storeId || ''),
    landingPageId: row.landing_page_id || row.landingPageId || undefined,
    landingPageTitle: row.landing_page_title || row.landingPageTitle || undefined,
    offerId: row.offer_id || row.offerId || undefined,
    bundleLabel: row.bundle_label || row.bundleLabel || undefined,
    variantLabel: row.variant_label || row.variantLabel || undefined,
    customerName: row.customer_name || row.customerName || undefined,
    customerPhone: String(row.customer_phone || row.customerPhone || ''),
    wilayaId: row.wilaya_id || row.wilayaId || undefined,
    wilayaName: row.wilaya_name || row.wilayaName || undefined,
    commune: row.commune || undefined,
    deliveryType: (row.delivery_type || row.deliveryType) === 'stop' ? 'stop' : 'home',
    subtotal: Number(row.subtotal) || 0,
    shippingFee: Number(row.shipping_fee ?? row.shippingFee) || 0,
    total: Number(row.total) || 0,
    status: (['new', 'contacted', 'recovered', 'dismissed'].includes(String(row.status))
      ? String(row.status)
      : 'new') as CachedAbandonedOrder['status'],
    recoveredOrderNumber: row.recovered_order_number || row.recoveredOrderNumber || undefined,
    contactedAt: row.contacted_at || row.contactedAt || undefined,
    notes: row.notes || undefined,
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.updatedAt || new Date().toISOString())
  });

  app.post(
    '/api/abandoned-orders/capture',
    express.text({ type: 'text/plain', limit: '64kb' }),
    async (req: Request, res: Response) => {
      let body: any = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      const storeId = String(body?.storeId || '').trim();
      const sessionId = String(body?.sessionId || '').trim().slice(0, 80);
      const action = String(body?.action || 'upsert').trim().toLowerCase();
      const honeypot = String(body?.honeypot || '').trim();

      if (!storeId || !sessionId || honeypot.length > 0) {
        res.json({ ok: false, ignored: true });
        return;
      }

      const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
        .trim()
        .replace(/\/+$/, '');
      const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
      const srHeaders: Record<string, string> = serviceRoleKey
        ? {
            apikey: serviceRoleKey,
            ...(serviceRoleKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        : {};
      const isStoreUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
      const nowIso = new Date().toISOString();

      // Mark session recovered when customer finishes real order
      if (action === 'recovered') {
        const orderNumber = String(body?.orderNumber || '').replace(/^#/, '').trim().toUpperCase();
        const storeMap = abandonedByStoreMap.get(storeId);
        if (storeMap?.has(sessionId)) {
          const prev = storeMap.get(sessionId)!;
          storeMap.set(sessionId, {
            ...prev,
            status: 'recovered',
            recoveredOrderNumber: orderNumber || prev.recoveredOrderNumber,
            updatedAt: nowIso
          });
          persistAbandonedOrders();
        }
        if (supabaseUrl && serviceRoleKey && isStoreUuid) {
          try {
            await fetchJsonWithTimeout(
              `${supabaseUrl}/rest/v1/abandoned_orders?store_id=eq.${encodeURIComponent(storeId)}&session_id=eq.${encodeURIComponent(sessionId)}`,
              {
                method: 'PATCH',
                headers: srHeaders,
                body: JSON.stringify({
                  status: 'recovered',
                  recovered_order_number: orderNumber || null,
                  updated_at: nowIso
                })
              },
              5000
            );
          } catch {
            // non-fatal
          }
        }
        res.json({ ok: true, recovered: true });
        return;
      }

      // Strict Algerian phone validation so fake numbers never pollute abandoned leads
      const phoneCheck = validateAlgerianPhone(String(body?.customerPhone || body?.phone || ''));
      if (!phoneCheck.valid) {
        res.json({ ok: false, ignored: true, code: phoneCheck.code || 'invalid_phone' });
        return;
      }

      const rawName = String(body?.customerName || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      const landingPageId =
        body?.landingPageId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.landingPageId))
          ? String(body.landingPageId)
          : undefined;
      const deliveryType: 'home' | 'stop' = body?.deliveryType === 'stop' ? 'stop' : 'home';
      const subtotal = Math.max(0, Number(body?.subtotal) || 0);
      const shippingFee = Math.max(0, Number(body?.shippingFee) || 0);
      const total = Math.max(0, Number(body?.total) || subtotal + shippingFee);

      // Ignore late debounces/beacons for sessions already deleted by merchant
      const delSet = deletedAbandonedByStore.get(storeId);
      if (delSet && delSet.has(sessionId)) {
        res.json({ ok: true, ignored: true, deleted: true });
        return;
      }

      let storeMap = abandonedByStoreMap.get(storeId);
      if (!storeMap) {
        storeMap = new Map<string, CachedAbandonedOrder>();
        abandonedByStoreMap.set(storeId, storeMap);
      }
      const existing = storeMap.get(sessionId);
      if (existing?.status === 'recovered') {
        res.json({ ok: true, ignored: true, alreadyRecovered: true });
        return;
      }

      const nextRecord: CachedAbandonedOrder = {
        id: existing?.id || `ab_${crypto.randomBytes(6).toString('hex')}`,
        sessionId,
        storeId,
        landingPageId: landingPageId || existing?.landingPageId,
        landingPageTitle: String(body?.landingPageTitle || '').trim().slice(0, 180) || existing?.landingPageTitle,
        offerId: String(body?.offerId || '').trim().slice(0, 80) || existing?.offerId,
        bundleLabel: String(body?.bundleLabel || '').trim().slice(0, 200) || existing?.bundleLabel,
        variantLabel: String(body?.variantLabel || '').trim().slice(0, 160) || existing?.variantLabel,
        customerName: rawName || existing?.customerName,
        customerPhone: phoneCheck.normalized,
        wilayaId: String(body?.wilayaId || '').trim().slice(0, 10) || existing?.wilayaId,
        wilayaName: String(body?.wilayaName || '').trim().slice(0, 100) || existing?.wilayaName,
        commune: String(body?.commune || '').trim().slice(0, 120) || existing?.commune,
        deliveryType,
        subtotal,
        shippingFee,
        total,
        status: existing?.status || 'new',
        recoveredOrderNumber: existing?.recoveredOrderNumber,
        contactedAt: existing?.contactedAt,
        notes: existing?.notes,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso
      };

      storeMap.set(sessionId, nextRecord);
      persistAbandonedOrders();

      // Persist to Supabase abandoned_orders table when available
      if (supabaseUrl && serviceRoleKey && isStoreUuid) {
        try {
          const upsertRes = await fetchJsonWithTimeout(
            `${supabaseUrl}/rest/v1/abandoned_orders?on_conflict=store_id,session_id`,
            {
              method: 'POST',
              headers: {
                ...srHeaders,
                Prefer: 'resolution=merge-duplicates,return=representation'
              },
              body: JSON.stringify({
                session_id: sessionId,
                store_id: storeId,
                landing_page_id: nextRecord.landingPageId || null,
                landing_page_title: nextRecord.landingPageTitle || null,
                offer_id: nextRecord.offerId || null,
                bundle_label: nextRecord.bundleLabel || null,
                variant_label: nextRecord.variantLabel || null,
                customer_name: nextRecord.customerName || null,
                customer_phone: nextRecord.customerPhone,
                wilaya_id: nextRecord.wilayaId || null,
                wilaya_name: nextRecord.wilayaName || null,
                commune: nextRecord.commune || null,
                delivery_type: nextRecord.deliveryType,
                subtotal: nextRecord.subtotal,
                shipping_fee: nextRecord.shippingFee,
                total: nextRecord.total,
                status: nextRecord.status,
                updated_at: nowIso
              })
            },
            6000
          );
          if (upsertRes.ok && Array.isArray(upsertRes.json) && upsertRes.json[0]?.id) {
            nextRecord.id = String(upsertRes.json[0].id);
            storeMap.set(sessionId, nextRecord);
            persistAbandonedOrders();
          }
        } catch {
          // fallback stays in server cache
        }
      }

      res.json({ ok: true, id: nextRecord.id, sessionId });
    }
  );

  app.get('/api/abandoned-orders/list', async (req: Request, res: Response) => {
    const storeId = String(req.query?.storeId || '').trim();
    if (!storeId) {
      res.json({ ok: true, items: [], needsSqlMigration: false, source: 'empty' });
      return;
    }

    const delSet = deletedAbandonedByStore.get(storeId);
    const cachedItems = Array.from(abandonedByStoreMap.get(storeId)?.values() || []).filter(
      item => !delSet || (!delSet.has(item.sessionId) && !delSet.has(item.id))
    );
    const isStoreUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    const hasAuthHeader = Boolean(req.headers.authorization);

    if (isStoreUuid && hasAuthHeader) {
      const auth = await verifySupabaseStoreOwner(req, storeId);
      if (auth.ok) {
        try {
          const dbRes = await fetchJsonWithTimeout(
            `${auth.supabaseUrl}/rest/v1/abandoned_orders?store_id=eq.${encodeURIComponent(storeId)}&order=updated_at.desc&limit=300`,
            {
              method: 'GET',
              headers: {
                apikey: auth.serviceRoleKey,
                ...(auth.serviceRoleKey.startsWith('eyJ')
                  ? { Authorization: `Bearer ${auth.serviceRoleKey}` }
                  : {}),
                Accept: 'application/json'
              }
            },
            8000
          );
          if (dbRes.ok && Array.isArray(dbRes.json)) {
            // Supabase is authoritative: NEVER resurrect stale RAM items from warm serverless instances
            const dbItems = dbRes.json
              .map(mapDbAbandonedRow)
              .filter(item => !delSet || (!delSet.has(item.sessionId) && !delSet.has(item.id)));
            const refreshedMap = new Map<string, CachedAbandonedOrder>();
            dbItems.forEach(item => refreshedMap.set(item.sessionId, item));
            abandonedByStoreMap.set(storeId, refreshedMap);
            persistAbandonedOrders();
            const sorted = dbItems.sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            res.json({ ok: true, items: sorted, needsSqlMigration: false, source: 'supabase' });
            return;
          }
          const errText = `${dbRes.text || ''} ${JSON.stringify(dbRes.json || {})}`;
          const missingTable = /42P01|does not exist|relation .*abandoned_orders|could not find the table/i.test(errText);
          res.json({
            ok: true,
            items: cachedItems.sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            ),
            needsSqlMigration: missingTable,
            source: 'cache'
          });
          return;
        } catch {
          // fall through to cached items
        }
      } else if (auth.code !== 'missing_service_key') {
        res.status(auth.status).json({ ok: false, code: auth.code, message: auth.message });
        return;
      }
    }

    res.json({
      ok: true,
      items: cachedItems.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
      needsSqlMigration: false,
      source: 'cache'
    });
  });

  app.post('/api/abandoned-orders/update', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const id = String(req.body?.id || '').trim();
    const sessionId = String(req.body?.sessionId || '').trim();
    const status = String(req.body?.status || '').trim();
    const recoveredOrderNumber = req.body?.recoveredOrderNumber !== undefined
      ? String(req.body.recoveredOrderNumber || '').trim()
      : undefined;
    const contactedAt = req.body?.contactedAt !== undefined
      ? String(req.body.contactedAt || '').trim()
      : undefined;
    const notes = req.body?.notes !== undefined ? String(req.body.notes || '').trim().slice(0, 400) : undefined;

    if (!storeId || (!id && !sessionId)) {
      res.status(400).json({ ok: false, message: 'معرّف الطلب المتروك غير صالح' });
      return;
    }

    const allowed = new Set(['new', 'contacted', 'recovered', 'dismissed']);
    const nextStatus = allowed.has(status) ? (status as CachedAbandonedOrder['status']) : undefined;
    const nowIso = new Date().toISOString();

    const isStoreUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    if (isStoreUuid && req.headers.authorization) {
      const auth = await verifySupabaseStoreOwner(req, storeId);
      if (!auth.ok && auth.code !== 'missing_service_key') {
        res.status(auth.status).json({ ok: false, code: auth.code, message: auth.message });
        return;
      }
      if (auth.ok) {
        const patch: Record<string, any> = { updated_at: nowIso };
        if (nextStatus) patch.status = nextStatus;
        if (recoveredOrderNumber !== undefined) patch.recovered_order_number = recoveredOrderNumber || null;
        if (contactedAt !== undefined) patch.contacted_at = contactedAt || null;
        if (notes !== undefined) patch.notes = notes || null;

        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const filter = uuidRe.test(id)
          ? `store_id=eq.${encodeURIComponent(storeId)}&id=eq.${encodeURIComponent(id)}`
          : `store_id=eq.${encodeURIComponent(storeId)}&session_id=eq.${encodeURIComponent(sessionId)}`;
        try {
          await fetchJsonWithTimeout(
            `${auth.supabaseUrl}/rest/v1/abandoned_orders?${filter}`,
            {
              method: 'PATCH',
              headers: {
                apikey: auth.serviceRoleKey,
                ...(auth.serviceRoleKey.startsWith('eyJ')
                  ? { Authorization: `Bearer ${auth.serviceRoleKey}` }
                  : {}),
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify(patch)
            },
            6000
          );
        } catch {
          // non-fatal
        }
      }
    }

    const storeMap = abandonedByStoreMap.get(storeId);
    if (storeMap) {
      for (const [k, item] of storeMap.entries()) {
        if (item.id === id || (sessionId && item.sessionId === sessionId)) {
          storeMap.set(k, {
            ...item,
            ...(nextStatus ? { status: nextStatus } : {}),
            ...(recoveredOrderNumber !== undefined ? { recoveredOrderNumber: recoveredOrderNumber || undefined } : {}),
            ...(contactedAt !== undefined ? { contactedAt: contactedAt || undefined } : {}),
            ...(notes !== undefined ? { notes: notes || undefined } : {}),
            updatedAt: nowIso
          });
        }
      }
      persistAbandonedOrders();
    }

    res.json({ ok: true });
  });

  app.post('/api/abandoned-orders/delete', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids.map((x: unknown) => String(x || '').trim()).filter(Boolean)
      : [];
    const sessionIds: string[] = Array.isArray(req.body?.sessionIds)
      ? req.body.sessionIds.map((x: unknown) => String(x || '').trim()).filter(Boolean)
      : [];

    if (!storeId || (ids.length === 0 && sessionIds.length === 0)) {
      res.status(400).json({ ok: false, message: 'يرجى تحديد عنصر واحد على الأقل للحذف' });
      return;
    }

    const isStoreUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    let deletedFromDb = false;
    if (isStoreUuid && req.headers.authorization) {
      const auth = await verifySupabaseStoreOwner(req, storeId);
      if (!auth.ok && auth.code !== 'missing_service_key') {
        res.status(auth.status).json({ ok: false, code: auth.code, message: auth.message });
        return;
      }
      if (auth.ok) {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const uuidIds = ids.filter(x => uuidRe.test(x));
        const restHeaders = {
          apikey: auth.serviceRoleKey,
          ...(auth.serviceRoleKey.startsWith('eyJ')
            ? { Authorization: `Bearer ${auth.serviceRoleKey}` }
            : {}),
          Accept: 'application/json'
        };
        try {
          if (uuidIds.length > 0) {
            const delIdRes = await fetchJsonWithTimeout(
              `${auth.supabaseUrl}/rest/v1/abandoned_orders?store_id=eq.${encodeURIComponent(storeId)}&id=in.(${uuidIds.join(',')})`,
              { method: 'DELETE', headers: restHeaders },
              8000
            );
            if (delIdRes.ok) deletedFromDb = true;
          }
          if (sessionIds.length > 0) {
            const encodedSessions = sessionIds.map(s => `"${s.replace(/"/g, '')}"`).join(',');
            const delSessRes = await fetchJsonWithTimeout(
              `${auth.supabaseUrl}/rest/v1/abandoned_orders?store_id=eq.${encodeURIComponent(storeId)}&session_id=in.(${encodeURIComponent(encodedSessions)})`,
              { method: 'DELETE', headers: restHeaders },
              8000
            );
            if (delSessRes.ok) deletedFromDb = true;
          }
        } catch {
          // non-fatal
        }
      }
    }

    const delSet = getServerDeletedAbandonedSet(storeId);
    ids.forEach(x => delSet.add(x));
    sessionIds.forEach(s => delSet.add(s));

    const storeMap = abandonedByStoreMap.get(storeId);
    if (storeMap) {
      const idSet = new Set(ids);
      const sessSet = new Set(sessionIds);
      for (const [k, item] of storeMap.entries()) {
        if (idSet.has(item.id) || sessSet.has(item.sessionId)) {
          storeMap.delete(k);
        }
      }
    }
    persistAbandonedOrders();

    res.json({ ok: true, deletedFromDb });
  });

  // Resolve a custom domain hostname to its store (public read-only helper)
  app.get('/api/store/resolve-domain', async (req: Request, res: Response) => {
    const rawHost = String(req.query?.host || req.headers.host || '').trim().toLowerCase();
    const cleanHost = rawHost
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .replace(/\.+$/, '')
      .replace(/^www\./i, '');

    if (!cleanHost || !cleanHost.includes('.')) {
      res.json({ ok: true, matched: false, host: cleanHost });
      return;
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const apiKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ''
    ).trim();

    if (supabaseUrl && apiKey) {
      try {
        const filter = `or=(custom_domain.ilike.${encodeURIComponent(cleanHost)},custom_domain.ilike.${encodeURIComponent('www.' + cleanHost)})`;
        const dbRes = await fetchJsonWithTimeout(
          `${supabaseUrl}/rest/v1/stores?select=id,name,subdomain,custom_domain&${filter}&limit=1`,
          {
            method: 'GET',
            headers: {
              apikey: apiKey,
              ...(apiKey.startsWith('eyJ') ? { Authorization: `Bearer ${apiKey}` } : {}),
              Accept: 'application/json'
            }
          },
          6000
        );
        if (dbRes.ok && Array.isArray(dbRes.json) && dbRes.json[0]) {
          res.json({
            ok: true,
            matched: true,
            host: cleanHost,
            store: {
              id: dbRes.json[0].id,
              name: dbRes.json[0].name,
              subdomain: dbRes.json[0].subdomain,
              customDomain: dbRes.json[0].custom_domain
            }
          });
          return;
        }
      } catch {
        // non-fatal
      }
    }

    res.json({ ok: true, matched: false, host: cleanHost });
  });

  // Same-origin image proxy fallback (used automatically when Facebook In-App Browser or external CDNs block direct image requests)
  app.get('/api/image-proxy', async (req: Request, res: Response) => {
    const rawUrl = String(req.query?.url || '').trim();
    if (!rawUrl || rawUrl.length > 2048) {
      res.status(400).send('Invalid image URL');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Malformed image URL');
      return;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.status(400).send('Unsupported protocol');
      return;
    }

    const host = parsed.hostname.toLowerCase();
    const isBlockedHost =
      !host ||
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^f[cd][0-9a-f]{2}:/i.test(host) ||
      /^fe80:/i.test(host);

    if (isBlockedHost) {
      res.status(403).send('Blocked host');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        }
      });

      if (!upstream.ok) {
        res.status(upstream.status === 404 ? 404 : 502).send('Image fetch failed');
        return;
      }

      const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
      const looksLikeImagePath = /\.(jpe?g|png|webp|gif|avif|bmp|ico|svg)(\?|$)/i.test(parsed.pathname);
      if (!contentType.startsWith('image/') && !(looksLikeImagePath && contentType.includes('octet-stream'))) {
        res.status(415).send('Not an image');
        return;
      }

      const contentLength = Number(upstream.headers.get('content-length') || 0);
      if (contentLength > 8 * 1024 * 1024) {
        res.status(413).send('Image too large');
        return;
      }

      const arrayBuf = await upstream.arrayBuffer();
      if (arrayBuf.byteLength > 8 * 1024 * 1024) {
        res.status(413).send('Image too large');
        return;
      }

      const finalType = contentType.startsWith('image/') ? contentType : 'image/jpeg';
      res.setHeader('Content-Type', finalType);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.status(200).send(Buffer.from(arrayBuf));
    } catch {
      res.status(504).send('Image proxy timeout');
    } finally {
      clearTimeout(timer);
    }
  });

  // Atomically append an Order Bump or 1-Click Post-Purchase Upsell to a freshly created order (status='new')
  app.post('/api/orders/append-addon', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const orderNumber = String(req.body?.orderNumber || '').replace(/^#/, '').trim().toUpperCase();
    const kind = req.body?.kind === 'bump' ? 'bump' : 'upsell';
    const title = String(req.body?.title || '').trim().slice(0, 160);
    const price = Math.max(0, Math.round(Number(req.body?.price) || 0));
    const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl).trim().slice(0, 1024) : undefined;
    const targetLandingPageId = req.body?.targetLandingPageId
      ? String(req.body.targetLandingPageId).trim()
      : undefined;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(storeId) || !orderNumber || !title || price <= 0 || price > 500000) {
      res.status(400).json({ ok: false, message: 'بيانات العرض الإضافي غير صالحة' });
      return;
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supabaseUrl || !serviceRoleKey) {
      res.status(503).json({ ok: false, code: 'missing_service_key', message: 'Supabase service key not configured' });
      return;
    }

    const restHeaders: Record<string, string> = {
      apikey: serviceRoleKey,
      ...(serviceRoleKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    try {
      const lookup = await fetchJsonWithTimeout(
        `${supabaseUrl}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`,
        { method: 'GET', headers: restHeaders },
        7000
      );
      if (!lookup.ok || !Array.isArray(lookup.json) || !lookup.json[0]) {
        res.status(404).json({ ok: false, message: 'لم يتم العثور على الطلب لتحديثه' });
        return;
      }

      const row = lookup.json[0];
      if (row.status !== 'new') {
        res.status(409).json({ ok: false, message: 'لا يمكن إضافة عرض بعد تأكيد الطلب أو شحنه' });
        return;
      }

      const createdTs = new Date(row.created_at || 0).getTime();
      if (createdTs > 0 && Date.now() - createdTs > 20 * 60 * 1000) {
        res.status(409).json({ ok: false, message: 'انتهت مهلة إضافة العرض الإضافي لهذا الطلب' });
        return;
      }

      const existingItems: any[] = Array.isArray(row.items) ? row.items : [];
      const alreadyApplied = existingItems.some(it => it && it.addonKind === kind);
      if (alreadyApplied) {
        res.json({
          ok: true,
          alreadyApplied: true,
          updated: {
            orderNumber: row.order_number,
            bundleLabel: row.bundle_label || '',
            subtotal: Number(row.subtotal || 0),
            shippingFee: Number(row.shipping_fee || 0),
            total: Number(row.total || 0),
            status: row.status
          }
        });
        return;
      }

      const baseLabel = String(row.bundle_label || existingItems[0]?.title || 'الطلب').trim();
      const addonTag = kind === 'bump' ? `عرض مكمّل: ${title}` : `عرض إضافي: ${title}`;
      const nextBundleLabel = `${baseLabel} + ${title}`.slice(0, 260);
      const nextSubtotal = Number(row.subtotal || 0) + price;
      const shippingFee = Number(row.shipping_fee || 0);
      const nextTotal = nextSubtotal + shippingFee;
      const nowIso = new Date().toISOString();

      const nextItems = [
        ...existingItems,
        {
          productId: targetLandingPageId || `addon_${kind}`,
          title,
          price,
          quantity: 1,
          bundleQuantity: 0,
          variantText: addonTag,
          ...(imageUrl ? { imageUrl } : {}),
          addonKind: kind
        }
      ];

      const existingHistory: any[] = Array.isArray(row.status_history) ? row.status_history : [];
      const nextHistory = [
        ...existingHistory,
        {
          status: row.status,
          timestamp: nowIso,
          note: `تمت إضافة ${addonTag} (+${price} دج) بدون مصاريف شحن إضافية`
        }
      ];

      const existingNotes = String(row.notes || '').trim();
      const nextNotes = [existingNotes, `${addonTag} (+${price} دج)`]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 480);

      const patchRes = await fetchJsonWithTimeout(
        `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            bundle_label: nextBundleLabel,
            items: nextItems,
            subtotal: nextSubtotal,
            total: nextTotal,
            notes: nextNotes,
            status_history: nextHistory,
            updated_at: nowIso
          })
        },
        7000
      );

      if (!patchRes.ok) {
        res.status(502).json({ ok: false, message: 'تعذر تحديث الطلب بالعرض الإضافي في قاعدة البيانات' });
        return;
      }

      res.json({
        ok: true,
        updated: {
          orderNumber: row.order_number,
          bundleLabel: nextBundleLabel,
          subtotal: nextSubtotal,
          shippingFee,
          total: nextTotal,
          status: row.status
        }
      });
    } catch {
      res.status(504).json({ ok: false, message: 'تعذر الاتصال بقاعدة البيانات حالياً' });
    }
  });

  return app;
}
