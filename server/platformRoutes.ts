import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PLATFORM_PLANS } from '../src/data/plans.ts';
import type {
  Plan,
  PlatformPaymentSettings,
  PlatformStoreOverview,
  StaffRole,
  SubscriptionRequest
} from '../src/types/index.ts';

export interface PlatformStoreConfigGetter {
  getConfig: (storeId: string) => Promise<{
    chargilyEnabled?: boolean;
    chargilyMode?: 'test' | 'live';
    chargilyApiKey?: string;
    baridimobEnabled?: boolean;
    baridimobRip?: string;
    baridimobAccountName?: string;
    baridimobInstructions?: string;
  } | undefined>;
}

interface StoredTeamMember {
  id: string;
  storeId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Exclude<StaffRole, 'owner'>;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

interface StoredOrderPaymentRecord {
  orderNumber: string;
  storeId: string;
  paymentMethod: 'cod' | 'chargily' | 'baridimob';
  paymentStatus: 'unpaid' | 'pending_verification' | 'paid' | 'failed';
  checkoutId?: string;
  amountDZD?: number;
  receiptImageUrl?: string;
  transactionRef?: string;
  updatedAt: string;
}

interface PersistedPlatformState {
  __v: 1;
  ownerCredential?: {
    email: string;
    passwordHash: string;
    claimedAt: string;
  };
  plans: Plan[];
  paymentSettings: PlatformPaymentSettings;
  stores: Record<string, PlatformStoreOverview>;
  subscriptionRequests: SubscriptionRequest[];
  teamMembers: StoredTeamMember[];
  orderPayments: Record<string, StoredOrderPaymentRecord>;
  processedChargilyEvents: string[];
}

const PLATFORM_STATE_PATH = process.env.VERCEL
  ? '/tmp/.brightdz-platform-state.json'
  : path.resolve(process.cwd(), '.brightdz-platform-state.json');

const SESSION_SIGNING_SECRET =
  (process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const revokedTokens = new Set<string>();
const rateLimitBuckets = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createGlobalApiRateLimiter() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/health') {
      next();
      return;
    }

    const ip = getClientIp(req);
    const now = Date.now();
    let bucketKey = `gen:${ip}`;
    let windowMs = 60 * 1000;
    let maxRequests = 180;

    if (
      req.path === '/api/owner/login' ||
      req.path === '/api/owner/claim' ||
      req.path === '/api/team/login'
    ) {
      bucketKey = `auth:${ip}`;
      windowMs = 10 * 60 * 1000;
      maxRequests = 15;
    } else if (
      req.path === '/api/payments/chargily/create-checkout' ||
      req.path === '/api/billing/request'
    ) {
      bucketKey = `pay:${ip}`;
      windowMs = 5 * 60 * 1000;
      maxRequests = 25;
    }

    const existing = (rateLimitBuckets.get(bucketKey) || []).filter(ts => now - ts < windowMs);
    if (existing.length >= maxRequests) {
      const oldest = existing[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        ok: false,
        message: 'عدد الطلبات مرتفع جداً خلال فترة قصيرة. يرجى الانتظار قليلاً ثم المحاولة مجدداً.'
      });
      return;
    }

    existing.push(now);
    rateLimitBuckets.set(bucketKey, existing);
    if (rateLimitBuckets.size > 5000) {
      for (const [k, list] of rateLimitBuckets.entries()) {
        if (list.length === 0 || now - list[list.length - 1] > 15 * 60 * 1000) {
          rateLimitBuckets.delete(k);
        }
      }
    }

    next();
  };
}

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

interface SessionPayload {
  kind: 'owner' | 'staff';
  sub: string;
  email: string;
  name: string;
  storeId?: string;
  role?: Exclude<StaffRole, 'owner'>;
  exp: number;
  jti: string;
}

function issueSignedToken(payload: Omit<SessionPayload, 'exp' | 'jti'>, ttlHours = 12): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
    jti: crypto.randomBytes(12).toString('hex')
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedToken(rawHeader?: string): SessionPayload | null {
  const header = String(rawHeader || '').trim();
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || revokedTokens.has(token)) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(body)
    .digest('base64url');
  if (!safeEqualStrings(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadPlatformState(): PersistedPlatformState {
  const defaults: PersistedPlatformState = {
    __v: 1,
    plans: DEFAULT_PLATFORM_PLANS.map(p => ({ ...p })),
    paymentSettings: {
      baridimobRip: '',
      baridimobAccountName: '',
      baridimobInstructions:
        'قم بتحويل مبلغ الباقة عبر تطبيق بريدي موب أو مكتب البريد ثم أرفق صورة الوصل ليتم تفعيل باقتك خلال دقائق.',
      chargilyEnabled: Boolean((process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim())
    },
    stores: {},
    subscriptionRequests: [],
    teamMembers: [],
    orderPayments: {},
    processedChargilyEvents: []
  };
  try {
    if (fs.existsSync(PLATFORM_STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(PLATFORM_STATE_PATH, 'utf8')) as Partial<PersistedPlatformState>;
      return {
        ...defaults,
        ...parsed,
        plans:
          Array.isArray(parsed.plans) && parsed.plans.length > 0
            ? parsed.plans
            : defaults.plans,
        paymentSettings: {
          ...defaults.paymentSettings,
          ...(parsed.paymentSettings || {}),
          chargilyEnabled: Boolean((process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim())
        },
        stores: parsed.stores && typeof parsed.stores === 'object' ? parsed.stores : {},
        subscriptionRequests: Array.isArray(parsed.subscriptionRequests)
          ? parsed.subscriptionRequests
          : [],
        teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : [],
        orderPayments:
          parsed.orderPayments && typeof parsed.orderPayments === 'object'
            ? parsed.orderPayments
            : {},
        processedChargilyEvents: Array.isArray(parsed.processedChargilyEvents)
          ? parsed.processedChargilyEvents.slice(-500)
          : []
      };
    }
  } catch {
    // non-fatal
  }
  return defaults;
}

const platformState: PersistedPlatformState = loadPlatformState();

function persistPlatformState() {
  try {
    platformState.processedChargilyEvents = platformState.processedChargilyEvents.slice(-500);
    fs.writeFileSync(PLATFORM_STATE_PATH, JSON.stringify(platformState, null, 2), 'utf8');
  } catch {
    // non-fatal
  }
}

function getSupabaseAdminCreds(): { url: string; key: string; headers: Record<string, string> } | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return {
    url,
    key,
    headers: {
      apikey: key,
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  };
}

async function syncStoreStatusToSupabase(
  storeId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const creds = getSupabaseAdminCreds();
  if (!creds) return;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(storeId)) return;
  try {
    await fetch(`${creds.url}/rest/v1/stores?id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      headers: creds.headers,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
    });
  } catch {
    // non-fatal
  }
}

async function syncOrderPaymentToSupabase(
  storeId: string,
  orderNumber: string,
  patch: Record<string, unknown>
): Promise<void> {
  const creds = getSupabaseAdminCreds();
  if (!creds) return;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(storeId)) return;
  try {
    await fetch(
      `${creds.url}/rest/v1/orders?store_id=eq.${encodeURIComponent(storeId)}&order_number=eq.${encodeURIComponent(orderNumber)}`,
      {
        method: 'PATCH',
        headers: creds.headers,
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
      }
    );
  } catch {
    // non-fatal
  }
}

async function hydrateStoresFromSupabaseIfAvailable(): Promise<PlatformStoreOverview[]> {
  const creds = getSupabaseAdminCreds();
  if (creds) {
    try {
      const [storesRes, pagesRes, ordersRes] = await Promise.all([
        fetch(`${creds.url}/rest/v1/stores?select=*&order=created_at.desc&limit=200`, {
          headers: creds.headers
        }),
        fetch(`${creds.url}/rest/v1/landing_pages?select=id,store_id`, {
          headers: creds.headers
        }),
        fetch(`${creds.url}/rest/v1/orders?select=id,store_id,total,status,created_at&limit=5000`, {
          headers: creds.headers
        })
      ]);

      if (storesRes.ok) {
        const dbStores = (await storesRes.json()) as any[];
        const dbPages = pagesRes.ok ? ((await pagesRes.json()) as any[]) : [];
        const dbOrders = ordersRes.ok ? ((await ordersRes.json()) as any[]) : [];

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthTs = monthStart.getTime();

        dbStores.forEach(row => {
          const sid = String(row.id);
          const pagesCount = dbPages.filter(p => String(p.store_id) === sid).length;
          const storeOrders = dbOrders.filter(o => String(o.store_id) === sid);
          const monthlyOrdersCount = storeOrders.filter(
            o => new Date(o.created_at || 0).getTime() >= monthTs
          ).length;
          const totalRevenueDZD = storeOrders
            .filter(o => o.status !== 'cancelled')
            .reduce((sum, o) => sum + Number(o.total || 0), 0);
          const existing = platformState.stores[sid];
          const activeTeamCount = platformState.teamMembers.filter(
            m => m.storeId === sid && m.isActive
          ).length;

          platformState.stores[sid] = {
            storeId: sid,
            name: String(row.name || existing?.name || 'متجر'),
            subdomain: String(row.subdomain || existing?.subdomain || ''),
            customDomain: row.custom_domain || existing?.customDomain,
            ownerEmail: existing?.ownerEmail || '',
            phone: row.phone || existing?.phone || '',
            planId: String(row.plan_id || existing?.planId || 'plan_pro'),
            status: (row.status || existing?.status || 'active') as 'active' | 'suspended' | 'trial',
            trialEndsAt: row.trial_ends_at || existing?.trialEndsAt,
            subscriptionEndsAt: row.subscription_ends_at || existing?.subscriptionEndsAt,
            suspendedReason: row.suspended_reason || existing?.suspendedReason,
            landingPagesCount: pagesCount,
            monthlyOrdersCount,
            totalOrdersCount: storeOrders.length,
            totalRevenueDZD,
            activeTeamCount,
            createdAt: row.created_at || existing?.createdAt || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString()
          };
        });
        persistPlatformState();
      }
    } catch {
      // fallback to runtime registry
    }
  }

  return Object.values(platformState.stores)
    .map(s => ({
      ...s,
      activeTeamCount: platformState.teamMembers.filter(
        m => m.storeId === s.storeId && m.isActive
      ).length
    }))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

export function getAuthoritativeStoreSuspension(storeId: string): {
  suspended: boolean;
  reason?: string;
  status?: 'active' | 'suspended' | 'trial';
  planId?: string;
} {
  const st = platformState.stores[storeId];
  if (!st) return { suspended: false };
  return {
    suspended: st.status === 'suspended',
    reason: st.suspendedReason,
    status: st.status,
    planId: st.planId
  };
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function requireOwnerAuth(req: Request, res: Response, next: NextFunction) {
  const session = verifySignedToken(req.headers.authorization);
  if (!session || session.kind !== 'owner') {
    res.status(401).json({ ok: false, message: 'يرجى تسجيل الدخول بحساب مالك المنصة أولاً' });
    return;
  }
  (req as any).ownerSession = session;
  next();
}

function sanitizeTeamMember(m: StoredTeamMember) {
  return {
    id: m.id,
    storeId: m.storeId,
    name: m.name,
    email: m.email,
    role: m.role,
    isActive: m.isActive,
    createdAt: m.createdAt,
    lastLoginAt: m.lastLoginAt
  };
}

/**
 * Mount the raw-body Chargily webhook BEFORE express.json() so HMAC-SHA256
 * is computed over the exact unmodified request bytes.
 */
export function mountChargilyRawWebhookRoute(
  app: Express,
  configGetter: PlatformStoreConfigGetter
) {
  app.post(
    '/api/payments/chargily/webhook',
    express.raw({ type: 'application/json', limit: '512kb' }),
    async (req: Request, res: Response) => {
      const rawBuf = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8');

      const signature = String(req.headers['signature'] || req.headers['Signature'] || '').trim();
      if (!signature) {
        res.status(400).json({ ok: false, message: 'Missing signature header' });
        return;
      }

      let parsedEvent: any;
      try {
        parsedEvent = JSON.parse(rawBuf.toString('utf8'));
      } catch {
        res.status(400).json({ ok: false, message: 'Invalid webhook payload' });
        return;
      }

      const eventId = String(parsedEvent?.id || '');
      const eventType = String(parsedEvent?.type || '');
      const checkout = parsedEvent?.data || {};
      const metadata = checkout?.metadata || {};
      const storeId = String(req.query?.storeId || metadata?.storeId || '').trim();
      const scope = String(req.query?.scope || metadata?.scope || 'order').trim();

      let secretKey = '';
      if (scope === 'subscription') {
        secretKey = (process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim();
      } else if (storeId) {
        const cfg = await configGetter.getConfig(storeId);
        secretKey = String(cfg?.chargilyApiKey || '').trim();
      }

      if (!secretKey) {
        res.status(403).json({ ok: false, message: 'Payment secret key not configured' });
        return;
      }

      const computedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(rawBuf)
        .digest('hex');

      if (!safeEqualStrings(computedSignature, signature)) {
        res.status(403).json({ ok: false, message: 'Invalid webhook signature' });
        return;
      }

      if (eventId && platformState.processedChargilyEvents.includes(eventId)) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }

      if (eventId) {
        platformState.processedChargilyEvents.push(eventId);
      }

      if (scope === 'subscription' && eventType === 'checkout.paid') {
        const planId = String(metadata?.planId || '').trim();
        const requestId = String(metadata?.requestId || '').trim();
        if (storeId && planId) {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          if (platformState.stores[storeId]) {
            platformState.stores[storeId].planId = planId;
            platformState.stores[storeId].status = 'active';
            platformState.stores[storeId].suspendedReason = undefined;
            platformState.stores[storeId].subscriptionEndsAt = expiresAt;
            platformState.stores[storeId].updatedAt = new Date().toISOString();
          }
          const reqRec = platformState.subscriptionRequests.find(r => r.id === requestId);
          if (reqRec) {
            reqRec.status = 'approved';
            reqRec.reviewedBy = 'Chargily Pay (تلقائي)';
            reqRec.reviewedAt = new Date().toISOString();
          }
          persistPlatformState();
          await syncStoreStatusToSupabase(storeId, {
            plan_id: planId,
            status: 'active',
            suspended_reason: null,
            subscription_ends_at: expiresAt
          });
        }
        res.status(200).json({ ok: true, received: true });
        return;
      }

      const orderNumber = String(metadata?.orderNumber || '').trim().toUpperCase();
      if (storeId && orderNumber) {
        const key = `${storeId}:${orderNumber}`;
        const existing = platformState.orderPayments[key];
        const nextStatus: StoredOrderPaymentRecord['paymentStatus'] =
          eventType === 'checkout.paid'
            ? 'paid'
            : eventType === 'checkout.failed' || eventType === 'checkout.canceled'
            ? 'failed'
            : existing?.paymentStatus || 'pending_verification';

        platformState.orderPayments[key] = {
          orderNumber,
          storeId,
          paymentMethod: 'chargily',
          paymentStatus: nextStatus,
          checkoutId: String(checkout?.id || existing?.checkoutId || ''),
          amountDZD: Number(checkout?.amount || existing?.amountDZD || 0),
          updatedAt: new Date().toISOString()
        };
        persistPlatformState();

        await syncOrderPaymentToSupabase(storeId, orderNumber, {
          payment_method: 'chargily',
          payment_status: nextStatus,
          payment_reference: String(checkout?.id || '')
        });
      }

      res.status(200).json({ ok: true, received: true });
    }
  );
}

/**
 * Mount all JSON-based Platform Owner, Billing, Team RBAC, and Payment routes.
 */
export function mountPlatformRoutes(
  app: Express,
  configGetter: PlatformStoreConfigGetter
) {
  // =========================================================================
  // 1. PLATFORM OWNER AUTHENTICATION & CONTROL CENTER (/api/owner/*)
  // =========================================================================
  app.get('/api/owner/status', (_req: Request, res: Response) => {
    const envPassword = (process.env.PLATFORM_OWNER_PASSWORD || '').trim();
    const envEmail = (process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
    const hasEnvOwner = envPassword.length > 0;
    const hasClaimedOwner = Boolean(platformState.ownerCredential?.passwordHash);
    res.json({
      ok: true,
      configured: hasEnvOwner || hasClaimedOwner,
      needsSetup: !hasEnvOwner && !hasClaimedOwner,
      usesEnvOverride: hasEnvOwner,
      ownerEmailHint: hasEnvOwner
        ? envEmail || 'owner@platform.dz'
        : platformState.ownerCredential?.email || ''
    });
  });

  app.post('/api/owner/claim', (req: Request, res: Response) => {
    const envPassword = (process.env.PLATFORM_OWNER_PASSWORD || '').trim();
    if (envPassword.length > 0 || platformState.ownerCredential?.passwordHash) {
      res.status(409).json({
        ok: false,
        message: 'تم إعداد حساب مالك المنصة مسبقاً. يرجى تسجيل الدخول مباشرة.'
      });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, message: 'يرجى إدخال بريد إلكتروني صحيح لمالك المنصة' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({
        ok: false,
        message: 'يجب أن تتكون كلمة مرور مالك المنصة من 8 أحرف على الأقل'
      });
      return;
    }

    platformState.ownerCredential = {
      email,
      passwordHash: hashPasswordScrypt(password),
      claimedAt: new Date().toISOString()
    };
    persistPlatformState();

    const token = issueSignedToken({
      kind: 'owner',
      sub: 'platform-owner',
      email,
      name: 'مالك المنصة'
    });

    res.json({
      ok: true,
      token,
      owner: { email, name: 'مالك المنصة' }
    });
  });

  app.post('/api/owner/login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      res.status(400).json({ ok: false, message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
      return;
    }

    const envPassword = (process.env.PLATFORM_OWNER_PASSWORD || '').trim();
    const envEmail = (process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();

    let valid = false;
    let resolvedEmail = email;

    if (envPassword.length > 0) {
      const emailMatches = !envEmail || safeEqualStrings(email, envEmail);
      const passMatches = safeEqualStrings(password, envPassword);
      valid = emailMatches && passMatches;
      resolvedEmail = envEmail || email;
    } else if (platformState.ownerCredential?.passwordHash) {
      const emailMatches = safeEqualStrings(email, platformState.ownerCredential.email);
      const passMatches = verifyPasswordScrypt(password, platformState.ownerCredential.passwordHash);
      valid = emailMatches && passMatches;
      resolvedEmail = platformState.ownerCredential.email;
    } else {
      res.status(403).json({
        ok: false,
        needsSetup: true,
        message: 'لم يتم إعداد كلمة مرور مالك المنصة بعد. يرجى إكمال الإعداد الأولي.'
      });
      return;
    }

    if (!valid) {
      res.status(401).json({ ok: false, message: 'بيانات دخول مالك المنصة غير صحيحة' });
      return;
    }

    const token = issueSignedToken({
      kind: 'owner',
      sub: 'platform-owner',
      email: resolvedEmail,
      name: 'مالك المنصة'
    });

    res.json({
      ok: true,
      token,
      owner: { email: resolvedEmail, name: 'مالك المنصة' }
    });
  });

  app.post('/api/owner/logout', (req: Request, res: Response) => {
    const header = String(req.headers.authorization || '').trim();
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) revokedTokens.add(token);
    res.json({ ok: true });
  });

  app.get('/api/owner/overview', requireOwnerAuth, async (_req: Request, res: Response) => {
    const stores = await hydrateStoresFromSupabaseIfAvailable();
    const plans = platformState.plans;
    const planPriceById = new Map(plans.map(p => [p.id, Number(p.priceDZD) || 0]));

    const estimatedMrrDZD = stores
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + (planPriceById.get(s.planId) || 0), 0);

    res.json({
      ok: true,
      summary: {
        totalStores: stores.length,
        activeStores: stores.filter(s => s.status === 'active').length,
        trialStores: stores.filter(s => s.status === 'trial').length,
        suspendedStores: stores.filter(s => s.status === 'suspended').length,
        pendingRequests: platformState.subscriptionRequests.filter(r => r.status === 'pending').length,
        estimatedMrrDZD,
        totalOrdersAllStores: stores.reduce((sum, s) => sum + (s.totalOrdersCount || 0), 0)
      },
      stores,
      plans,
      subscriptionRequests: [...platformState.subscriptionRequests].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      paymentSettings: {
        ...platformState.paymentSettings,
        chargilyEnabled: Boolean((process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim())
      }
    });
  });

  app.post(
    '/api/owner/stores/:storeId/status',
    requireOwnerAuth,
    async (req: Request, res: Response) => {
      const storeId = String(req.params.storeId || '').trim();
      const status = req.body?.status;
      const suspendedReason = String(req.body?.suspendedReason || '').trim().slice(0, 300);

      if (!storeId || !['active', 'trial', 'suspended'].includes(status)) {
        res.status(400).json({ ok: false, message: 'حالة المتجر المطلوبة غير صالحة' });
        return;
      }

      const existing = platformState.stores[storeId];
      if (!existing) {
        res.status(404).json({ ok: false, message: 'المتجر غير موجود في سجل المنصة' });
        return;
      }

      existing.status = status;
      existing.suspendedReason =
        status === 'suspended'
          ? suspendedReason || 'تم إيقاف المتجر مؤقتاً من طرف إدارة المنصة لمخالفة شروط الاستخدام.'
          : undefined;
      existing.updatedAt = new Date().toISOString();
      persistPlatformState();

      await syncStoreStatusToSupabase(storeId, {
        status,
        suspended_reason: existing.suspendedReason || null
      });

      res.json({ ok: true, store: existing });
    }
  );

  app.post(
    '/api/owner/stores/:storeId/plan',
    requireOwnerAuth,
    async (req: Request, res: Response) => {
      const storeId = String(req.params.storeId || '').trim();
      const planId = String(req.body?.planId || '').trim();
      const extendDays = Number(req.body?.extendDays || 0);
      const nextStatus = req.body?.status;

      const existing = platformState.stores[storeId];
      if (!existing) {
        res.status(404).json({ ok: false, message: 'المتجر غير موجود' });
        return;
      }
      const plan = platformState.plans.find(p => p.id === planId);
      if (!plan) {
        res.status(400).json({ ok: false, message: 'الباقة المختارة غير صالحة' });
        return;
      }

      existing.planId = plan.id;
      if (nextStatus && ['active', 'trial', 'suspended'].includes(nextStatus)) {
        existing.status = nextStatus;
        if (nextStatus !== 'suspended') existing.suspendedReason = undefined;
      }
      if (Number.isFinite(extendDays) && extendDays > 0 && extendDays <= 365) {
        const targetIso = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toISOString();
        if (existing.status === 'trial') {
          existing.trialEndsAt = targetIso;
        } else {
          existing.subscriptionEndsAt = targetIso;
        }
      }
      existing.updatedAt = new Date().toISOString();
      persistPlatformState();

      await syncStoreStatusToSupabase(storeId, {
        plan_id: existing.planId,
        status: existing.status,
        trial_ends_at: existing.trialEndsAt || null,
        subscription_ends_at: existing.subscriptionEndsAt || null
      });

      res.json({ ok: true, store: existing });
    }
  );

  app.post(
    '/api/owner/requests/:requestId/review',
    requireOwnerAuth,
    async (req: Request, res: Response) => {
      const requestId = String(req.params.requestId || '').trim();
      const decision = req.body?.decision === 'approve' ? 'approved' : req.body?.decision === 'reject' ? 'rejected' : '';
      const rejectionReason = String(req.body?.rejectionReason || '').trim().slice(0, 300);

      if (!decision) {
        res.status(400).json({ ok: false, message: 'يرجى تحديد قرار الموافقة أو الرفض' });
        return;
      }

      const subReq = platformState.subscriptionRequests.find(r => r.id === requestId);
      if (!subReq) {
        res.status(404).json({ ok: false, message: 'طلب الاشتراك غير موجود' });
        return;
      }

      const ownerSession = (req as any).ownerSession as SessionPayload;
      subReq.status = decision;
      subReq.reviewedBy = ownerSession.email;
      subReq.reviewedAt = new Date().toISOString();
      if (decision === 'rejected') {
        subReq.rejectionReason = rejectionReason || 'تعذر التحقق من وصل الدفع المرفق';
      } else {
        subReq.rejectionReason = undefined;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const store = platformState.stores[subReq.storeId];
        if (store) {
          store.planId = subReq.planId;
          store.status = 'active';
          store.suspendedReason = undefined;
          store.subscriptionEndsAt = expiresAt;
          store.updatedAt = new Date().toISOString();
        }
        await syncStoreStatusToSupabase(subReq.storeId, {
          plan_id: subReq.planId,
          status: 'active',
          suspended_reason: null,
          subscription_ends_at: expiresAt
        });
      }

      persistPlatformState();
      res.json({ ok: true, request: subReq });
    }
  );

  app.post('/api/owner/plans/:planId', requireOwnerAuth, (req: Request, res: Response) => {
    const planId = String(req.params.planId || '').trim();
    const plan = platformState.plans.find(p => p.id === planId);
    if (!plan) {
      res.status(404).json({ ok: false, message: 'الباقة غير موجودة' });
      return;
    }

    const priceDZD = Math.max(0, Math.round(Number(req.body?.priceDZD ?? plan.priceDZD)));
    const maxLandingPages = Math.max(
      1,
      Math.round(Number(req.body?.maxLandingPages ?? plan.maxLandingPages ?? plan.maxProducts))
    );
    const maxMonthlyOrders = Math.max(
      1,
      Math.round(Number(req.body?.maxMonthlyOrders ?? plan.maxMonthlyOrders ?? 100))
    );
    const maxTeamMembers = Math.max(
      1,
      Math.round(Number(req.body?.maxTeamMembers ?? plan.maxTeamMembers ?? 1))
    );
    const allowOnlinePayment =
      typeof req.body?.allowOnlinePayment === 'boolean'
        ? req.body.allowOnlinePayment
        : Boolean(plan.allowOnlinePayment);

    plan.priceDZD = priceDZD;
    plan.maxLandingPages = maxLandingPages;
    plan.maxProducts = maxLandingPages;
    plan.maxMonthlyOrders = maxMonthlyOrders;
    plan.maxTeamMembers = maxTeamMembers;
    plan.allowOnlinePayment = allowOnlinePayment;
    persistPlatformState();

    res.json({ ok: true, plan });
  });

  app.post('/api/owner/billing-settings', requireOwnerAuth, (req: Request, res: Response) => {
    platformState.paymentSettings = {
      baridimobRip: String(req.body?.baridimobRip || '').trim().slice(0, 60),
      baridimobAccountName: String(req.body?.baridimobAccountName || '').trim().slice(0, 120),
      baridimobInstructions: String(req.body?.baridimobInstructions || '').trim().slice(0, 500),
      chargilyEnabled: Boolean((process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim())
    };
    persistPlatformState();
    res.json({ ok: true, paymentSettings: platformState.paymentSettings });
  });

  // =========================================================================
  // 2. BILLING, PLANS & LIVE STORE USAGE SYNC (/api/billing/*)
  // =========================================================================
  app.get('/api/billing/plans', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      plans: platformState.plans,
      paymentSettings: {
        ...platformState.paymentSettings,
        chargilyEnabled: Boolean((process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim())
      }
    });
  });

  app.post('/api/billing/sync-store', (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    if (!storeId) {
      res.status(400).json({ ok: false, message: 'Missing storeId' });
      return;
    }

    const existing = platformState.stores[storeId];
    const nowIso = new Date().toISOString();
    const defaultTrialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Never allow client sync to override owner-set suspension or approved plan downgrade/upgrade
    const authoritativeStatus = existing?.status || (req.body?.status === 'trial' ? 'trial' : 'active');
    const authoritativePlanId = existing?.planId || String(req.body?.planId || 'plan_pro');

    platformState.stores[storeId] = {
      storeId,
      name: String(req.body?.name || existing?.name || 'متجر').slice(0, 120),
      subdomain: String(req.body?.subdomain || existing?.subdomain || '').slice(0, 64),
      customDomain: req.body?.customDomain || existing?.customDomain,
      ownerEmail: String(req.body?.ownerEmail || existing?.ownerEmail || '').slice(0, 160),
      phone: String(req.body?.phone || existing?.phone || '').slice(0, 30),
      planId: authoritativePlanId,
      status: authoritativeStatus,
      trialEndsAt: existing?.trialEndsAt || req.body?.trialEndsAt || defaultTrialEnds,
      subscriptionEndsAt: existing?.subscriptionEndsAt || req.body?.subscriptionEndsAt,
      suspendedReason: existing?.suspendedReason,
      landingPagesCount: Math.max(0, Number(req.body?.landingPagesCount ?? existing?.landingPagesCount ?? 0)),
      monthlyOrdersCount: Math.max(0, Number(req.body?.monthlyOrdersCount ?? existing?.monthlyOrdersCount ?? 0)),
      totalOrdersCount: Math.max(0, Number(req.body?.totalOrdersCount ?? existing?.totalOrdersCount ?? 0)),
      totalRevenueDZD: Math.max(0, Number(req.body?.totalRevenueDZD ?? existing?.totalRevenueDZD ?? 0)),
      activeTeamCount: platformState.teamMembers.filter(m => m.storeId === storeId && m.isActive).length,
      createdAt: existing?.createdAt || req.body?.createdAt || nowIso,
      updatedAt: nowIso
    };
    persistPlatformState();

    const activePlan =
      platformState.plans.find(p => p.id === platformState.stores[storeId].planId) ||
      platformState.plans[0];

    res.json({
      ok: true,
      store: platformState.stores[storeId],
      plan: activePlan
    });
  });

  app.get('/api/billing/store-status', (req: Request, res: Response) => {
    const storeId = String(req.query?.storeId || '').trim();
    if (!storeId) {
      res.status(400).json({ ok: false, message: 'Missing storeId' });
      return;
    }

    const store = platformState.stores[storeId] || null;
    const planId = store?.planId || 'plan_pro';
    const plan = platformState.plans.find(p => p.id === planId) || platformState.plans[0];
    const requests = platformState.subscriptionRequests
      .filter(r => r.storeId === storeId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      ok: true,
      store,
      plan,
      plans: platformState.plans,
      requests,
      paymentSettings: {
        ...platformState.paymentSettings,
        chargilyEnabled: Boolean((process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim())
      }
    });
  });

  app.post('/api/billing/request', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const storeName = String(req.body?.storeName || '').trim().slice(0, 120);
    const storeSubdomain = String(req.body?.storeSubdomain || '').trim().slice(0, 64);
    const planId = String(req.body?.planId || '').trim();
    const paymentMethod =
      req.body?.paymentMethod === 'chargily' ? 'chargily' : 'baridimob';
    const receiptImageUrl = String(req.body?.receiptImageUrl || '').trim();
    const transactionRef = String(req.body?.transactionRef || '').trim().slice(0, 120);
    const notes = String(req.body?.notes || '').trim().slice(0, 400);

    const plan = platformState.plans.find(p => p.id === planId);
    if (!storeId || !plan) {
      res.status(400).json({ ok: false, message: 'بيانات المتجر أو الباقة غير مكتملة' });
      return;
    }

    if (
      receiptImageUrl &&
      !receiptImageUrl.startsWith('data:image/') &&
      !isSafeHttpUrl(receiptImageUrl)
    ) {
      res.status(400).json({ ok: false, message: 'صيغة صورة الوصل غير صالحة' });
      return;
    }

    const requestRecord: SubscriptionRequest = {
      id: `subreq_${crypto.randomBytes(6).toString('hex')}`,
      storeId,
      storeName: storeName || platformState.stores[storeId]?.name || 'متجر',
      storeSubdomain: storeSubdomain || platformState.stores[storeId]?.subdomain || '',
      planId: plan.id,
      amountDZD: plan.priceDZD,
      paymentMethod,
      receiptImageUrl: receiptImageUrl || undefined,
      transactionRef: transactionRef || undefined,
      notes: notes || undefined,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    if (paymentMethod === 'chargily') {
      const secretKey = (process.env.PLATFORM_CHARGILY_SECRET_KEY || '').trim();
      if (!secretKey) {
        res.status(400).json({
          ok: false,
          message:
            'بوابة Chargily لاشتراكات المنصة غير مفعّلة حالياً من طرف مالك المنصة. يرجى اختيار التحويل عبر بريدي موب ورفع الوصل.'
        });
        return;
      }

      const mode = (process.env.PLATFORM_CHARGILY_MODE || 'test').trim().toLowerCase();
      const baseUrl =
        mode === 'live'
          ? 'https://pay.chargily.net/api/v2/checkouts'
          : 'https://pay.chargily.net/test/api/v2/checkouts';
      const rawReturnUrl = String(req.body?.returnUrl || '').trim();
      const safeReturnUrl = isSafeHttpUrl(rawReturnUrl)
        ? rawReturnUrl
        : `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/banana`;

      try {
        const upstream = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            amount: plan.priceDZD,
            currency: 'dzd',
            description: `اشتراك ${plan.nameAr} - ${requestRecord.storeName}`,
            success_url: `${safeReturnUrl}?billing=success&plan=${encodeURIComponent(plan.id)}`,
            failure_url: `${safeReturnUrl}?billing=failed`,
            metadata: {
              scope: 'subscription',
              storeId,
              planId: plan.id,
              requestId: requestRecord.id
            }
          })
        });
        const data = (await upstream.json().catch(() => ({}))) as any;
        if (!upstream.ok || !data?.checkout_url) {
          res.status(502).json({
            ok: false,
            message: 'تعذر إنشاء جلسة الدفع عبر Chargily حالياً. يمكنك استخدام التحويل اليدوي عبر بريدي موب.'
          });
          return;
        }
        requestRecord.transactionRef = String(data.id || '');
        platformState.subscriptionRequests.unshift(requestRecord);
        persistPlatformState();
        res.json({
          ok: true,
          request: requestRecord,
          checkoutUrl: String(data.checkout_url)
        });
        return;
      } catch {
        res.status(502).json({
          ok: false,
          message: 'تعذر الاتصال ببوابة Chargily حالياً'
        });
        return;
      }
    }

    if (!receiptImageUrl && !transactionRef) {
      res.status(400).json({
        ok: false,
        message: 'يرجى إرفاق صورة وصل التحويل أو إدخال رقم العملية في بريدي موب'
      });
      return;
    }

    platformState.subscriptionRequests.unshift(requestRecord);
    persistPlatformState();
    res.json({ ok: true, request: requestRecord });
  });

  // =========================================================================
  // 3. TEAM & ROLE-BASED ACCESS CONTROL (/api/team/*)
  // =========================================================================
  app.get('/api/team/members', (req: Request, res: Response) => {
    const storeId = String(req.query?.storeId || '').trim();
    if (!storeId) {
      res.status(400).json({ ok: false, message: 'Missing storeId' });
      return;
    }
    // Reject staff tokens from reading team management list
    const staffSession = verifySignedToken(req.headers.authorization);
    if (staffSession && staffSession.kind === 'staff') {
      res.status(403).json({ ok: false, message: 'إدارة الفريق متاحة لمالك المتجر فقط' });
      return;
    }
    const members = platformState.teamMembers
      .filter(m => m.storeId === storeId)
      .map(sanitizeTeamMember);
    res.json({ ok: true, members });
  });

  app.post('/api/team/members', (req: Request, res: Response) => {
    const staffSession = verifySignedToken(req.headers.authorization);
    if (staffSession && staffSession.kind === 'staff') {
      res.status(403).json({ ok: false, message: 'إضافة أعضاء الفريق متاحة لمالك المتجر فقط' });
      return;
    }

    const storeId = String(req.body?.storeId || '').trim();
    const name = String(req.body?.name || '').trim().slice(0, 100);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role: Exclude<StaffRole, 'owner'> =
      req.body?.role === 'catalog_manager' ? 'catalog_manager' : 'order_confirmer';

    if (!storeId || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, message: 'يرجى إدخال اسم الموظف وبريده الإلكتروني بشكل صحيح' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ ok: false, message: 'يجب أن تتكون كلمة مرور الموظف من 6 أحرف على الأقل' });
      return;
    }

    // Enforce plan team seats limit
    const store = platformState.stores[storeId];
    const plan =
      platformState.plans.find(p => p.id === (store?.planId || 'plan_pro')) ||
      platformState.plans[0];
    const maxTeam = Math.max(1, Number(plan?.maxTeamMembers || 1));
    // Owner takes 1 seat, staff take the remaining seats (maxTeam - 1)
    const currentStaffCount = platformState.teamMembers.filter(
      m => m.storeId === storeId && m.isActive
    ).length;
    if (currentStaffCount + 1 >= maxTeam) {
      res.status(403).json({
        ok: false,
        code: 'plan_limit_reached',
        message: `باقتك الحالية (${plan.nameAr}) تسمح بـ ${maxTeam} مستخدمين كحد أقصى (بما في ذلك المالك). قم بالترقية لإضافة المزيد من الموظفين.`
      });
      return;
    }

    const duplicate = platformState.teamMembers.find(
      m => m.storeId === storeId && m.email === email
    );
    if (duplicate) {
      res.status(409).json({ ok: false, message: 'يوجد موظف مسجل بهذا البريد الإلكتروني مسبقاً في هذا المتجر' });
      return;
    }

    const member: StoredTeamMember = {
      id: `tm_${crypto.randomBytes(6).toString('hex')}`,
      storeId,
      name,
      email,
      passwordHash: hashPasswordScrypt(password),
      role,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    platformState.teamMembers.unshift(member);
    if (platformState.stores[storeId]) {
      platformState.stores[storeId].activeTeamCount = platformState.teamMembers.filter(
        m => m.storeId === storeId && m.isActive
      ).length;
    }
    persistPlatformState();

    res.json({ ok: true, member: sanitizeTeamMember(member) });
  });

  app.patch('/api/team/members/:memberId', (req: Request, res: Response) => {
    const staffSession = verifySignedToken(req.headers.authorization);
    if (staffSession && staffSession.kind === 'staff') {
      res.status(403).json({ ok: false, message: 'تعديل الصلاحيات متاح لمالك المتجر فقط' });
      return;
    }

    const memberId = String(req.params.memberId || '').trim();
    const storeId = String(req.body?.storeId || '').trim();
    const member = platformState.teamMembers.find(
      m => m.id === memberId && (!storeId || m.storeId === storeId)
    );
    if (!member) {
      res.status(404).json({ ok: false, message: 'عضو الفريق غير موجود' });
      return;
    }

    if (typeof req.body?.isActive === 'boolean') {
      member.isActive = req.body.isActive;
    }
    if (req.body?.role === 'order_confirmer' || req.body?.role === 'catalog_manager') {
      member.role = req.body.role;
    }
    if (typeof req.body?.password === 'string' && req.body.password.length >= 6) {
      member.passwordHash = hashPasswordScrypt(req.body.password);
    }

    if (platformState.stores[member.storeId]) {
      platformState.stores[member.storeId].activeTeamCount = platformState.teamMembers.filter(
        m => m.storeId === member.storeId && m.isActive
      ).length;
    }
    persistPlatformState();

    res.json({ ok: true, member: sanitizeTeamMember(member) });
  });

  app.delete('/api/team/members/:memberId', (req: Request, res: Response) => {
    const staffSession = verifySignedToken(req.headers.authorization);
    if (staffSession && staffSession.kind === 'staff') {
      res.status(403).json({ ok: false, message: 'حذف أعضاء الفريق متاح لمالك المتجر فقط' });
      return;
    }

    const memberId = String(req.params.memberId || '').trim();
    const storeId = String(req.query?.storeId || '').trim();
    const idx = platformState.teamMembers.findIndex(
      m => m.id === memberId && (!storeId || m.storeId === storeId)
    );
    if (idx === -1) {
      res.status(404).json({ ok: false, message: 'عضو الفريق غير موجود' });
      return;
    }

    const [removed] = platformState.teamMembers.splice(idx, 1);
    if (removed && platformState.stores[removed.storeId]) {
      platformState.stores[removed.storeId].activeTeamCount = platformState.teamMembers.filter(
        m => m.storeId === removed.storeId && m.isActive
      ).length;
    }
    persistPlatformState();
    res.json({ ok: true });
  });

  app.post('/api/team/login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const storeIdHint = String(req.body?.storeId || '').trim();

    if (!email || !password) {
      res.status(400).json({ ok: false, message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
      return;
    }

    const candidates = platformState.teamMembers.filter(
      m => m.email === email && (!storeIdHint || m.storeId === storeIdHint)
    );
    const matched = candidates.find(m => verifyPasswordScrypt(password, m.passwordHash));
    if (!matched) {
      res.status(401).json({ ok: false, message: 'بيانات دخول الموظف غير صحيحة' });
      return;
    }
    if (!matched.isActive) {
      res.status(403).json({ ok: false, message: 'تم تعطيل حساب هذا الموظف من طرف مالك المتجر' });
      return;
    }

    const store = platformState.stores[matched.storeId];
    if (store?.status === 'suspended') {
      res.status(403).json({
        ok: false,
        message: 'تم إيقاف هذا المتجر حالياً من طرف إدارة المنصة'
      });
      return;
    }

    matched.lastLoginAt = new Date().toISOString();
    persistPlatformState();

    const token = issueSignedToken({
      kind: 'staff',
      sub: matched.id,
      email: matched.email,
      name: matched.name,
      storeId: matched.storeId,
      role: matched.role
    });

    res.json({
      ok: true,
      token,
      member: sanitizeTeamMember(matched)
    });
  });

  app.get('/api/team/me', (req: Request, res: Response) => {
    const session = verifySignedToken(req.headers.authorization);
    if (!session || session.kind !== 'staff') {
      res.status(401).json({ ok: false, message: 'جلسة الموظف غير صالحة' });
      return;
    }
    const member = platformState.teamMembers.find(m => m.id === session.sub && m.isActive);
    if (!member) {
      res.status(401).json({ ok: false, message: 'حساب الموظف غير نشط' });
      return;
    }
    res.json({ ok: true, member: sanitizeTeamMember(member) });
  });

  app.post('/api/team/logout', (req: Request, res: Response) => {
    const header = String(req.headers.authorization || '').trim();
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) revokedTokens.add(token);
    res.json({ ok: true });
  });

  // =========================================================================
  // 4. CUSTOMER ONLINE PAYMENTS: CHARGILY PAY v2 & BARIDIMOB (/api/payments/*)
  // =========================================================================
  app.post('/api/payments/chargily/create-checkout', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const orderNumber = String(req.body?.orderNumber || '').trim().toUpperCase();
    const amountDZD = Math.round(Number(req.body?.amountDZD || 0));
    const description = String(req.body?.description || `طلب رقم ${orderNumber}`).slice(0, 200);
    const successUrl = String(req.body?.successUrl || '').trim();
    const failureUrl = String(req.body?.failureUrl || '').trim();

    if (!storeId || !orderNumber || amountDZD < 50) {
      res.status(400).json({ ok: false, message: 'بيانات الدفع الإلكتروني غير صالحة (الحد الأدنى 50 دج)' });
      return;
    }

    const storeRec = platformState.stores[storeId];
    if (storeRec?.status === 'suspended') {
      res.status(403).json({ ok: false, message: 'هذا المتجر موقوف حالياً ولا يمكن إتمام الدفع' });
      return;
    }

    const plan =
      platformState.plans.find(p => p.id === (storeRec?.planId || 'plan_pro')) ||
      platformState.plans[0];
    if (plan && plan.allowOnlinePayment === false) {
      res.status(403).json({
        ok: false,
        message: 'الدفع الإلكتروني غير مفعّل في باقة هذا المتجر حالياً'
      });
      return;
    }

    const cfg = await configGetter.getConfig(storeId);
    const apiKey = String(cfg?.chargilyApiKey || '').trim();
    if (!cfg?.chargilyEnabled || !apiKey) {
      res.status(400).json({
        ok: false,
        message: 'لم يقم التاجر بإعداد مفتاح بوابة Chargily بعد. يرجى اختيار الدفع عند الاستلام أو بريدي موب.'
      });
      return;
    }

    const mode = cfg.chargilyMode === 'live' ? 'live' : 'test';
    const endpoint =
      mode === 'live'
        ? 'https://pay.chargily.net/api/v2/checkouts'
        : 'https://pay.chargily.net/test/api/v2/checkouts';

    const fallbackOrigin = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const safeSuccessUrl = isSafeHttpUrl(successUrl)
      ? successUrl
      : `${fallbackOrigin}/?payment=success&order=${encodeURIComponent(orderNumber)}`;
    const safeFailureUrl = isSafeHttpUrl(failureUrl)
      ? failureUrl
      : `${fallbackOrigin}/?payment=failed&order=${encodeURIComponent(orderNumber)}`;
    const webhookUrl = `${fallbackOrigin}/api/payments/chargily/webhook?storeId=${encodeURIComponent(storeId)}`;

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          amount: amountDZD,
          currency: 'dzd',
          description,
          success_url: safeSuccessUrl,
          failure_url: safeFailureUrl,
          webhook_endpoint: webhookUrl,
          locale: 'ar',
          metadata: {
            scope: 'order',
            storeId,
            orderNumber
          }
        })
      });

      const data = (await upstream.json().catch(() => ({}))) as any;
      if (!upstream.ok || !data?.checkout_url) {
        const errMsg =
          typeof data?.message === 'string' && data.message.trim()
            ? data.message
            : 'تعذر إنشاء رابط الدفع في Chargily. تأكد من صحة مفتاح الربط السري ونمط التشغيل (تجريبي/فعلي).';
        res.status(502).json({ ok: false, message: errMsg });
        return;
      }

      const key = `${storeId}:${orderNumber}`;
      platformState.orderPayments[key] = {
        orderNumber,
        storeId,
        paymentMethod: 'chargily',
        paymentStatus: 'pending_verification',
        checkoutId: String(data.id || ''),
        amountDZD,
        updatedAt: new Date().toISOString()
      };
      persistPlatformState();

      await syncOrderPaymentToSupabase(storeId, orderNumber, {
        payment_method: 'chargily',
        payment_status: 'pending_verification',
        payment_reference: String(data.id || '')
      });

      res.json({
        ok: true,
        checkoutUrl: String(data.checkout_url),
        checkoutId: String(data.id || '')
      });
    } catch {
      res.status(502).json({
        ok: false,
        message: 'تعذر الاتصال بخوادم Chargily Pay حالياً. يرجى المحاولة مجدداً أو اختيار الدفع عند الاستلام.'
      });
    }
  });

  app.post('/api/payments/baridimob/record', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const orderNumber = String(req.body?.orderNumber || '').trim().toUpperCase();
    const amountDZD = Math.max(0, Math.round(Number(req.body?.amountDZD || 0)));
    const receiptImageUrl = String(req.body?.receiptImageUrl || '').trim();
    const transactionRef = String(req.body?.transactionRef || '').trim().slice(0, 120);

    if (!storeId || !orderNumber) {
      res.status(400).json({ ok: false, message: 'بيانات الطلب غير مكتملة' });
      return;
    }
    if (
      receiptImageUrl &&
      !receiptImageUrl.startsWith('data:image/') &&
      !isSafeHttpUrl(receiptImageUrl)
    ) {
      res.status(400).json({ ok: false, message: 'صيغة صورة وصل بريدي موب غير صالحة' });
      return;
    }

    const key = `${storeId}:${orderNumber}`;
    platformState.orderPayments[key] = {
      orderNumber,
      storeId,
      paymentMethod: 'baridimob',
      paymentStatus: 'pending_verification',
      amountDZD,
      receiptImageUrl: receiptImageUrl || undefined,
      transactionRef: transactionRef || undefined,
      updatedAt: new Date().toISOString()
    };
    persistPlatformState();

    await syncOrderPaymentToSupabase(storeId, orderNumber, {
      payment_method: 'baridimob',
      payment_status: 'pending_verification',
      payment_reference: transactionRef || null,
      payment_receipt_url: receiptImageUrl || null
    });

    res.json({ ok: true, payment: platformState.orderPayments[key] });
  });

  app.post('/api/payments/verify', async (req: Request, res: Response) => {
    const storeId = String(req.body?.storeId || '').trim();
    const orderNumber = String(req.body?.orderNumber || '').trim().toUpperCase();
    const nextStatus =
      req.body?.paymentStatus === 'paid'
        ? 'paid'
        : req.body?.paymentStatus === 'failed'
        ? 'failed'
        : 'pending_verification';

    if (!storeId || !orderNumber) {
      res.status(400).json({ ok: false, message: 'بيانات الطلب غير مكتملة' });
      return;
    }

    const key = `${storeId}:${orderNumber}`;
    const existing = platformState.orderPayments[key];
    platformState.orderPayments[key] = {
      orderNumber,
      storeId,
      paymentMethod: existing?.paymentMethod || 'baridimob',
      paymentStatus: nextStatus,
      checkoutId: existing?.checkoutId,
      amountDZD: existing?.amountDZD,
      receiptImageUrl: existing?.receiptImageUrl,
      transactionRef: existing?.transactionRef,
      updatedAt: new Date().toISOString()
    };
    persistPlatformState();

    await syncOrderPaymentToSupabase(storeId, orderNumber, {
      payment_status: nextStatus
    });

    res.json({ ok: true, payment: platformState.orderPayments[key] });
  });

  app.get('/api/payments/order-status', (req: Request, res: Response) => {
    const storeId = String(req.query?.storeId || '').trim();
    const orderNumber = String(req.query?.orderNumber || '').trim().toUpperCase();
    if (!storeId || !orderNumber) {
      res.json({ ok: true, payment: null });
      return;
    }
    res.json({
      ok: true,
      payment: platformState.orderPayments[`${storeId}:${orderNumber}`] || null
    });
  });

  app.get('/api/payments/store-ledger', (req: Request, res: Response) => {
    const storeId = String(req.query?.storeId || '').trim();
    if (!storeId) {
      res.json({ ok: true, payments: {} });
      return;
    }
    const prefix = `${storeId}:`;
    const payments: Record<string, StoredOrderPaymentRecord> = {};
    Object.entries(platformState.orderPayments).forEach(([k, v]) => {
      if (k.startsWith(prefix)) {
        payments[v.orderNumber] = v;
      }
    });
    res.json({ ok: true, payments });
  });
}
