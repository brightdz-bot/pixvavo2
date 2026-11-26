import { AbandonedOrder, BlacklistEntry, Order } from '../types';
import { normalizePhoneCanonical } from '../services/integrations';

export type CustomerSegment = 'blocked' | 'vip' | 'risk' | 'regular' | 'lead';

export interface CustomerProfile {
  phoneKey: string;
  displayPhone: string;
  latestName: string;
  latestWilaya: string;
  latestCommune: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  abandonedCount: number;
  deliveryRate: number | null; // 0..100 or null when no delivered/cancelled orders yet
  lifetimeSpend: number; // DZD delivered
  totalOrderedValue: number; // DZD non-cancelled
  lastOrderAt: string;
  segment: CustomerSegment;
  isBlacklisted: boolean;
  blacklistReason?: string;
  orders: Order[];
  abandonedOrders: AbandonedOrder[];
}

export interface CustomerKpis {
  totalCustomers: number;
  vipCount: number;
  riskCount: number;
  blockedCount: number;
  leadsOnlyCount: number;
  averageDeliveryRate: number | null;
  totalDeliveredRevenue: number;
}

export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: 'زبون وفي',
  regular: 'زبون عادي',
  lead: 'مهتم (طلب متروك)',
  risk: 'مخاطر مرتجعات',
  blocked: 'محظور'
};

export function aggregateCustomers(params: {
  orders: Order[];
  abandonedOrders: AbandonedOrder[];
  blacklistedPhones?: BlacklistEntry[];
  returnThreshold?: number;
}): CustomerProfile[] {
  const threshold = Math.max(1, Number(params.returnThreshold ?? 2));
  const blacklistMap = new Map<string, BlacklistEntry>();
  for (const entry of params.blacklistedPhones || []) {
    const key = normalizePhoneCanonical(entry.phone);
    if (key) blacklistMap.set(key, entry);
  }

  type Bucket = {
    phoneKey: string;
    displayPhone: string;
    orders: Order[];
    abandonedOrders: AbandonedOrder[];
  };

  const buckets = new Map<string, Bucket>();

  for (const order of params.orders || []) {
    const key = normalizePhoneCanonical(order.customerPhone);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        phoneKey: key,
        displayPhone: key,
        orders: [],
        abandonedOrders: []
      };
      buckets.set(key, bucket);
    }
    bucket.orders.push(order);
  }

  for (const ab of params.abandonedOrders || []) {
    const key = normalizePhoneCanonical(ab.customerPhone);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        phoneKey: key,
        displayPhone: key,
        orders: [],
        abandonedOrders: []
      };
      buckets.set(key, bucket);
    }
    bucket.abandonedOrders.push(ab);
  }

  const profiles: CustomerProfile[] = [];

  for (const bucket of buckets.values()) {
    bucket.orders.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    bucket.abandonedOrders.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );

    const latestOrder = bucket.orders[0];
    const latestAbandoned = bucket.abandonedOrders[0];

    const latestName =
      (latestOrder?.customerName || '').trim() ||
      (latestAbandoned?.customerName || '').trim() ||
      'زبون بدون اسم';
    const latestWilaya =
      (latestOrder?.wilayaName || '').trim() ||
      (latestAbandoned?.wilayaName || '').trim() ||
      'غير محدد';
    const latestCommune =
      (latestOrder?.commune || '').trim() ||
      (latestAbandoned?.commune || '').trim() ||
      '';

    const totalOrders = bucket.orders.length;
    const deliveredOrders = bucket.orders.filter(o => o.status === 'delivered').length;
    const cancelledOrders = bucket.orders.filter(o => o.status === 'cancelled').length;
    const activeOrders = totalOrders - deliveredOrders - cancelledOrders;
    const abandonedCount = bucket.abandonedOrders.filter(a => a.status !== 'recovered').length;

    const finalized = deliveredOrders + cancelledOrders;
    const deliveryRate = finalized > 0 ? Math.round((deliveredOrders / finalized) * 100) : null;

    const lifetimeSpend = bucket.orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const totalOrderedValue = bucket.orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const latestOrderTs = latestOrder ? new Date(latestOrder.createdAt).getTime() : 0;
    const latestAbTs = latestAbandoned
      ? new Date(latestAbandoned.updatedAt || latestAbandoned.createdAt).getTime()
      : 0;
    const lastOrderAt =
      latestOrderTs >= latestAbTs
        ? latestOrder?.createdAt || new Date().toISOString()
        : latestAbandoned?.updatedAt || latestAbandoned?.createdAt || new Date().toISOString();

    const blEntry = blacklistMap.get(bucket.phoneKey);
    const isBlacklisted = Boolean(blEntry);

    let segment: CustomerSegment = 'regular';
    if (isBlacklisted) {
      segment = 'blocked';
    } else if (cancelledOrders >= threshold) {
      segment = 'risk';
    } else if (deliveredOrders >= 2 || lifetimeSpend >= 10000) {
      segment = 'vip';
    } else if (totalOrders === 0) {
      segment = 'lead';
    }

    profiles.push({
      phoneKey: bucket.phoneKey,
      displayPhone: bucket.displayPhone,
      latestName,
      latestWilaya,
      latestCommune,
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      activeOrders,
      abandonedCount,
      deliveryRate,
      lifetimeSpend,
      totalOrderedValue,
      lastOrderAt,
      segment,
      isBlacklisted,
      blacklistReason: blEntry?.reason,
      orders: bucket.orders,
      abandonedOrders: bucket.abandonedOrders
    });
  }

  return profiles.sort(
    (a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime()
  );
}

export function computeCustomerKpis(customers: CustomerProfile[]): CustomerKpis {
  let vipCount = 0;
  let riskCount = 0;
  let blockedCount = 0;
  let leadsOnlyCount = 0;
  let totalDelivered = 0;
  let totalFinalized = 0;
  let totalDeliveredRevenue = 0;

  for (const c of customers) {
    if (c.segment === 'vip') vipCount += 1;
    else if (c.segment === 'risk') riskCount += 1;
    else if (c.segment === 'blocked') blockedCount += 1;
    else if (c.segment === 'lead') leadsOnlyCount += 1;

    totalDelivered += c.deliveredOrders;
    totalFinalized += c.deliveredOrders + c.cancelledOrders;
    totalDeliveredRevenue += c.lifetimeSpend;
  }

  const averageDeliveryRate =
    totalFinalized > 0 ? Math.round((totalDelivered / totalFinalized) * 100) : null;

  return {
    totalCustomers: customers.length,
    vipCount,
    riskCount,
    blockedCount,
    leadsOnlyCount,
    averageDeliveryRate,
    totalDeliveredRevenue
  };
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '').replace(/\r?\n/g, ' ').trim();
  if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCustomersCsvContent(customers: CustomerProfile[]): string {
  const headers = [
    'رقم الهاتف',
    'الاسم الكامل',
    'الولاية',
    'البلدية',
    'التصنيف',
    'إجمالي الطلبات',
    'المسلّمة',
    'المرتجعة/الملغاة',
    'المتروكة',
    'نسبة الاستلام (%)',
    'إجمالي الإنفاق المسلّم (دج)',
    'آخر نشاط'
  ];

  const rows = customers.map(c => [
    c.displayPhone,
    c.latestName,
    c.latestWilaya,
    c.latestCommune,
    CUSTOMER_SEGMENT_LABELS[c.segment],
    c.totalOrders,
    c.deliveredOrders,
    c.cancelledOrders,
    c.abandonedCount,
    c.deliveryRate !== null ? `${c.deliveryRate}%` : '-',
    c.lifetimeSpend,
    c.lastOrderAt ? new Date(c.lastOrderAt).toISOString().slice(0, 10) : ''
  ]);

  return [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n');
}

export function exportCustomersToCsv(customers: CustomerProfile[], filePrefix = 'customers'): void {
  if (typeof window === 'undefined' || customers.length === 0) return;
  const csv = '\uFEFF' + buildCustomersCsvContent(customers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
