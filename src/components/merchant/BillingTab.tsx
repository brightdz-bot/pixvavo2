import React, { useState, useEffect, useCallback } from 'react';
import { platformApi } from '../../services/platformApi';
import {
  DEFAULT_PLATFORM_PLANS,
  formatLimitLabel,
  getDaysRemaining,
  isUnlimitedLimit,
  resolvePlanById
} from '../../data/plans';
import { formatDZD } from '../../data/wilayas';
import type {
  Plan,
  PlatformPaymentSettings,
  PlatformStoreOverview,
  Store,
  SubscriptionRequest
} from '../../types';
import {
  Check,
  Copy,
  CreditCard,
  Upload,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Loader2,
  ExternalLink
} from 'lucide-react';

interface Props {
  store: Store;
  landingPagesCount: number;
  monthlyOrdersCount: number;
  activeTeamCount: number;
  onNotify: (msg: string) => void;
}

export const BillingTab: React.FC<Props> = ({
  store,
  landingPagesCount,
  monthlyOrdersCount,
  activeTeamCount,
  onNotify
}) => {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLATFORM_PLANS);
  const [liveStore, setLiveStore] = useState<PlatformStoreOverview | null>(null);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PlatformPaymentSettings>({
    baridimobRip: '',
    baridimobAccountName: '',
    baridimobInstructions:
      'قم بتحويل مبلغ الباقة عبر بريدي موب ثم أرفق صورة الوصل ليتم تفعيل باقتك مباشرة.',
    chargilyEnabled: false
  });

  // Upgrade modal state
  const [upgradePlan, setUpgradePlan] = useState<Plan | null>(null);
  const [upgradeMethod, setUpgradeMethod] = useState<'baridimob' | 'chargily'>('baridimob');
  const [transactionRef, setTransactionRef] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedRip, setCopiedRip] = useState(false);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    const res = await platformApi.getStoreBillingStatus(store.id);
    if (res.ok) {
      if (res.plans && res.plans.length > 0) setPlans(res.plans);
      if (res.store !== undefined) setLiveStore(res.store || null);
      if (res.requests) setRequests(res.requests);
      if (res.paymentSettings) setPaymentSettings(res.paymentSettings);
    }
    setLoading(false);
  }, [store.id]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const currentPlanId = liveStore?.planId || store.planId || 'plan_pro';
  const currentPlan = resolvePlanById(currentPlanId, plans);
  const currentStatus = liveStore?.status || store.status || 'active';
  const daysLeft =
    currentStatus === 'trial'
      ? getDaysRemaining(liveStore?.trialEndsAt || store.trialEndsAt)
      : getDaysRemaining(liveStore?.subscriptionEndsAt || store.subscriptionEndsAt);

  const maxPages = currentPlan.maxLandingPages ?? currentPlan.maxProducts;
  const maxOrders = currentPlan.maxMonthlyOrders ?? 1000;
  const maxSeats = currentPlan.maxTeamMembers ?? 1;

  const pct = (used: number, max: number) =>
    isUnlimitedLimit(max) ? 12 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSubmitError('يرجى اختيار ملف صورة صالح (PNG أو JPG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 960;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setReceiptDataUrl(canvas.toDataURL('image/jpeg', 0.8));
          setSubmitError(null);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleCopyRip = () => {
    if (!paymentSettings.baridimobRip) return;
    navigator.clipboard?.writeText(paymentSettings.baridimobRip).catch(() => {});
    setCopiedRip(true);
    window.setTimeout(() => setCopiedRip(false), 1800);
  };

  const handleSubmitUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradePlan) return;
    setSubmitError(null);

    if (upgradeMethod === 'baridimob' && !receiptDataUrl && !transactionRef.trim()) {
      setSubmitError('يرجى إرفاق صورة وصل بريدي موب أو إدخال رقم العملية');
      return;
    }

    setSubmitting(true);
    const res = await platformApi.submitSubscriptionRequest({
      storeId: store.id,
      storeName: store.name,
      storeSubdomain: store.subdomain,
      planId: upgradePlan.id,
      paymentMethod: upgradeMethod,
      receiptImageUrl: receiptDataUrl || undefined,
      transactionRef: transactionRef.trim() || undefined,
      notes: notes.trim() || undefined,
      returnUrl: window.location.href.split('?')[0]
    });
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError(res.message || 'تعذر إرسال طلب الترقية');
      return;
    }

    if (res.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }

    setUpgradePlan(null);
    setTransactionRef('');
    setReceiptDataUrl('');
    setNotes('');
    onNotify('تم إرسال طلب الترقية ووصل الدفع لمالك المنصة للمراجعة والتفعيل');
    void loadBilling();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">الباقة والاشتراك</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تابع استهلاك متجرك الشهري وحدود الباقة، واطلب الترقية عبر بريدي موب أو الدفع الإلكتروني.
          </p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>

      {/* Current Subscription & Usage Quota Panel */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">باقتك الحالية</div>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {currentPlan.nameAr}
              </span>
              <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {currentPlan.priceDZD === 0 ? 'مجانية' : `${formatDZD(currentPlan.priceDZD)} / شهر`}
              </span>
            </div>
          </div>

          <div className="text-xs text-left space-y-1">
            <div className="font-bold">
              {currentStatus === 'suspended' ? (
                <span className="text-rose-700 dark:text-rose-400">الحالة: موقوف مؤقتاً</span>
              ) : currentStatus === 'trial' ? (
                <span className="text-amber-700 dark:text-amber-400">الحالة: فترة تجريبية</span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400">الحالة: اشتراك نشط</span>
              )}
            </div>
            {daysLeft !== null && (
              <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                {daysLeft > 0 ? `متبقي ${daysLeft} يوماً` : 'انتهت المدة الحالية'}
              </div>
            )}
          </div>
        </div>

        {/* 3 Quota Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">صفحات الهبوط</span>
              <span className="tabular-nums font-bold text-slate-900 dark:text-white">
                {landingPagesCount} / {formatLimitLabel(maxPages)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  !isUnlimitedLimit(maxPages) && landingPagesCount >= maxPages
                    ? 'bg-rose-600'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${pct(landingPagesCount, maxPages)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">الطلبات هذا الشهر</span>
              <span className="tabular-nums font-bold text-slate-900 dark:text-white">
                {monthlyOrdersCount} / {formatLimitLabel(maxOrders)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  !isUnlimitedLimit(maxOrders) && monthlyOrdersCount >= maxOrders
                    ? 'bg-rose-600'
                    : 'bg-slate-900 dark:bg-white'
                }`}
                style={{ width: `${pct(monthlyOrdersCount, maxOrders)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">مقاعد الفريق</span>
              <span className="tabular-nums font-bold text-slate-900 dark:text-white">
                {activeTeamCount + 1} / {formatLimitLabel(maxSeats)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  activeTeamCount + 1 >= maxSeats ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${pct(activeTeamCount + 1, maxSeats)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3 Pricing Tiers */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {plans.map(plan => {
          const isCurrent = plan.id === currentPlan.id;
          return (
            <div
              key={plan.id}
              className={`bg-white dark:bg-slate-900 rounded-xl p-5 flex flex-col justify-between gap-5 border ${
                isCurrent
                  ? 'border-emerald-600 dark:border-emerald-500'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {plan.nameAr}
                    </h3>
                    {isCurrent && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        باقتك الحالية
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {plan.taglineAr || plan.name}
                  </p>
                </div>

                <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {plan.priceDZD === 0 ? '0 دج' : formatDZD(plan.priceDZD)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mr-1.5">
                    / {plan.billingPeriod}
                  </span>
                </div>

                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  <li className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">صفحات الهبوط</span>
                    <strong className="tabular-nums">
                      {formatLimitLabel(plan.maxLandingPages ?? plan.maxProducts)}
                    </strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">الطلبات الشهرية</span>
                    <strong className="tabular-nums">
                      {formatLimitLabel(plan.maxMonthlyOrders ?? 1000)}
                    </strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">حسابات الفريق</span>
                    <strong className="tabular-nums">{plan.maxTeamMembers ?? 1} مستخدم</strong>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">الدفع الإلكتروني</span>
                    <strong className={plan.allowOnlinePayment ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
                      {plan.allowOnlinePayment ? 'مشمول' : 'غير مشمول'}
                    </strong>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                disabled={isCurrent || plan.priceDZD === 0}
                onClick={() => {
                  setUpgradePlan(plan);
                  setUpgradeMethod('baridimob');
                  setSubmitError(null);
                }}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    : plan.priceDZD === 0
                    ? 'border border-slate-200 dark:border-slate-700 text-slate-400'
                    : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900'
                }`}
              >
                {isCurrent
                  ? 'مفعّلة حالياً'
                  : plan.priceDZD === 0
                  ? 'باقة البداية المجانية'
                  : `الترقية إلى ${plan.nameAr}`}
              </button>
            </div>
          );
        })}
      </section>

      {/* Previous Upgrade Requests History */}
      {requests.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">سجل طلبات الاشتراك</h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {requests.map(r => (
              <div key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {resolvePlanById(r.planId, plans).nameAr} ·{' '}
                    <span className="tabular-nums">{formatDZD(r.amountDZD)}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString('ar-DZ')} ·{' '}
                    {r.paymentMethod === 'chargily' ? 'Chargily' : 'تحويل بريدي موب'}
                    {r.rejectionReason ? ` · السبب: ${r.rejectionReason}` : ''}
                  </div>
                </div>
                <div className="font-bold flex items-center gap-1.5">
                  {r.status === 'approved' ? (
                    <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>مفعّل</span>
                    </span>
                  ) : r.status === 'rejected' ? (
                    <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>مرفوض</span>
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>قيد مراجعة الإدارة</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upgrade Modal */}
      {upgradePlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmitUpgrade}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 my-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  تفعيل باقة {upgradePlan.nameAr}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                  المبلغ المستحق: {formatDZD(upgradePlan.priceDZD)} لمدة 30 يوماً
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpgradePlan(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Payment Method Switch */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setUpgradeMethod('baridimob')}
                className={`py-2 px-3 rounded-md font-semibold transition-colors cursor-pointer ${
                  upgradeMethod === 'baridimob'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                تحويل بريدي موب / CCP
              </button>
              <button
                type="button"
                onClick={() => setUpgradeMethod('chargily')}
                className={`py-2 px-3 rounded-md font-semibold transition-colors cursor-pointer ${
                  upgradeMethod === 'chargily'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                البطاقة الذهبية (Chargily)
              </button>
            </div>

            {upgradeMethod === 'baridimob' ? (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    بيانات التحويل لإدارة المنصة:
                  </div>
                  {paymentSettings.baridimobRip ? (
                    <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white" dir="ltr">
                        {paymentSettings.baridimobRip}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyRip}
                        className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedRip ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedRip ? 'تم النسخ' : 'نسخ RIP'}</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-500">
                      سيظهر رقم RIP هنا فور إضافته من لوحة مالك المنصة. يمكنك إرفاق وصل التحويل أو مرجع العملية الآن.
                    </p>
                  )}
                  {paymentSettings.baridimobAccountName && (
                    <div className="text-slate-600 dark:text-slate-400">
                      صاحب الحساب: <strong>{paymentSettings.baridimobAccountName}</strong>
                    </div>
                  )}
                  {paymentSettings.baridimobInstructions && (
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      {paymentSettings.baridimobInstructions}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1">صورة وصل التحويل</label>
                  <label className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {receiptDataUrl ? 'تم إرفاق صورة الوصل (اضغط للتغيير)' : 'اختر صورة وصل بريدي موب'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptFileChange}
                      className="hidden"
                    />
                  </label>
                  {receiptDataUrl && (
                    <img
                      src={receiptDataUrl}
                      alt="معاينة الوصل"
                      className="mt-2 max-h-36 rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1">رقم العملية / المرجع (اختياري)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={transactionRef}
                    onChange={e => setTransactionRef(e.target.value)}
                    placeholder="مثال: BM-9482716"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">ملاحظة إضافية (اختياري)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="أي توضيح إضافي للإدارة"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>الدفع الفوري بالبطاقة الذهبية أو CIB</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {paymentSettings.chargilyEnabled
                    ? 'سيتم تحويلك إلى بوابة Chargily Pay الآمنة لإتمام الدفع وتفعيل باقتك تلقائياً فور نجاح العملية.'
                    : 'الدفع التلقائي للاشتراكات عبر Chargily غير مفعّل حالياً من إدارة المنصة. يرجى اختيار خيار تحويل بريدي موب أعلاه.'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUpgradePlan(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting || (upgradeMethod === 'chargily' && !paymentSettings.chargilyEnabled)}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جارٍ الإرسال...</span>
                  </>
                ) : upgradeMethod === 'chargily' ? (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>المتابعة إلى Chargily</span>
                  </>
                ) : (
                  <span>إرسال الوصل وتأكيد الطلب</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
