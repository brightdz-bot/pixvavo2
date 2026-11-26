import type {
  Plan,
  PlatformPaymentSettings,
  PlatformStoreOverview,
  StaffRole,
  SubscriptionRequest,
  TeamMember
} from '../types';

// Session tokens stay strictly in JS memory (never written to localStorage/sessionStorage)
let ownerBearerToken: string | null = null;
let staffBearerToken: string | null = null;

export function getOwnerToken(): string | null {
  return ownerBearerToken;
}

export function setOwnerToken(token: string | null): void {
  ownerBearerToken = token;
}

export function getStaffToken(): string | null {
  return staffBearerToken;
}

export function setStaffToken(token: string | null): void {
  staffBearerToken = token;
}

async function apiJson<T = any>(
  url: string,
  options: RequestInit = {},
  authKind: 'none' | 'owner' | 'staff' = 'none'
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {})
  };
  if (authKind === 'owner' && ownerBearerToken) {
    headers.Authorization = `Bearer ${ownerBearerToken}`;
  } else if (authKind === 'staff' && staffBearerToken) {
    headers.Authorization = `Bearer ${staffBearerToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({ ok: false, message: 'تعذر قراءة استجابة الخادم' }));
  return data as T;
}

export interface OwnerOverviewResponse {
  ok: boolean;
  message?: string;
  summary?: {
    totalStores: number;
    activeStores: number;
    trialStores: number;
    suspendedStores: number;
    pendingRequests: number;
    estimatedMrrDZD: number;
    totalOrdersAllStores: number;
  };
  stores?: PlatformStoreOverview[];
  plans?: Plan[];
  subscriptionRequests?: SubscriptionRequest[];
  paymentSettings?: PlatformPaymentSettings;
}

export const platformApi = {
  // ── Platform Owner Auth & Control Center ──
  async getOwnerStatus(): Promise<{
    ok: boolean;
    configured?: boolean;
    needsSetup?: boolean;
    usesEnvOverride?: boolean;
    ownerEmailHint?: string;
  }> {
    try {
      return await apiJson('/api/owner/status');
    } catch {
      return { ok: false };
    }
  },

  async claimOwnerPassword(email: string, password: string): Promise<{
    ok: boolean;
    token?: string;
    owner?: { email: string; name: string };
    message?: string;
  }> {
    const res = await apiJson<any>('/api/owner/claim', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.ok && res.token) {
      ownerBearerToken = res.token;
    }
    return res;
  },

  async loginOwner(email: string, password: string): Promise<{
    ok: boolean;
    token?: string;
    owner?: { email: string; name: string };
    needsSetup?: boolean;
    message?: string;
  }> {
    const res = await apiJson<any>('/api/owner/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.ok && res.token) {
      ownerBearerToken = res.token;
    }
    return res;
  },

  async logoutOwner(): Promise<void> {
    try {
      await apiJson('/api/owner/logout', { method: 'POST' }, 'owner');
    } catch {
      // ignore
    } finally {
      ownerBearerToken = null;
    }
  },

  async getOwnerOverview(): Promise<OwnerOverviewResponse> {
    return apiJson<OwnerOverviewResponse>('/api/owner/overview', { method: 'GET' }, 'owner');
  },

  async updateStoreStatus(
    storeId: string,
    status: 'active' | 'trial' | 'suspended',
    suspendedReason?: string
  ): Promise<{ ok: boolean; store?: PlatformStoreOverview; message?: string }> {
    return apiJson(
      `/api/owner/stores/${encodeURIComponent(storeId)}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ status, suspendedReason })
      },
      'owner'
    );
  },

  async updateStorePlan(
    storeId: string,
    planId: string,
    extendDays?: number,
    status?: 'active' | 'trial' | 'suspended'
  ): Promise<{ ok: boolean; store?: PlatformStoreOverview; message?: string }> {
    return apiJson(
      `/api/owner/stores/${encodeURIComponent(storeId)}/plan`,
      {
        method: 'POST',
        body: JSON.stringify({ planId, extendDays, status })
      },
      'owner'
    );
  },

  async reviewSubscriptionRequest(
    requestId: string,
    decision: 'approve' | 'reject',
    rejectionReason?: string
  ): Promise<{ ok: boolean; request?: SubscriptionRequest; message?: string }> {
    return apiJson(
      `/api/owner/requests/${encodeURIComponent(requestId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, rejectionReason })
      },
      'owner'
    );
  },

  async updatePlanConfig(
    planId: string,
    patch: {
      priceDZD: number;
      maxLandingPages: number;
      maxMonthlyOrders: number;
      maxTeamMembers: number;
      allowOnlinePayment: boolean;
    }
  ): Promise<{ ok: boolean; plan?: Plan; message?: string }> {
    return apiJson(
      `/api/owner/plans/${encodeURIComponent(planId)}`,
      {
        method: 'POST',
        body: JSON.stringify(patch)
      },
      'owner'
    );
  },

  async saveOwnerBillingSettings(settings: {
    baridimobRip: string;
    baridimobAccountName: string;
    baridimobInstructions: string;
  }): Promise<{ ok: boolean; paymentSettings?: PlatformPaymentSettings; message?: string }> {
    return apiJson(
      '/api/owner/billing-settings',
      {
        method: 'POST',
        body: JSON.stringify(settings)
      },
      'owner'
    );
  },

  // ── Store Billing & Usage Sync ──
  async syncStoreUsage(payload: {
    storeId: string;
    name: string;
    subdomain: string;
    customDomain?: string;
    ownerEmail?: string;
    phone?: string;
    planId: string;
    status: 'active' | 'suspended' | 'trial';
    landingPagesCount: number;
    monthlyOrdersCount: number;
    totalOrdersCount: number;
    totalRevenueDZD: number;
    createdAt?: string;
  }): Promise<{ ok: boolean; store?: PlatformStoreOverview; plan?: Plan }> {
    try {
      return await apiJson('/api/billing/sync-store', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      return { ok: false };
    }
  },

  async getStoreBillingStatus(storeId: string): Promise<{
    ok: boolean;
    store?: PlatformStoreOverview | null;
    plan?: Plan;
    plans?: Plan[];
    requests?: SubscriptionRequest[];
    paymentSettings?: PlatformPaymentSettings;
  }> {
    try {
      return await apiJson(`/api/billing/store-status?storeId=${encodeURIComponent(storeId)}`);
    } catch {
      return { ok: false };
    }
  },

  async submitSubscriptionRequest(payload: {
    storeId: string;
    storeName: string;
    storeSubdomain: string;
    planId: string;
    paymentMethod: 'baridimob' | 'chargily';
    receiptImageUrl?: string;
    transactionRef?: string;
    notes?: string;
    returnUrl?: string;
  }): Promise<{
    ok: boolean;
    request?: SubscriptionRequest;
    checkoutUrl?: string;
    message?: string;
  }> {
    return apiJson('/api/billing/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // ── Team & Role-Based Access Control ──
  async getTeamMembers(storeId: string): Promise<{ ok: boolean; members?: TeamMember[]; message?: string }> {
    return apiJson(`/api/team/members?storeId=${encodeURIComponent(storeId)}`, { method: 'GET' });
  },

  async createTeamMember(payload: {
    storeId: string;
    name: string;
    email: string;
    password: string;
    role: Exclude<StaffRole, 'owner'>;
  }): Promise<{ ok: boolean; member?: TeamMember; code?: string; message?: string }> {
    return apiJson('/api/team/members', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateTeamMember(
    memberId: string,
    payload: {
      storeId: string;
      isActive?: boolean;
      role?: Exclude<StaffRole, 'owner'>;
      password?: string;
    }
  ): Promise<{ ok: boolean; member?: TeamMember; message?: string }> {
    return apiJson(`/api/team/members/${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },

  async deleteTeamMember(memberId: string, storeId: string): Promise<{ ok: boolean; message?: string }> {
    return apiJson(
      `/api/team/members/${encodeURIComponent(memberId)}?storeId=${encodeURIComponent(storeId)}`,
      { method: 'DELETE' }
    );
  },

  async loginStaff(email: string, password: string, storeId?: string): Promise<{
    ok: boolean;
    token?: string;
    member?: TeamMember;
    message?: string;
  }> {
    const res = await apiJson<any>('/api/team/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, storeId })
    });
    if (res.ok && res.token) {
      staffBearerToken = res.token;
    }
    return res;
  },

  async logoutStaff(): Promise<void> {
    try {
      await apiJson('/api/team/logout', { method: 'POST' }, 'staff');
    } catch {
      // ignore
    } finally {
      staffBearerToken = null;
    }
  },

  // ── Customer Online Payments (Chargily Pay v2 & BaridiMob) ──
  async createChargilyCheckout(payload: {
    storeId: string;
    orderNumber: string;
    amountDZD: number;
    description: string;
    successUrl: string;
    failureUrl: string;
  }): Promise<{ ok: boolean; checkoutUrl?: string; checkoutId?: string; message?: string }> {
    return apiJson('/api/payments/chargily/create-checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async recordBaridimobOrderPayment(payload: {
    storeId: string;
    orderNumber: string;
    amountDZD: number;
    receiptImageUrl?: string;
    transactionRef?: string;
  }): Promise<{ ok: boolean; message?: string }> {
    return apiJson('/api/payments/baridimob/record', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async verifyOrderPayment(payload: {
    storeId: string;
    orderNumber: string;
    paymentStatus: 'paid' | 'failed' | 'pending_verification';
  }): Promise<{ ok: boolean; message?: string }> {
    return apiJson('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getStorePaymentsLedger(storeId: string): Promise<
    Record<
      string,
      {
        orderNumber: string;
        paymentMethod: 'cod' | 'chargily' | 'baridimob';
        paymentStatus: 'unpaid' | 'pending_verification' | 'paid' | 'failed';
        checkoutId?: string;
        receiptImageUrl?: string;
        transactionRef?: string;
      }
    >
  > {
    try {
      const res = await apiJson<any>(
        `/api/payments/store-ledger?storeId=${encodeURIComponent(storeId)}`
      );
      return res?.ok && res?.payments ? res.payments : {};
    } catch {
      return {};
    }
  }
};
