import React, { useState, useEffect } from 'react';
import { Order, OrderStatus, Store } from '../../types';
import { formatDZD } from '../../data/wilayas';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { normalizeWhatsAppNumber } from '../../services/integrations';
import {
  Search,
  Eye,
  Phone,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
  FileText,
  Printer,
  MessageCircle,
  Tag
} from 'lucide-react';

interface Props {
  store: Store;
  orders: Order[];
  onUpdateStatus: (
    orderId: string,
    newStatus: OrderStatus,
    note?: string,
    trackingCode?: string
  ) => void;
  selectedOrder?: Order | null;
  onSelectOrder: (order: Order | null) => void;
}

export const OrdersTab: React.FC<Props> = ({
  store,
  orders,
  onUpdateStatus,
  selectedOrder,
  onSelectOrder
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [printSlipOrder, setPrintSlipOrder] = useState<Order | null>(null);
  const [trackingCodeInput, setTrackingCodeInput] = useState<string>('');
  const [statusNoteInput, setStatusNoteInput] = useState<string>('');
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  useEffect(() => {
    setTrackingCodeInput(selectedOrder?.trackingCode || '');
    setStatusNoteInput('');
  }, [selectedOrder?.id]);

  const statusConfigs: Record<OrderStatus, { label: string; badgeClass: string; icon: any }> = {
    new: {
      label: 'قيد التأكيد',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      icon: Clock
    },
    confirmed: {
      label: 'التأكيد',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
      icon: CheckCircle
    },
    shipping: {
      label: 'في شركة التوصيل',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
      icon: Truck
    },
    delivered: {
      label: 'التسليم',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle
    },
    cancelled: {
      label: 'ملغي',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      icon: XCircle
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.customerPhone.includes(search) ||
      o.wilayaName.toLowerCase().includes(search.toLowerCase()) ||
      (o.commune || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.trackingCode || '').toLowerCase().includes(search.toLowerCase());
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
      defaultNote = trackingCodeInput.trim()
        ? `تم تسليم الطرد لشركة التوصيل برمز التتبع ${trackingCodeInput.trim()}`
        : 'تم تسليم الطرد لشركة التوصيل';
    } else if (order.status === 'shipping') {
      next = 'delivered';
      defaultNote = 'تم تسليم الطرد للزبون وتحصيل المبلغ نقداً';
    }

    onUpdateStatus(
      order.id,
      next,
      statusNoteInput.trim() || defaultNote,
      trackingCodeInput.trim() || undefined
    );
    setStatusNoteInput('');
  };

  const buildCustomerWhatsAppHref = (order: Order) => {
    const customerWa = normalizeWhatsAppNumber(order.customerPhone);
    const code = trackingCodeInput.trim() || order.trackingCode || '';
    const bundle = order.bundleLabel || order.items[0]?.title || '';
    let msg = '';
    if (order.status === 'shipping' || code) {
      msg =
        `مرحباً ${order.customerName}،\n` +
        `طلبيتك من ${store.name} خرجت مع شركة التوصيل وفي الطريق إليك.\n` +
        `المنتج: ${bundle}\n` +
        (code ? `رمز التتبع: ${code}\n` : '') +
        `حضّر المبلغ ${formatDZD(order.total)} وخلّي هاتفك مفتوحاً.\n` +
        `شكراً لثقتك.`;
    } else {
      msg =
        `السلام عليكم ${order.customerName}،\n` +
        `بخصوص طلبيتك رقم ${order.orderNumber} من متجر ${store.name} (${bundle})، المبلغ ${formatDZD(order.total)}. نؤكد معك التوصيل إلى ${order.wilayaName}${order.commune ? ' - ' + order.commune : ''}.`;
    }
    return `https://wa.me/${customerWa}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={!!orderToCancel}
        danger
        title="إلغاء الطلب"
        message={orderToCancel ? `سيتم إلغاء الطلب #${orderToCancel.orderNumber} وإرجاع الكميات إلى المخزون.` : ''}
        reasonLabel="سبب الإلغاء (مثال: الزبون لا يجيب)"
        reasonDefault="الزبون غير متاح"
        confirmLabel="تأكيد الإلغاء"
        cancelLabel="تراجع"
        onConfirm={reason => {
          if (orderToCancel) onUpdateStatus(orderToCancel.id, 'cancelled', reason || 'تم إلغاء الطلب');
          setOrderToCancel(null);
        }}
        onCancel={() => setOrderToCancel(null)}
      />

      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          إدارة الطلبات وعمليات الشحن
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          تتبع مراحل الطلب الـ 4 وإدخال رموز التتبع لشركات التوصيل (Yalidine / ZR Express)
        </p>
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
          <span className="px-1.5 rounded-full text-[10px] bg-black/15 tabular-nums">
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
              <span className="px-1.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 tabular-nums">
                {getStatusCount(st)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث برقم الطلب أو الاسم أو الهاتف أو الولاية أو البلدية أو رمز التتبع..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">لا توجد طلبات مطابقة</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">جرب اختيار حالة أخرى أو مسح البحث</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-bold">رقم الطلب</th>
                  <th className="py-3 px-4 font-bold">الزبون والهاتف</th>
                  <th className="py-3 px-4 font-bold">الولاية والبلدية</th>
                  <th className="py-3 px-4 font-bold">المنتج والباقة</th>
                  <th className="py-3 px-4 font-bold">نوع التوصيل</th>
                  <th className="py-3 px-4 font-bold">المجموع</th>
                  <th className="py-3 px-4 font-bold">الحالة</th>
                  <th className="py-3 px-4 font-bold text-left">إجراء</th>
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
                        <div>#{order.orderNumber}</div>
                        {order.trackingCode && (
                          <div className="text-[10px] text-slate-400 font-mono">{order.trackingCode}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{order.customerName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{order.customerPhone}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{order.wilayaName}</div>
                        <div className="text-[11px] text-slate-400">{order.commune || order.address}</div>
                      </td>
                      <td className="py-3.5 px-4 max-w-[200px] truncate text-slate-700 dark:text-slate-300">
                        {order.bundleLabel || order.items.map(it => it.title).join(', ')}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {order.deliveryType === 'stop' ? 'مكتب الشحن Stop Desk' : 'توصيل للمنزل'}
                      </td>
                      <td className="py-3.5 px-4 font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatDZD(order.total)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-block whitespace-nowrap ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectOrder(order)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="تفاصيل"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPrintSlipOrder(order)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="طباعة البوليصة"
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
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto space-y-6">
            <button
              onClick={() => onSelectOrder(null)}
              className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black font-mono">طلب #{selectedOrder.orderNumber}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusConfigs[selectedOrder.status].badgeClass}`}>
                    {statusConfigs[selectedOrder.status].label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(selectedOrder.createdAt).toLocaleString('ar-DZ')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={buildCustomerWhatsAppHref(selectedOrder)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-[#25D366] text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>واتساب الزبون</span>
                </a>
                <button
                  onClick={() => setPrintSlipOrder(selectedOrder)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>البوليصة</span>
                </button>
              </div>
            </div>

            {/* Customer Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400">الاسم الكامل:</span>{' '}
                <strong className="font-bold">{selectedOrder.customerName}</strong>
              </div>
              <div>
                <span className="text-slate-400">الهاتف:</span>{' '}
                <a href={`tel:${selectedOrder.customerPhone}`} className="font-mono font-bold text-emerald-600 inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>{selectedOrder.customerPhone}</span>
                </a>
              </div>
              <div>
                <span className="text-slate-400">الولاية والبلدية:</span>{' '}
                <strong className="font-bold">
                  {selectedOrder.wilayaName}{selectedOrder.commune ? ` - ${selectedOrder.commune}` : ''}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">طريقة التوصيل:</span>{' '}
                <strong className="font-bold">
                  {selectedOrder.deliveryType === 'stop' ? 'مكتب الشحن (Stop Desk)' : 'توصيل للمنزل'}
                </strong>
              </div>
            </div>

            {/* Items & Totals */}
            <div className="space-y-3">
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                {selectedOrder.items.map((it, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      {it.imageUrl && (
                        <img src={it.imageUrl} alt={it.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div>
                        <div className="font-bold">{it.title}</div>
                        <div className="text-[11px] text-slate-400">{it.variantText || selectedOrder.bundleLabel}</div>
                      </div>
                    </div>
                    <div className="font-bold tabular-nums">{formatDZD(it.price * it.quantity)}</div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1.5 tabular-nums">
                <div className="flex justify-between text-slate-500">
                  <span>سعر المنتج/العرض:</span>
                  <span>{formatDZD(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>مصاريف التوصيل:</span>
                  <span>{selectedOrder.shippingFee === 0 ? 'مجاني' : formatDZD(selectedOrder.shippingFee)}</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>المجموع الكلي (COD):</span>
                  <span className="text-emerald-600">{formatDZD(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* Courier Tracking Code + Status Actions */}
            {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 dark:text-emerald-300 mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      <span>رمز تتبع شركة الشحن (اختياري)</span>
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={trackingCodeInput}
                      onChange={e => setTrackingCodeInput(e.target.value)}
                      placeholder="28-H8G9NDFX0V-ZR"
                      className="w-full px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                      ملاحظة التحديث (اختياري)
                    </label>
                    <input
                      type="text"
                      value={statusNoteInput}
                      onChange={e => setStatusNoteInput(e.target.value)}
                      placeholder="مثال: تم الإرسال مع ZR Express"
                      className="w-full px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleNextStatus(selectedOrder)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                  >
                    {selectedOrder.status === 'new' && 'الترقية إلى: التأكيد'}
                    {selectedOrder.status === 'confirmed' && 'الترقية إلى: في شركة التوصيل'}
                    {selectedOrder.status === 'shipping' && 'الترقية إلى: التسليم'}
                  </button>

                  {trackingCodeInput.trim() && trackingCodeInput.trim() !== (selectedOrder.trackingCode || '') && (
                    <button
                      onClick={() =>
                        onUpdateStatus(
                          selectedOrder.id,
                          selectedOrder.status,
                          `تحديث رمز التتبع: ${trackingCodeInput.trim()}`,
                          trackingCodeInput.trim()
                        )
                      }
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      حفظ رمز التتبع فقط
                    </button>
                  )}

                  <button
                    onClick={() => setOrderToCancel(selectedOrder)}
                    className="px-3 py-2 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    إلغاء الطلب
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Slip */}
      {printSlipOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="relative w-full max-w-xl bg-white text-slate-900 p-8 rounded-2xl shadow-2xl text-right space-y-6 border border-slate-300">
            <div className="flex items-center justify-between pb-4 border-b border-slate-300 print:hidden">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>بوليصة التوصيل</span>
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">
                  طباعة
                </button>
                <button onClick={() => setPrintSlipOrder(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold">
                  إغلاق
                </button>
              </div>
            </div>

            <div className="border-2 border-slate-800 p-5 rounded-lg space-y-4 text-xs">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                <div>
                  <h1 className="text-lg font-black">{store.name} — دفع عند الاستلام</h1>
                  <div className="text-[11px] text-slate-600">
                    {printSlipOrder.deliveryType === 'stop' ? 'مكتب الشحن Stop Desk' : 'توصيل للمنزل'}
                  </div>
                </div>
                <div className="text-left font-mono">
                  <div className="text-sm font-black">#{printSlipOrder.orderNumber}</div>
                  {printSlipOrder.trackingCode && <div className="text-[11px]">{printSlipOrder.trackingCode}</div>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-100 rounded">
                  <div className="font-bold text-slate-500 text-[10px] mb-1">المرسل:</div>
                  <div className="font-bold">{store.name}</div>
                  <div>{store.phone || store.defaultWhatsapp || ''}</div>
                </div>
                <div className="p-3 bg-slate-100 rounded">
                  <div className="font-bold text-slate-500 text-[10px] mb-1">المستلم:</div>
                  <div className="font-bold text-sm">{printSlipOrder.customerName}</div>
                  <div className="font-mono font-bold text-emerald-700">{printSlipOrder.customerPhone}</div>
                  <div className="font-bold">
                    {printSlipOrder.wilayaName}{printSlipOrder.commune ? ` - ${printSlipOrder.commune}` : ''}
                  </div>
                </div>
              </div>

              <div className="border border-slate-300 rounded p-2">
                <div className="font-bold text-[11px] mb-1">الطلب:</div>
                <div>{printSlipOrder.bundleLabel || printSlipOrder.items.map(it => it.title).join(', ')}</div>
              </div>

              <div className="p-4 bg-emerald-50 border-2 border-emerald-600 rounded text-center">
                <div className="text-xs font-bold text-emerald-800">المبلغ المطلوب عند الاستلام (COD):</div>
                <div className="text-2xl font-black text-emerald-700 tabular-nums mt-1">
                  {formatDZD(printSlipOrder.total)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
