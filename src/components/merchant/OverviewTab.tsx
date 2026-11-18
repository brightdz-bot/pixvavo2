import React, { useState, useEffect, useMemo } from 'react';
import { Store, Order, LandingPage, StoreApiConfig } from '../../types';
import { formatDZD, ALGERIA_WILAYAS } from '../../data/wilayas';
import { ORDER_STAGE_LABELS } from '../../services/integrations';
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  CheckCircle,
  Eye,
  DollarSign,
  Megaphone,
  Percent,
  MapPin,
  Layers,
  RotateCcw,
  Truck,
  CheckCircle2,
  Save,
  Info,
  Wallet
} from 'lucide-react';

interface Props {
  store: Store;
  orders: Order[];
  landingPages: LandingPage[];
  apiConfig?: StoreApiConfig | null;
  onSaveAdSpend?: (adSpendTotal: number, adSpendByPage: Record<string, number>) => Promise<void> | void;
  onSelectOrder: (order: Order) => void;
  onGoToPages: () => void;
  onRestockPage: (pageId: string, addedStock: number) => void;
}

type PeriodFilter = 'all' | 'today' | '7d' | '30d';
type BreakdownTab = 'pages' | 'wilayas';
type WilayaSortKey = 'orders' | 'retour' | 'delivery' | 'revenue';

interface CohortStats {
  total: number;
  newCount: number;
  confirmedWaitingCount: number;
  shippingCount: number;
  confirmedTotal: number;
  deliveredCount: number;
  retourCount: number;
  cancelledPreConfirmCount: number;
  confirmationRate: number;
  deliveryRate: number;
  retourRate: number;
  productRevenue: number;
  totalCodCollected: number;
  cogs: number;
  missingCostDeliveredCount: number;
}

function everConfirmedOrder(order: Order): boolean {
  if (order.status === 'confirmed' || order.status === 'shipping' || order.status === 'delivered') {
    return true;
  }
  return (order.statusHistory || []).some(
    h => h.status === 'confirmed' || h.status === 'shipping' || h.status === 'delivered'
  );
}

function resolveOrderCost(order: Order, landingPages: LandingPage[]): { cost: number; matched: boolean } {
  const pageId = order.landingPageId || order.items[0]?.productId;
  const page = landingPages.find(p => p.id === pageId);
  if (!page || !page.offers || page.offers.length === 0) {
    return { cost: 0, matched: false };
  }

  const itemPid = order.items[0]?.productId;
  const bundleText = (order.bundleLabel || order.items[0]?.variantText || '').trim();
  const qtyMatch = bundleText.match(/الكمية:\s*(\d+)/);
  const parsedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;

  const sortedOffers = [...page.offers].sort((a, b) => (b.title?.length || 0) - (a.title?.length || 0));

  const matchedOffer =
    page.offers.find(o => o.id === itemPid) ||
    sortedOffers.find(o => o.title && bundleText && bundleText.includes(o.title)) ||
    page.offers.find(o => o.price === order.subtotal) ||
    (parsedQty > 0 ? page.offers.find(o => o.quantity === parsedQty) : undefined);

  if (matchedOffer && matchedOffer.costPrice !== undefined && matchedOffer.costPrice > 0) {
    return { cost: matchedOffer.costPrice, matched: true };
  }

  return { cost: 0, matched: false };
}

function computeCohortStats(subset: Order[], landingPages: LandingPage[]): CohortStats {
  const total = subset.length;
  const confirmedList = subset.filter(everConfirmedOrder);
  const deliveredList = subset.filter(o => o.status === 'delivered');
  const retourList = subset.filter(
    o =>
      o.status === 'cancelled' &&
      (o.statusHistory || []).some(h => h.status === 'confirmed' || h.status === 'shipping')
  );
  const cancelledPreConfirmList = subset.filter(
    o =>
      o.status === 'cancelled' &&
      !(o.statusHistory || []).some(h => h.status === 'confirmed' || h.status === 'shipping')
  );

  const newCount = subset.filter(o => o.status === 'new').length;
  const confirmedWaitingCount = subset.filter(o => o.status === 'confirmed').length;
  const shippingCount = subset.filter(o => o.status === 'shipping').length;

  const confirmedTotal = confirmedList.length;
  const deliveredCount = deliveredList.length;
  const retourCount = retourList.length;
  const cancelledPreConfirmCount = cancelledPreConfirmList.length;

  const confirmationRate = total > 0 ? (confirmedTotal / total) * 100 : 0;
  const deliveryRate = confirmedTotal > 0 ? (deliveredCount / confirmedTotal) * 100 : 0;
  const retourRate = confirmedTotal > 0 ? (retourCount / confirmedTotal) * 100 : 0;

  const productRevenue = deliveredList.reduce((sum, o) => sum + (o.subtotal || 0), 0);
  const totalCodCollected = deliveredList.reduce((sum, o) => sum + (o.total || 0), 0);

  let cogs = 0;
  let missingCostDeliveredCount = 0;
  for (const ord of deliveredList) {
    const resolved = resolveOrderCost(ord, landingPages);
    cogs += resolved.cost;
    if (!resolved.matched) {
      missingCostDeliveredCount += 1;
    }
  }

  return {
    total,
    newCount,
    confirmedWaitingCount,
    shippingCount,
    confirmedTotal,
    deliveredCount,
    retourCount,
    cancelledPreConfirmCount,
    confirmationRate,
    deliveryRate,
    retourRate,
    productRevenue,
    totalCodCollected,
    cogs,
    missingCostDeliveredCount
  };
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value * 10) / 10}%`;
}

export const OverviewTab: React.FC<Props> = ({
  orders,
  landingPages,
  apiConfig,
  onSaveAdSpend,
  onSelectOrder,
  onGoToPages,
  onRestockPage
}) => {
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>('pages');
  const [wilayaSort, setWilayaSort] = useState<WilayaSortKey>('orders');

  const [draftGeneralAdSpend, setDraftGeneralAdSpend] = useState<number>(apiConfig?.adSpendTotal ?? 0);
  const [draftPageAdSpend, setDraftPageAdSpend] = useState<Record<string, number>>(
    apiConfig?.adSpendByPage ?? {}
  );
  const [isSavingAdSpend, setIsSavingAdSpend] = useState(false);

  const [restockModalPage, setRestockModalPage] = useState<LandingPage | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);

  useEffect(() => {
    setDraftGeneralAdSpend(apiConfig?.adSpendTotal ?? 0);
    setDraftPageAdSpend(apiConfig?.adSpendByPage ?? {});
  }, [apiConfig?.adSpendTotal, apiConfig?.adSpendByPage]);

  const filteredOrders = useMemo(() => {
    if (period === 'all') return orders;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let cutoff = 0;
    if (period === 'today') {
      cutoff = startOfToday;
    } else if (period === '7d') {
      cutoff = now.getTime() - 7 * 86400000;
    } else if (period === '30d') {
      cutoff = now.getTime() - 30 * 86400000;
    }
    return orders.filter(o => new Date(o.createdAt).getTime() >= cutoff);
  }, [orders, period]);

  const storeStats = useMemo(
    () => computeCohortStats(filteredOrders, landingPages),
    [filteredOrders, landingPages]
  );

  const allocatedPageSpend = useMemo(
    () =>
      Object.values(draftPageAdSpend).reduce((sum, val) => sum + Math.max(0, Number(val) || 0), 0),
    [draftPageAdSpend]
  );

  const totalAdSpend = Math.max(0, Number(draftGeneralAdSpend) || 0) + allocatedPageSpend;
  const netProfit = storeStats.productRevenue - storeStats.cogs - totalAdSpend;
  const netMarginPct =
    storeStats.productRevenue > 0 ? (netProfit / storeStats.productRevenue) * 100 : 0;
  const totalInvestment = storeStats.cogs + totalAdSpend;
  const roiPct = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
  const roas = totalAdSpend > 0 ? storeStats.productRevenue / totalAdSpend : 0;

  const hasUnsavedAdSpend =
    Math.max(0, Number(draftGeneralAdSpend) || 0) !== (apiConfig?.adSpendTotal ?? 0) ||
    JSON.stringify(draftPageAdSpend) !== JSON.stringify(apiConfig?.adSpendByPage ?? {});

  const handleSaveAdSpendClick = async () => {
    if (!onSaveAdSpend) return;
    setIsSavingAdSpend(true);
    try {
      await onSaveAdSpend(Math.max(0, Number(draftGeneralAdSpend) || 0), draftPageAdSpend);
    } finally {
      setIsSavingAdSpend(false);
    }
  };

  // Breakdown by Landing Page
  const pageRows = useMemo(() => {
    const knownIds = new Set(landingPages.map(p => p.id));
    const rows = landingPages.map(page => {
      const pageOrders = filteredOrders.filter(
        o => o.landingPageId === page.id || o.items[0]?.productId === page.id
      );
      const stats = computeCohortStats(pageOrders, landingPages);
      const pageAds = Math.max(0, Number(draftPageAdSpend[page.id]) || 0);
      const pageProfit = stats.productRevenue - stats.cogs - pageAds;
      return {
        id: page.id,
        title: page.title || page.slug,
        image: page.mainImage,
        isPublished: page.isPublished,
        stats,
        pageAds,
        netProfit: pageProfit
      };
    });

    const unlinkedOrders = filteredOrders.filter(o => {
      const pid = o.landingPageId || o.items[0]?.productId;
      return !pid || !knownIds.has(pid);
    });
    if (unlinkedOrders.length > 0) {
      const stats = computeCohortStats(unlinkedOrders, landingPages);
      rows.push({
        id: '__unlinked__',
        title: 'طلبات أخرى / غير مرتبطة بصفحة',
        image: '',
        isPublished: true,
        stats,
        pageAds: 0,
        netProfit: stats.productRevenue - stats.cogs
      });
    }

    return rows.sort((a, b) => b.stats.total - a.stats.total);
  }, [filteredOrders, landingPages, draftPageAdSpend]);

  // Breakdown by Wilaya
  const wilayaRows = useMemo(() => {
    const byWilaya = new Map<string, { code: string; name: string; orders: Order[] }>();
    for (const ord of filteredOrders) {
      const wId = ord.wilayaId || ord.wilayaName || 'unknown';
      const meta = ALGERIA_WILAYAS.find(w => w.id === ord.wilayaId || w.nameAr === ord.wilayaName);
      const existing = byWilaya.get(wId);
      if (existing) {
        existing.orders.push(ord);
      } else {
        byWilaya.set(wId, {
          code: meta?.code || ord.wilayaId || '—',
          name: meta?.nameAr || ord.wilayaName || 'غير محددة',
          orders: [ord]
        });
      }
    }

    const list = Array.from(byWilaya.entries()).map(([id, entry]) => ({
      id,
      code: entry.code,
      name: entry.name,
      stats: computeCohortStats(entry.orders, landingPages)
    }));

    return list.sort((a, b) => {
      if (wilayaSort === 'retour') {
        return b.stats.retourRate - a.stats.retourRate || b.stats.retourCount - a.stats.retourCount;
      }
      if (wilayaSort === 'delivery') {
        return b.stats.deliveryRate - a.stats.deliveryRate || b.stats.deliveredCount - a.stats.deliveredCount;
      }
      if (wilayaSort === 'revenue') {
        return b.stats.productRevenue - a.stats.productRevenue;
      }
      return b.stats.total - a.stats.total;
    });
  }, [filteredOrders, landingPages, wilayaSort]);

  const newOrders = filteredOrders.filter(o => o.status === 'new');
  const shippingOrders = filteredOrders.filter(o => o.status === 'shipping');
  const lowStockPages = landingPages.filter(p => p.stock <= 5);

  const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const salesByDay = new Map<string, number>();
  orders
    .filter(o => o.status !== 'cancelled')
    .forEach(o => {
      const k = dayKey(new Date(o.createdAt));
      salesByDay.set(k, (salesByDay.get(k) || 0) + o.subtotal);
    });
  const last7DaysData = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      dayName: daysOfWeek[date.getDay()],
      amount: salesByDay.get(dayKey(date)) || 0,
      isToday: i === 6
    };
  });

  const maxDailyAmount = Math.max(...last7DaysData.map(d => d.amount), 1);
  const pendingValue = filteredOrders
    .filter(o => o.status === 'new' || o.status === 'confirmed' || o.status === 'shipping')
    .reduce((sum, o) => sum + o.subtotal, 0);

  const handleConfirmRestock = () => {
    if (restockModalPage && restockAmount > 0) {
      onRestockPage(restockModalPage.id, restockAmount);
      setRestockModalPage(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Period Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>لوحة الأرباح الحقيقية ونسب التأكيد والتوصيل</span>
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            تحليل صافي الربح بعد خصم تكلفة البضاعة ومصاريف الإعلانات + تتبع نسب التأكيد، التوصيل والمرتجع
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(
            [
              { id: 'all', label: 'كل الفترات' },
              { id: '30d', label: '30 يوماً' },
              { id: '7d', label: '7 أيام' },
              { id: 'today', label: 'اليوم' }
            ] as const
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === opt.id
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Financial & Funnel KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Real Net Profit */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              الربح الصافي الحقيقي
            </span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                netProfit >= 0
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-black tabular-nums ${
              netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatDZD(netProfit)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold tabular-nums">
            <span className="text-slate-600 dark:text-slate-300">
              هامش صافي: {formatPct(netMarginPct)}
            </span>
            {totalAdSpend > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                ROAS: {roas.toFixed(2)}x
              </span>
            )}
            {totalInvestment > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                ROI: {formatPct(roiPct)}
              </span>
            )}
          </div>
        </div>

        {/* 2. Product Revenue & COD */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              إيراد المنتجات المحصلة
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {formatDZD(storeStats.productRevenue)}
          </div>
          <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            <div className="flex items-center justify-between">
              <span>إجمالي COD (مع التوصيل):</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {formatDZD(storeStats.totalCodCollected)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>تكلفة البضاعة (COGS):</span>
              <span className="font-bold text-rose-600 dark:text-rose-400">
                -{formatDZD(storeStats.cogs)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Confirmation & Delivery Funnel Rates */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              نسب التأكيد والتوصيل والمرتجع
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30">
              <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300">التأكيد</div>
              <div className="text-base font-black text-blue-700 dark:text-blue-300 tabular-nums">
                {formatPct(storeStats.confirmationRate)}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30">
              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">التوصيل</div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                {formatPct(storeStats.deliveryRate)}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-rose-50/70 dark:bg-rose-950/30">
              <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300">المرتجع</div>
              <div className="text-base font-black text-rose-600 dark:text-rose-400 tabular-nums">
                {formatPct(storeStats.retourRate)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {storeStats.confirmedTotal} مؤكد من {storeStats.total} · {storeStats.deliveredCount} مسلّم · {storeStats.retourCount} مرتجع
          </div>
        </div>

        {/* 4. Pipeline & Pending */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              الطلبات النشطة وقيد التحصيل
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
            {newOrders.length} قيد التأكيد
          </div>
          <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>قيد التحصيل: {formatDZD(pendingValue)}</span>
            </div>
            <div>
              {shippingOrders.length} في التوصيل · {storeStats.cancelledPreConfirmCount} ملغي قبل التأكيد
            </div>
          </div>
        </div>
      </div>

      {/* Ad Spend & Profit Equation Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                مصاريف الإعلانات ومعادلة صافي الربح
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                الربح الصافي = إيراد المنتجات المحصلة ({formatDZD(storeStats.productRevenue)}) − تكلفة السلع ({formatDZD(storeStats.cogs)}) − إجمالي الإعلانات ({formatDZD(totalAdSpend)})
              </p>
            </div>
          </div>

          {onSaveAdSpend && (
            <button
              type="button"
              onClick={handleSaveAdSpendClick}
              disabled={isSavingAdSpend || !hasUnsavedAdSpend}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                hasUnsavedAdSpend
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {isSavingAdSpend
                  ? 'جارٍ الحفظ...'
                  : hasUnsavedAdSpend
                    ? 'حفظ مصاريف الإعلانات'
                    : 'محفوظ'}
              </span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              {allocatedPageSpend > 0
                ? 'مصاريف إعلانات عامة إضافية (دج)'
                : 'إجمالي مصاريف الإعلانات للمتجر (دج)'}
            </label>
            <input
              type="number"
              min="0"
              value={draftGeneralAdSpend}
              onChange={e => setDraftGeneralAdSpend(Math.max(0, Number(e.target.value) || 0))}
              placeholder="مثال: 15000"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>مصاريف صفحات الهبوط (من الجدول):</span>
              <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                {formatDZD(allocatedPageSpend)}
              </span>
            </div>
            <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
              <span>إجمالي الإعلانات المخصوم:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {formatDZD(totalAdSpend)}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>تكلفة الطلب المسلّم (CPA فعلي):</span>
              <span className="font-bold font-mono">
                {storeStats.deliveredCount > 0 && totalAdSpend > 0
                  ? formatDZD(Math.round(totalAdSpend / storeStats.deliveredCount))
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>تكلفة الرسالة / الطلب الوارد:</span>
              <span className="font-bold font-mono">
                {storeStats.total > 0 && totalAdSpend > 0
                  ? formatDZD(Math.round(totalAdSpend / storeStats.total))
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {storeStats.missingCostDeliveredCount > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                يوجد <strong>{storeStats.missingCostDeliveredCount}</strong> طلب مسلّم لباقات بدون «سعر التكلفة». أضف سعر تكلفة كل باقة في صفحة الهبوط لتحصل على ربح صافي دقيق 100%.
              </span>
            </div>
            <button
              type="button"
              onClick={onGoToPages}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer"
            >
              تعديل الأسعار والتكلفة
            </button>
          </div>
        )}
      </div>

      {/* Funnel Visual Progress Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>نسبة التأكيد (Confirmation Rate)</span>
            </span>
            <span className="font-black text-blue-600 tabular-nums">
              {formatPct(storeStats.confirmationRate)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, storeStats.confirmationRate))}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {storeStats.confirmedTotal} طلب مؤكد من إجمالي {storeStats.total} طلب
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>نسبة التوصيل (Delivery Rate)</span>
            </span>
            <span className="font-black text-emerald-600 tabular-nums">
              {formatPct(storeStats.deliveryRate)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, storeStats.deliveryRate))}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {storeStats.deliveredCount} مسلّم بنجاح من أصل {storeStats.confirmedTotal} طلب مؤكد
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span>نسبة المرتجع (Retour %)</span>
            </span>
            <span className="font-black text-rose-600 tabular-nums">
              {formatPct(storeStats.retourRate)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-rose-600 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, storeStats.retourRate))}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {storeStats.retourCount} مرتجع بعد التأكيد/الشحن · {storeStats.cancelledPreConfirmCount} إلغاء قبل التأكيد
          </div>
        </div>
      </div>

      {/* Breakdown Analytics Tabs: Per Landing Page vs Per Wilaya */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setBreakdownTab('pages')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                breakdownTab === 'pages'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>الأرباح والنسب حسب صفحة الهبوط</span>
            </button>
            <button
              type="button"
              onClick={() => setBreakdownTab('wilayas')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                breakdownTab === 'wilayas'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>نسب التأكيد والتوصيل حسب الولاية ({wilayaRows.length})</span>
            </button>
          </div>

          {breakdownTab === 'wilayas' && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 font-semibold">ترتيب حسب:</span>
              {(
                [
                  { id: 'orders', label: 'الأكثر طلباً' },
                  { id: 'retour', label: 'الأعلى مرتجعاً' },
                  { id: 'delivery', label: 'الأعلى توصيلاً' },
                  { id: 'revenue', label: 'الأعلى مبيعاً' }
                ] as const
              ).map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setWilayaSort(s.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    wilayaSort === s.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {breakdownTab === 'pages' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="pb-3 font-semibold">صفحة الهبوط / المنتج</th>
                  <th className="pb-3 font-semibold">الطلبات</th>
                  <th className="pb-3 font-semibold">التأكيد %</th>
                  <th className="pb-3 font-semibold">التوصيل %</th>
                  <th className="pb-3 font-semibold">المرتجع %</th>
                  <th className="pb-3 font-semibold">الإيراد (مسلّم)</th>
                  <th className="pb-3 font-semibold">تكلفة البضاعة</th>
                  <th className="pb-3 font-semibold">مصاريف الإعلان (دج)</th>
                  <th className="pb-3 font-semibold text-left">الربح الصافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3.5">
                      <div className="flex items-center gap-2.5">
                        {row.image ? (
                          <img
                            src={row.image}
                            alt={row.title}
                            className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate max-w-[190px]">
                            {row.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {row.stats.deliveredCount} مسلّم · {row.stats.retourCount} مرتجع
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 font-bold tabular-nums">{row.stats.total}</td>
                    <td className="py-3.5 font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                      {formatPct(row.stats.confirmationRate)}
                    </td>
                    <td className="py-3.5 font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatPct(row.stats.deliveryRate)}
                    </td>
                    <td className="py-3.5 tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold ${
                          row.stats.retourRate >= 25
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {formatPct(row.stats.retourRate)}
                      </span>
                    </td>
                    <td className="py-3.5 font-bold tabular-nums">{formatDZD(row.stats.productRevenue)}</td>
                    <td className="py-3.5 text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                      {formatDZD(row.stats.cogs)}
                    </td>
                    <td className="py-3.5">
                      {row.id !== '__unlinked__' ? (
                        <input
                          type="number"
                          min="0"
                          value={draftPageAdSpend[row.id] ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0);
                            setDraftPageAdSpend(prev => ({ ...prev, [row.id]: val }));
                          }}
                          placeholder="0"
                          className="w-24 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className={`py-3.5 font-black text-left tabular-nums ${
                        row.netProfit >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatDZD(row.netProfit)}
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      لا توجد صفحات هبوط أو طلبات في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="pb-3 font-semibold">الولاية</th>
                  <th className="pb-3 font-semibold">إجمالي الطلبات</th>
                  <th className="pb-3 font-semibold">التفاصيل (مؤكد / مسلّم / مرتجع)</th>
                  <th className="pb-3 font-semibold">نسبة التأكيد %</th>
                  <th className="pb-3 font-semibold">نسبة التوصيل %</th>
                  <th className="pb-3 font-semibold">نسبة المرتجع (Retour %)</th>
                  <th className="pb-3 font-semibold text-left">المبيعات المحصلة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {wilayaRows.map(w => (
                  <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 font-bold text-slate-900 dark:text-white">
                      <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">
                        {w.code}
                      </span>
                      {w.name}
                    </td>
                    <td className="py-3.5 font-black tabular-nums">{w.stats.total}</td>
                    <td className="py-3.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {w.stats.confirmedTotal} مؤكد · {w.stats.deliveredCount} مسلّم · {w.stats.retourCount} مرتجع
                    </td>
                    <td className="py-3.5 font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                      {formatPct(w.stats.confirmationRate)}
                    </td>
                    <td className="py-3.5 font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatPct(w.stats.deliveryRate)}
                    </td>
                    <td className="py-3.5 tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold ${
                          w.stats.retourRate >= 25
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : w.stats.retourRate >= 15
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {formatPct(w.stats.retourRate)}
                      </span>
                    </td>
                    <td className="py-3.5 font-black text-left tabular-nums">
                      {formatDZD(w.stats.productRevenue)}
                    </td>
                  </tr>
                ))}
                {wilayaRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      لا توجد طلبات مسجلة في هذه الفترة لعرض إحصائيات الولايات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7-Day Chart + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>حركة مبيعات المنتجات خلال آخر 7 أيام (دج)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                إجمالي قيمة طلبات صفحات الهبوط غير الملغاة (صافي البضاعة قبل الشحن)
              </p>
            </div>
          </div>

          <div className="pt-6 pb-2">
            <div className="h-48 flex items-end justify-between gap-3 sm:gap-6 px-2">
              {last7DaysData.map((day, idx) => {
                const heightPercent = day.amount > 0 ? Math.max((day.amount / maxDailyAmount) * 100, 8) : 2;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 bg-slate-900 text-white text-[11px] py-1 px-2 rounded tabular-nums shadow-md pointer-events-none whitespace-nowrap z-10">
                      {formatDZD(day.amount)}
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl h-full flex items-end p-1">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-lg transition-all duration-500 ${
                          day.isToday
                            ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-lg'
                            : 'bg-emerald-500/70 hover:bg-emerald-500'
                        }`}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      {day.dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>تنبيهات المخزون</span>
              </h3>
              <button
                onClick={onGoToPages}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
              >
                صفحات الهبوط
              </button>
            </div>

            {lowStockPages.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                <p>جميع صفحات العروض متوفرة بكميات كافية</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockPages.slice(0, 3).map(lp => (
                  <div
                    key={lp.id}
                    className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <img
                        src={lp.mainImage}
                        alt={lp.title}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {lp.title}
                        </div>
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                          باقي: {lp.stock} قطع
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setRestockModalPage(lp)}
                      className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shrink-0 cursor-pointer"
                    >
                      تزويد
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            عدد صفحات الهبوط المنشورة: {landingPages.filter(p => p.isPublished).length}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">أحدث الطلبات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="pb-3 font-semibold">رقم الطلب</th>
                <th className="pb-3 font-semibold">الزبون والولاية</th>
                <th className="pb-3 font-semibold">المنتج / الباقة</th>
                <th className="pb-3 font-semibold">المجموع</th>
                <th className="pb-3 font-semibold">الحالة</th>
                <th className="pb-3 font-semibold text-left">عرض</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredOrders.slice(0, 6).map(order => (
                <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3.5 font-bold font-mono text-slate-900 dark:text-white">
                    #{order.orderNumber}
                  </td>
                  <td className="py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-white">{order.customerName}</div>
                    <div className="text-[11px] text-slate-500">
                      {order.wilayaName}
                      {order.commune ? ` - ${order.commune}` : ''} · {order.customerPhone}
                    </div>
                  </td>
                  <td className="py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {order.bundleLabel || order.items.map(it => it.title).join(', ')}
                  </td>
                  <td className="py-3.5 font-black text-slate-900 dark:text-white tabular-nums">
                    {formatDZD(order.total)}
                  </td>
                  <td className="py-3.5 font-bold text-xs">{ORDER_STAGE_LABELS[order.status]}</td>
                  <td className="py-3.5 text-left">
                    <button
                      onClick={() => onSelectOrder(order)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>تفاصيل</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {restockModalPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">تزويد المخزون</h3>
            <p className="text-xs text-slate-500">
              {restockModalPage.title} (المتوفر حالياً: {restockModalPage.stock})
            </p>
            <input
              type="number"
              min="1"
              value={restockAmount}
              onChange={e => setRestockAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRestockModalPage(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmRestock}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
