import React, { useState } from 'react';
import { Order, OrderStatus } from '../../types';
import { formatDZD } from '../../data/wilayas';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  Search,
  Filter,
  Eye,
  Phone,
  MapPin,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
  FileText,
  Printer,
  ChevronLeft,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface Props {
  orders: Order[];
  onUpdateStatus: (orderId: string, newStatus: OrderStatus, note?: string) => void;
  selectedOrder?: Order | null;
  onSelectOrder: (order: Order | null) => void;
}

export const OrdersTab: React.FC<Props> = ({
  orders,
  onUpdateStatus,
  selectedOrder,
  onSelectOrder
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [printSlipOrder, setPrintSlipOrder] = useState<Order | null>(null);
  const [statusChangeNote, setStatusChangeNote] = useState<string>('');
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  const statusConfigs: Record<OrderStatus, { label: string; color: string; badgeClass: string; icon: any }> = {
    new: {
      label: 'جديد',
      color: 'amber',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      icon: Clock
    },
    confirmed: {
      label: 'مؤكد',
      color: 'blue',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
      icon: CheckCircle
    },
    shipping: {
      label: 'قيد التوصيل',
      color: 'purple',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
      icon: Truck
    },
    delivered: {
      label: 'تم التسليم',
      color: 'emerald',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle
    },
    cancelled: {
      label: 'ملغي',
      color: 'rose',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      icon: XCircle
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.customerPhone.includes(search) ||
      o.wilayaName.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusCount = (st: string) => {
    if (st === 'all') return orders.length;
    return orders.filter(o => o.status === st).length;
  };

  const handleNextStatus = (order: Order) => {
    let next: OrderStatus = 'confirmed';
    let defaultNote = '';

    if (order.status === 'new') {
      next = 'confirmed';
      defaultNote = 'تم الاتصال بالزبون وتأكيد الطلب';
    } else if (order.status === 'confirmed') {
      next = 'shipping';
      defaultNote = 'تم تسليم الطرد لمندوب شركة التوصيل';
    } else if (order.status === 'shipping') {
      next = 'delivered';
      defaultNote = 'تم تسليم الطرد للزبون وتحصيل المبلغ نقداً';
    }

    onUpdateStatus(order.id, next, statusChangeNote || defaultNote);
    setStatusChangeNote('');
  };

  const handleCancelOrder = (order: Order) => {
    setOrderToCancel(order);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={!!orderToCancel}
        danger
        title="إلغاء الطلب"
        message={orderToCancel ? `سيتم إلغاء الطلب #${orderToCancel.orderNumber} وإرجاع الكميات إلى المخزون.` : ''}
        reasonLabel="سبب الإلغاء (مثال: الزبون لا يجيب)"
        reasonDefault="الزبون غير مهتم"
        confirmLabel="تأكيد الإلغاء"
        cancelLabel="تراجع"
        onConfirm={reason => {
          if (orderToCancel) onUpdateStatus(orderToCancel.id, 'cancelled', reason || 'تم إلغاء الطلب');
          setOrderToCancel(null);
        }}
        onCancel={() => setOrderToCancel(null)}
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            إدارة الطلبات وعمليات الشحن
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تتبع مسار شحنات الزبائن عبر الولايات والدفع عند الاستلام (COD)
          </p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
            statusFilter === 'all'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>جميع الطلبات</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15">
            {getStatusCount('all')}
          </span>
        </button>

        {(['new', 'confirmed', 'shipping', 'delivered', 'cancelled'] as OrderStatus[]).map(st => {
          const cfg = statusConfigs[st];
          const isSelected = statusFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <span>{cfg.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800">
                {getStatusCount(st)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث برقم الطلب (مثال: DZ-9821) أو اسم الزبون أو رقم الهاتف أو الولاية..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        />
      </div>

      {/* Orders List Table */}
      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            لا توجد طلبات مطابقة
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            جرب اختيار تصنيف آخر أو مسح كلمة البحث
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-bold">رقم الطلب</th>
                  <th className="py-3 px-4 font-bold">تاريخ التسجيل</th>
                  <th className="py-3 px-4 font-bold">الزبون والهاتف</th>
                  <th className="py-3 px-4 font-bold">الولاية والعنوان</th>
                  <th className="py-3 px-4 font-bold">عدد السلع</th>
                  <th className="py-3 px-4 font-bold">المجموع (مع التوصيل)</th>
                  <th className="py-3 px-4 font-bold">الحالة</th>
                  <th className="py-3 px-4 font-bold text-left">الإجراء السريع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredOrders.map(order => {
                  const cfg = statusConfigs[order.status];
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      onClick={() => onSelectOrder(order)}
                    >
                      <td className="py-3.5 px-4 font-black font-mono text-emerald-600 dark:text-emerald-400">
                        #{order.orderNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(order.createdAt).toLocaleDateString('ar-DZ')}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {order.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {order.customerPhone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {order.wilayaName}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {order.address}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {order.items.reduce((s, it) => s + it.quantity, 0)} قطعة
                      </td>
                      <td className="py-3.5 px-4 font-bold font-mono text-slate-900 dark:text-white">
                        {formatDZD(order.total)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-block ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectOrder(order)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                            title="تفاصيل الطلب الكاملة"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPrintSlipOrder(order)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                            title="طباعة بوليصة الشحن والتوصيل"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto">
            {/* Close */}
            <button
              onClick={() => onSelectOrder(null)}
              className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <XCircle className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white font-mono">
                    طلب #{selectedOrder.orderNumber}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusConfigs[selectedOrder.status].badgeClass}`}>
                    {statusConfigs[selectedOrder.status].label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  سُجِّل بتاريخ: {new Date(selectedOrder.createdAt).toLocaleString('ar-DZ')}
                </p>
              </div>

              <button
                onClick={() => setPrintSlipOrder(selectedOrder)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة بوليصة التوصيل</span>
              </button>
            </div>

            {/* Customer Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 mb-6 space-y-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
                معلومات الزبون والشحن في الجزائر:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">الاسم الكامل:</span>{' '}
                  <strong className="text-slate-900 dark:text-white font-bold">{selectedOrder.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-400">رقم الهاتف:</span>{' '}
                  <a
                    href={`tel:${selectedOrder.customerPhone}`}
                    className="font-mono font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{selectedOrder.customerPhone}</span>
                  </a>
                </div>
                <div>
                  <span className="text-slate-400">الولاية:</span>{' '}
                  <strong className="text-slate-900 dark:text-white font-bold">{selectedOrder.wilayaName}</strong>
                </div>
                <div>
                  <span className="text-slate-400">العنوان بالتفصيل:</span>{' '}
                  <span className="text-slate-700 dark:text-slate-300">{selectedOrder.address}</span>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="mb-6 space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                المنتجات المطلوبة:
              </span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                {selectedOrder.items.map((it, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      {it.imageUrl && (
                        <img
                          src={it.imageUrl}
                          alt={it.title}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      )}
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {it.title}
                        </div>
                        {it.variantText && (
                          <div className="text-[11px] text-slate-400">{it.variantText}</div>
                        )}
                      </div>
                    </div>

                    <div className="text-left font-mono">
                      <span className="text-slate-400">{it.quantity} × {formatDZD(it.price)}</span>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {formatDZD(it.price * it.quantity)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals Calculation */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-500">
                  <span>المجموع الفرعي:</span>
                  <span>{formatDZD(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>رسوم التوصيل ({selectedOrder.wilayaName}):</span>
                  <span>{selectedOrder.shippingFee === 0 ? 'توصيل مجاني' : formatDZD(selectedOrder.shippingFee)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>المجموع الكلي للدفع عند الاستلام:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{formatDZD(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* Status Timeline */}
            <div className="mb-6 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                تاريخ وتتبع حركة الطلب:
              </span>
              <div className="space-y-2 text-xs">
                {selectedOrder.statusHistory.map((hist, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/30">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-800 dark:text-slate-200">
                          {statusConfigs[hist.status]?.label || hist.status}
                        </strong>
                        <span className="text-[10px] text-slate-400">
                          {new Date(hist.timestamp).toLocaleString('ar-DZ')}
                        </span>
                      </div>
                      {hist.note && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {hist.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advance Status Controls */}
            {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-3">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block">
                  ترقية حالة الطلب إلى المرحلة التالية:
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleNextStatus(selectedOrder)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                  >
                    {selectedOrder.status === 'new' && '✓ تأكيد الطلب هاتفياً (مؤكد)'}
                    {selectedOrder.status === 'confirmed' && '🚚 تسليم لشركة الشحن (قيد التوصيل)'}
                    {selectedOrder.status === 'shipping' && '💰 تأكيد الاستلام وتحصيل المبلغ (تم التسليم)'}
                  </button>

                  <button
                    onClick={() => handleCancelOrder(selectedOrder)}
                    className="px-3 py-2 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold hover:bg-rose-200 transition-colors"
                  >
                    إلغاء الطلب
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Delivery Slip Modal */}
      {printSlipOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="relative w-full max-w-xl bg-white text-slate-900 p-8 rounded-2xl shadow-2xl text-right space-y-6 border border-slate-300">
            {/* Slip Action Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-300 print:hidden">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>معاينة بوليصة الشحن والتوصيل (Yalidine / ZR Express)</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                >
                  طباعة فورية
                </button>
                <button
                  onClick={() => setPrintSlipOrder(null)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Slip Paper Body */}
            <div className="border-2 border-slate-800 p-5 rounded-lg space-y-4 font-sans text-xs">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                <div>
                  <h1 className="text-lg font-black tracking-tight">بوليصة تسليم طرد — دفع عند الاستلام</h1>
                  <div className="text-[11px] text-slate-600">منصة دكاني للخدمات اللوجستية والتجارة الإلكترونية</div>
                </div>
                <div className="text-left font-mono">
                  <div className="text-sm font-black">#{printSlipOrder.orderNumber}</div>
                  <div className="text-[10px] text-slate-500">{new Date(printSlipOrder.createdAt).toLocaleDateString('ar-DZ')}</div>
                </div>
              </div>

              {/* Sender & Receiver Boxes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-100 rounded">
                  <div className="font-bold text-slate-500 text-[10px] mb-1">المرسل (التاجر):</div>
                  <div className="font-bold">متجر النخبة للموضة</div>
                  <div>هاتف: 0550123456</div>
                  <div>الجزائر العاصمة</div>
                </div>

                <div className="p-3 bg-slate-100 rounded">
                  <div className="font-bold text-slate-500 text-[10px] mb-1">المرسل إليه (الزبون):</div>
                  <div className="font-bold text-sm">{printSlipOrder.customerName}</div>
                  <div className="font-mono font-bold text-emerald-700">{printSlipOrder.customerPhone}</div>
                  <div className="font-bold text-slate-800">{printSlipOrder.wilayaName}</div>
                  <div className="text-[11px] text-slate-600">{printSlipOrder.address}</div>
                </div>
              </div>

              {/* Items summary */}
              <div className="border border-slate-300 rounded p-2">
                <div className="font-bold text-[11px] mb-1">محتويات الطرد:</div>
                {printSlipOrder.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-[11px]">
                    <span>{it.title} {it.variantText ? `(${it.variantText})` : ''}</span>
                    <span className="font-mono font-bold">× {it.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Amount to Collect */}
              <div className="p-4 bg-emerald-50 border-2 border-emerald-600 rounded text-center">
                <div className="text-xs font-bold text-emerald-800">المبلغ المطلوب تحصيله نقداً من الزبون (COD):</div>
                <div className="text-2xl font-black text-emerald-700 font-mono mt-1">
                  {formatDZD(printSlipOrder.total)}
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">شامل تكلفة البضاعة والتوصيل</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
