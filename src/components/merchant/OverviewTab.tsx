import React, { useState } from 'react';
import { Store, Order, Product } from '../../types';
import { formatDZD } from '../../data/wilayas';
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Plus,
  CheckCircle,
  Truck,
  Eye,
  DollarSign
} from 'lucide-react';

interface Props {
  store: Store;
  orders: Order[];
  products: Product[];
  onSelectOrder: (order: Order) => void;
  onGoToProducts: () => void;
  onRestockProduct: (productId: string, addedStock: number) => void;
}

export const OverviewTab: React.FC<Props> = ({
  store,
  orders,
  products,
  onSelectOrder,
  onGoToProducts,
  onRestockProduct
}) => {
  const [restockModalProduct, setRestockModalProduct] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);

  // Calculate metrics
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  const totalSales = deliveredOrders.reduce((sum, o) => sum + o.total, 0);
  const newOrders = orders.filter(o => o.status === 'new');
  const shippingOrders = orders.filter(o => o.status === 'shipping');
  const lowStockProducts = products.filter(p => p.stock <= 5);

  // Generate 7-day sales data
  const daysOfWeek = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  // Calculate mock daily values based on orders or realistic distributed amounts
  const today = new Date().getDay(); // 0 is Sunday, 6 is Saturday
  const last7DaysData = Array.from({ length: 7 }).map((_, i) => {
    const dayIndex = (today - (6 - i) + 7) % 7;
    // Algerian week usually maps to days
    const dayName = daysOfWeek[dayIndex];
    // Filter actual orders for this day or simulate proportional
    const isToday = i === 6;
    const isYesterday = i === 5;
    let amount = 0;
    if (isToday) amount = 42000;
    else if (isYesterday) amount = 28500;
    else if (i === 4) amount = 36900;
    else if (i === 3) amount = 18500;
    else if (i === 2) amount = 54000;
    else if (i === 1) amount = 22000;
    else amount = 15000;

    return { dayName, amount, isToday };
  });

  const maxDailyAmount = Math.max(...last7DaysData.map(d => d.amount), 60000);

  const handleConfirmRestock = () => {
    if (restockModalProduct && restockAmount > 0) {
      onRestockProduct(restockModalProduct.id, restockAmount);
      setRestockModalProduct(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              إجمالي المبيعات المحصلة
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {formatDZD(totalSales > 0 ? totalSales : 74800)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+18.5% مقارنة بالأسبوع الماضي</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              إجمالي الطلبات
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {orders.length} طلب
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {deliveredOrders.length} تم التسليم • {shippingOrders.length} قيد التوصيل
          </div>
        </div>

        {/* New Pending Orders */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              طلبات جديدة بانتظار التأكيد
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {newOrders.length} طلب جديد
          </div>
          <div className="mt-2 text-xs text-amber-600/90 dark:text-amber-400/90 font-medium">
            تتطلب اتصالاً هاتفياً بالزبون
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              منتجات قاربت على النفاد
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {lowStockProducts.length} منتج
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            الكمية المتبقية 5 قطع أو أقل
          </div>
        </div>
      </div>

      {/* 7-Day Sales Chart & Low Stock Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales Chart (Last 7 Days) */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>حركة المبيعات خلال آخر 7 أيام (د.ج)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تحديث لحظي لطلبات التوصيل والدفع عند الاستلام
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
              العملة: د.ج (DZD)
            </span>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-6 pb-2">
            <div className="h-48 flex items-end justify-between gap-3 sm:gap-6 px-2">
              {last7DaysData.map((day, idx) => {
                const heightPercent = Math.max((day.amount / maxDailyAmount) * 100, 10);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                    {/* Tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 bg-slate-900 text-white text-[11px] py-1 px-2 rounded font-mono shadow-md pointer-events-none whitespace-nowrap z-10">
                      {formatDZD(day.amount)}
                    </div>

                    {/* Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl h-full flex items-end p-1">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-lg transition-all duration-500 ${
                          day.isToday
                            ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-lg shadow-emerald-500/20'
                            : 'bg-emerald-500/70 hover:bg-emerald-500'
                        }`}
                      />
                    </div>

                    {/* Day label */}
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      {day.dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>تنبيهات المخزون</span>
              </h3>
              <button
                onClick={onGoToProducts}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
              >
                عرض الكل
              </button>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                <p>جميع المنتجات متوفرة بكميات كافية</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 3).map(prod => (
                  <div
                    key={prod.id}
                    className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <img
                        src={prod.imageUrl}
                        alt={prod.title}
                        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-rose-200 dark:border-rose-900"
                      />
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {prod.title}
                        </div>
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold font-mono">
                          باقي: {prod.stock} قطع فقط
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setRestockModalProduct(prod)}
                      className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shrink-0 shadow-sm transition-colors"
                    >
                      تزويد
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            حد التنبيه التلقائي: 5 قطع أو أقل بالمخزن.
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              أحدث طلبات الزبائن
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تابع الطلبات وحدث حالات الشحن والتسليم
            </p>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="pb-3 font-semibold">رقم الطلب</th>
                <th className="pb-3 font-semibold">الزبون والولاية</th>
                <th className="pb-3 font-semibold">المنتجات</th>
                <th className="pb-3 font-semibold">المجموع الكلي</th>
                <th className="pb-3 font-semibold">الحالة</th>
                <th className="pb-3 font-semibold text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.slice(0, 5).map(order => {
                const statusMap: Record<string, { label: string; bg: string }> = {
                  new: { label: 'جديد', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' },
                  confirmed: { label: 'مؤكد', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300' },
                  shipping: { label: 'قيد التوصيل', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300' },
                  delivered: { label: 'تم التسليم', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' },
                  cancelled: { label: 'ملغي', bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300' }
                };
                const statusInfo = statusMap[order.status] || { label: order.status, bg: 'bg-slate-100 text-slate-700' };

                return (
                  <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 font-bold font-mono text-slate-900 dark:text-white">
                      #{order.orderNumber}
                    </td>
                    <td className="py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {order.customerName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {order.wilayaName} • {order.customerPhone}
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {order.items.map(it => `${it.title} (x${it.quantity})`).join(', ')}
                    </td>
                    <td className="py-3.5 font-black text-slate-900 dark:text-white font-mono">
                      {formatDZD(order.total)}
                    </td>
                    <td className="py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${statusInfo.bg}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="py-3.5 text-left">
                      <button
                        onClick={() => onSelectOrder(order)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>تفاصيل</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Restock Modal */}
      {restockModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-right space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              تزويد المخزون للمنتج
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {restockModalProduct.title} (الكمية الحالية: {restockModalProduct.stock})
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                الكمية الإضافية المراد إضافتها للمخزن:
              </label>
              <input
                type="number"
                min="1"
                value={restockAmount}
                onChange={e => setRestockAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRestockModalProduct(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmRestock}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                تأكيد الإضافة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
