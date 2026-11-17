import React, { useState } from 'react';
import { Store, Order, LandingPage } from '../../types';
import { formatDZD } from '../../data/wilayas';
import { ORDER_STAGE_LABELS } from '../../services/integrations';
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  CheckCircle,
  Eye,
  DollarSign
} from 'lucide-react';

interface Props {
  store: Store;
  orders: Order[];
  landingPages: LandingPage[];
  onSelectOrder: (order: Order) => void;
  onGoToPages: () => void;
  onRestockPage: (pageId: string, addedStock: number) => void;
}

export const OverviewTab: React.FC<Props> = ({
  orders,
  landingPages,
  onSelectOrder,
  onGoToPages,
  onRestockPage
}) => {
  const [restockModalPage, setRestockModalPage] = useState<LandingPage | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);

  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const totalSales = deliveredOrders.reduce((sum, o) => sum + o.total, 0);
  const newOrders = orders.filter(o => o.status === 'new');
  const shippingOrders = orders.filter(o => o.status === 'shipping');
  const lowStockPages = landingPages.filter(p => p.stock <= 5);

  const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const salesByDay = new Map<string, number>();
  orders
    .filter(o => o.status !== 'cancelled')
    .forEach(o => {
      const k = dayKey(new Date(o.createdAt));
      salesByDay.set(k, (salesByDay.get(k) || 0) + o.total);
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
  const pendingValue = orders
    .filter(o => o.status === 'new' || o.status === 'confirmed' || o.status === 'shipping')
    .reduce((sum, o) => sum + o.total, 0);

  const handleConfirmRestock = () => {
    if (restockModalPage && restockAmount > 0) {
      onRestockPage(restockModalPage.id, restockAmount);
      setRestockModalPage(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              المبيعات المحصلة
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {formatDZD(totalSales)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>قيد التحصيل: {formatDZD(pendingValue)}</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              إجمالي الطلبات
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {orders.length} طلب
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {deliveredOrders.length} تم التسليم · {shippingOrders.length} في التوصيل
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              طلبات قيد التأكيد
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
            {newOrders.length} طلب
          </div>
          <div className="mt-2 text-xs text-amber-600/90 dark:text-amber-400/90 font-medium">
            تتطلب اتصالاً هاتفياً بالزبون
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              صفحات بمخزون منخفض
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
            {lowStockPages.length} صفحة
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            الكمية المتبقية 5 قطع أو أقل
          </div>
        </div>
      </div>

      {/* 7-Day Chart + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>حركة المبيعات خلال آخر 7 أيام (دج)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مبيعات صفحات الهبوط والدفع عند الاستلام
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
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
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
                      className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shrink-0"
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
              {orders.slice(0, 6).map(order => (
                <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3.5 font-bold font-mono text-slate-900 dark:text-white">
                    #{order.orderNumber}
                  </td>
                  <td className="py-3.5">
                    <div className="font-semibold text-slate-900 dark:text-white">{order.customerName}</div>
                    <div className="text-[11px] text-slate-500">
                      {order.wilayaName}{order.commune ? ` - ${order.commune}` : ''} · {order.customerPhone}
                    </div>
                  </td>
                  <td className="py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {order.bundleLabel || order.items.map(it => it.title).join(', ')}
                  </td>
                  <td className="py-3.5 font-black text-slate-900 dark:text-white tabular-nums">
                    {formatDZD(order.total)}
                  </td>
                  <td className="py-3.5 font-bold text-xs">
                    {ORDER_STAGE_LABELS[order.status]}
                  </td>
                  <td className="py-3.5 text-left">
                    <button
                      onClick={() => onSelectOrder(order)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1"
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
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmRestock}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
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
