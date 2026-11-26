import React, { useMemo, useState } from 'react';
import {
  AbandonedOrder,
  BlacklistEntry,
  Order,
  OrderStatus,
  Store,
  StoreApiConfig
} from '../../types';
import { formatDZD, formatPlainDZD } from '../../data/wilayas';
import {
  normalizePhoneCanonical,
  normalizeWhatsAppNumber,
  ORDER_STAGE_LABELS
} from '../../services/integrations';
import {
  aggregateCustomers,
  computeCustomerKpis,
  CUSTOMER_SEGMENT_LABELS,
  CustomerProfile,
  CustomerSegment,
  exportCustomersToCsv
} from '../../utils/customerCrm';
import {
  Users,
  Search,
  Download,
  MessageCircle,
  Ban,
  ShieldCheck,
  Award,
  AlertTriangle,
  Eye,
  X,
  MapPin,
  Phone,
  ShoppingBag,
  Clock,
  ExternalLink
} from 'lucide-react';

interface Props {
  store: Store;
  orders: Order[];
  abandonedOrders: AbandonedOrder[];
  apiConfig?: StoreApiConfig | null;
  onSaveAntiFraudConfig?: (
    patch: Partial<Pick<StoreApiConfig, 'blacklistedPhones'>>,
    successMsg?: string
  ) => Promise<void>;
  onOpenOrder?: (order: Order) => void;
}

type SegmentFilter = 'all' | CustomerSegment;

const SEGMENT_TEXT_CLASS: Record<CustomerSegment, string> = {
  vip: 'text-emerald-700 dark:text-emerald-400',
  regular: 'text-slate-700 dark:text-slate-300',
  lead: 'text-amber-700 dark:text-amber-400',
  risk: 'text-rose-700 dark:text-rose-400',
  blocked: 'text-rose-700 dark:text-rose-400'
};

const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  new: 'text-amber-700 dark:text-amber-400',
  confirmed: 'text-blue-700 dark:text-blue-400',
  shipping: 'text-purple-700 dark:text-purple-400',
  delivered: 'text-emerald-700 dark:text-emerald-400',
  cancelled: 'text-rose-700 dark:text-rose-400'
};

export const CustomersTab: React.FC<Props> = ({
  store,
  orders,
  abandonedOrders,
  apiConfig,
  onSaveAntiFraudConfig,
  onOpenOrder
}) => {
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);

  const customers = useMemo(
    () =>
      aggregateCustomers({
        orders,
        abandonedOrders,
        blacklistedPhones: apiConfig?.blacklistedPhones || [],
        returnThreshold: apiConfig?.autoFlagReturnsThreshold ?? 2
      }),
    [orders, abandonedOrders, apiConfig?.blacklistedPhones, apiConfig?.autoFlagReturnsThreshold]
  );

  const kpis = useMemo(() => computeCustomerKpis(customers), [customers]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      if (segmentFilter !== 'all' && c.segment !== segmentFilter) return false;
      if (!q) return true;
      return (
        c.latestName.toLowerCase().includes(q) ||
        c.displayPhone.includes(q) ||
        c.latestWilaya.toLowerCase().includes(q) ||
        c.latestCommune.toLowerCase().includes(q)
      );
    });
  }, [customers, segmentFilter, search]);

  // Keep open drawer synchronized when blacklist changes
  const activeCustomer = useMemo(() => {
    if (!selectedCustomer) return null;
    return customers.find(c => c.phoneKey === selectedCustomer.phoneKey) || selectedCustomer;
  }, [customers, selectedCustomer]);

  const handleToggleBlacklist = async (customer: CustomerProfile) => {
    if (!onSaveAntiFraudConfig) return;
    const key = normalizePhoneCanonical(customer.displayPhone);
    if (!key) return;

    setBusyPhone(key);
    try {
      const currentList = apiConfig?.blacklistedPhones || [];
      const exists = currentList.some(e => normalizePhoneCanonical(e.phone) === key);
      if (exists) {
        const nextList = currentList.filter(e => normalizePhoneCanonical(e.phone) !== key);
        await onSaveAntiFraudConfig(
          { blacklistedPhones: nextList },
          `تم فك الحظر عن الرقم ${key}`
        );
      } else {
        const nextList: BlacklistEntry[] = [
          {
            phone: key,
            reason:
              customer.cancelledOrders > 0
                ? `حظر من سجل الزبائن (${customer.cancelledOrders} مرتجع/ملغى)`
                : 'حظر من سجل الزبائن',
            addedAt: new Date().toISOString()
          },
          ...currentList
        ];
        await onSaveAntiFraudConfig(
          { blacklistedPhones: nextList },
          `تم حظر الرقم ${key} وإضافته إلى القائمة السوداء`
        );
      }
    } finally {
      setBusyPhone(null);
    }
  };

  const buildCustomerWhatsAppHref = (customer: CustomerProfile) => {
    const wa = normalizeWhatsAppNumber(customer.displayPhone);
    const msg =
      customer.segment === 'vip'
        ? `السلام عليكم ${customer.latestName}، شكراً لوفائك لمتجر ${store.name}! لدينا عروض حصرية جديدة قد تهمك.`
        : `السلام عليكم ${customer.latestName}، نتواصل معك من متجر ${store.name} لمتابعة طلباتك ومساعدتك في أي استفسار.`;
    return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
  };

  const filterButtons: Array<{ id: SegmentFilter; label: string; count: number }> = [
    { id: 'all', label: 'جميع الزبائن', count: customers.length },
    { id: 'vip', label: 'الزبائن الأوفياء', count: kpis.vipCount },
    { id: 'risk', label: 'مخاطر المرتجعات', count: kpis.riskCount },
    { id: 'blocked', label: 'المحظورون', count: kpis.blockedCount },
    { id: 'lead', label: 'طلبات متروكة فقط', count: kpis.leadsOnlyCount }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            سجل الزبائن والولاء
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تجميع تلقائي لكل رقم هاتف عبر الطلبات والطلبات المتروكة مع نسبة الاستلام، سجل المشتريات، وتصدير الزبائن الأوفياء
          </p>
        </div>

        <button
          type="button"
          disabled={filteredCustomers.length === 0}
          onClick={() =>
            exportCustomersToCsv(
              filteredCustomers,
              `${store.subdomain || 'store'}-customers-${segmentFilter}`
            )
          }
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="tabular-nums">تصدير القائمة ({filteredCustomers.length})</span>
        </button>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>إجمالي الزبائن الفريدين</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {kpis.totalCustomers}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums">
            {kpis.leadsOnlyCount} مهتمون بدون طلب مكتمل
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-emerald-600" />
            <span>الزبائن الأوفياء</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {kpis.vipCount}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums">
            إجمالي المسلّم: {formatDZD(kpis.totalDeliveredRevenue)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>متوسط نسبة الاستلام</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {kpis.averageDeliveryRate !== null ? `${kpis.averageDeliveryRate}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400">
            من إجمالي الطلبات المسلّمة والملغاة
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>مخاطر المرتجعات / محظور</span>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
            {kpis.riskCount + kpis.blockedCount}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums">
            {kpis.riskCount} مرتجعات متكررة · {kpis.blockedCount} محظور
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {filterButtons.map(btn => {
            const active = segmentFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setSegmentFilter(btn.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <span>{btn.label}</span>
                <span className="text-[11px] opacity-75 tabular-nums">({btn.count})</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو الولاية..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredCustomers.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            لا يوجد زبائن مطابقون للبحث
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            سيظهر الزبائن هنا تلقائياً فور تسجيل أول طلب أو إدخال رقم هاتف في صفحة الهبوط
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-bold">الزبون والهاتف</th>
                    <th className="py-3 px-3 font-bold">الولاية والبلدية</th>
                    <th className="py-3 px-3 font-bold">التصنيف</th>
                    <th className="py-3 px-3 font-bold">الطلبات (مسلّم / مرتجع / متروك)</th>
                    <th className="py-3 px-3 font-bold">نسبة الاستلام</th>
                    <th className="py-3 px-3 font-bold">إجمالي الإنفاق</th>
                    <th className="py-3 px-4 font-bold text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredCustomers.map(c => (
                    <tr
                      key={c.phoneKey}
                      onClick={() => setSelectedCustomer(c)}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {c.latestName}
                        </div>
                        <div
                          dir="ltr"
                          className="font-mono text-[11px] text-slate-500 dark:text-slate-400 text-right tabular-nums"
                        >
                          {c.displayPhone}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-700 dark:text-slate-300">
                        <div className="font-semibold">{c.latestWilaya}</div>
                        {c.latestCommune && (
                          <div className="text-[11px] text-slate-400">{c.latestCommune}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`font-extrabold ${SEGMENT_TEXT_CLASS[c.segment]}`}>
                          {CUSTOMER_SEGMENT_LABELS[c.segment]}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 tabular-nums text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {c.totalOrders}
                        </span>
                        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {c.deliveredOrders} مسلّم
                        </span>
                        {c.cancelledOrders > 0 && (
                          <>
                            <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                              {c.cancelledOrders} ملغى
                            </span>
                          </>
                        )}
                        {c.abandonedCount > 0 && (
                          <>
                            <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              {c.abandonedCount} متروك
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-3 font-bold tabular-nums">
                        {c.deliveryRate === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={
                              c.deliveryRate >= 75
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : c.deliveryRate >= 50
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {c.deliveryRate}%
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 tabular-nums">
                        <div className="font-black text-slate-900 dark:text-white">
                          {formatDZD(c.lifetimeSpend)}
                        </div>
                        {c.totalOrderedValue > c.lifetimeSpend && (
                          <div className="text-[10px] text-slate-400">
                            قيد المعالجة: {formatPlainDZD(c.totalOrderedValue - c.lifetimeSpend)}
                          </div>
                        )}
                      </td>
                      <td
                        className="py-3.5 px-4 text-left"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                            title="عرض سجل الطلبات"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={buildCustomerWhatsAppHref(c)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366] text-[#15803d] hover:text-white transition-colors"
                            title="مراسلة عبر واتساب"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                          {onSaveAntiFraudConfig && (
                            <button
                              type="button"
                              disabled={busyPhone === c.phoneKey}
                              onClick={() => handleToggleBlacklist(c)}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                                c.isBlacklisted
                                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                  : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white'
                              }`}
                              title={c.isBlacklisted ? 'فك الحظر' : 'حظر الرقم'}
                            >
                              {c.isBlacklisted ? (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredCustomers.map(c => (
              <div
                key={c.phoneKey}
                onClick={() => setSelectedCustomer(c)}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {c.latestName}
                    </div>
                    <div
                      dir="ltr"
                      className="font-mono text-xs text-slate-500 text-right tabular-nums"
                    >
                      {c.displayPhone}
                    </div>
                  </div>
                  <span className={`text-xs font-extrabold ${SEGMENT_TEXT_CLASS[c.segment]}`}>
                    {CUSTOMER_SEGMENT_LABELS[c.segment]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>
                    {c.latestWilaya}
                    {c.latestCommune ? ` - ${c.latestCommune}` : ''}
                  </span>
                  <span>·</span>
                  <span>{c.totalOrders} طلب</span>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {formatDZD(c.lifetimeSpend)}
                  </span>
                  {c.deliveryRate !== null && (
                    <>
                      <span>·</span>
                      <span>استلام {c.deliveryRate}%</span>
                    </>
                  )}
                </div>

                <div
                  className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(c)}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer"
                  >
                    عرض السجل الكامل
                  </button>
                  <div className="flex items-center gap-2">
                    <a
                      href={buildCustomerWhatsAppHref(c)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-[#25D366] text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>واتساب</span>
                    </a>
                    {onSaveAntiFraudConfig && (
                      <button
                        type="button"
                        disabled={busyPhone === c.phoneKey}
                        onClick={() => handleToggleBlacklist(c)}
                        className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-[11px] font-bold cursor-pointer"
                      >
                        {c.isBlacklisted ? 'فك الحظر' : 'حظر'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Customer History Modal */}
      {activeCustomer && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setSelectedCustomer(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
        >
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {activeCustomer.latestName}
                  </h3>
                  <span className={`text-xs font-extrabold ${SEGMENT_TEXT_CLASS[activeCustomer.segment]}`}>
                    · {CUSTOMER_SEGMENT_LABELS[activeCustomer.segment]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span dir="ltr" className="font-mono font-bold tabular-nums flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {activeCustomer.displayPhone}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {activeCustomer.latestWilaya}
                    {activeCustomer.latestCommune ? ` - ${activeCustomer.latestCommune}` : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Mini Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500">إجمالي الطلبات</div>
                  <div className="text-lg font-black">{activeCustomer.totalOrders}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500">مسلّمة / ملغاة</div>
                  <div className="text-lg font-black">
                    <span className="text-emerald-600">{activeCustomer.deliveredOrders}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-rose-600">{activeCustomer.cancelledOrders}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500">نسبة الاستلام</div>
                  <div className="text-lg font-black">
                    {activeCustomer.deliveryRate !== null ? `${activeCustomer.deliveryRate}%` : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500">الإنفاق المسلّم</div>
                  <div className="text-base font-black text-emerald-600">
                    {formatDZD(activeCustomer.lifetimeSpend)}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={buildCustomerWhatsAppHref(activeCustomer)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#25D366] hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>مراسلة عبر واتساب</span>
                </a>
                {onSaveAntiFraudConfig && (
                  <button
                    type="button"
                    disabled={busyPhone === activeCustomer.phoneKey}
                    onClick={() => handleToggleBlacklist(activeCustomer)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      activeCustomer.isBlacklisted
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {activeCustomer.isBlacklisted ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>فك الحظر عن هذا الرقم</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4" />
                        <span>إضافة إلى القائمة السوداء</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Orders History */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                  <span>سجل الطلبات ({activeCustomer.orders.length})</span>
                </h4>

                {activeCustomer.orders.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                    لا توجد طلبات مؤكدة لهذا الرقم بعد
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {activeCustomer.orders.map(ord => (
                      <div
                        key={ord.id}
                        className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span dir="ltr" className="font-mono font-bold text-slate-900 dark:text-white">
                              #{ord.orderNumber}
                            </span>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span className={`font-bold ${ORDER_STATUS_TEXT[ord.status]}`}>
                              {ORDER_STAGE_LABELS[ord.status]}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-md">
                            {ord.bundleLabel || ord.items.map(i => i.title).join(' + ')}
                          </div>
                          <div className="text-[10px] text-slate-400 tabular-nums">
                            {new Date(ord.createdAt).toLocaleDateString('ar-DZ')} · {ord.wilayaName}
                            {ord.commune ? ` - ${ord.commune}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-black tabular-nums text-slate-900 dark:text-white">
                            {formatDZD(ord.total)}
                          </span>
                          {onOpenOrder && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(null);
                                onOpenOrder(ord);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                            >
                              <span>فتح</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Abandoned Attempts */}
              {activeCustomer.abandonedOrders.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>محاولات الطلب المتروك ({activeCustomer.abandonedOrders.length})</span>
                  </h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {activeCustomer.abandonedOrders.map(ab => (
                      <div
                        key={ab.id || ab.sessionId}
                        className="p-3 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {ab.landingPageTitle || ab.bundleLabel || 'صفحة منتج'}
                          </div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {new Date(ab.updatedAt || ab.createdAt).toLocaleDateString('ar-DZ')}
                            {ab.wilayaName ? ` · ${ab.wilayaName}` : ''}
                          </div>
                        </div>
                        <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
                          {formatDZD(ab.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
