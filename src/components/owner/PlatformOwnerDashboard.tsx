import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { platformApi, OwnerOverviewResponse } from '../../services/platformApi';
import { formatDZD } from '../../data/wilayas';
import { DEFAULT_PLATFORM_PLANS, formatLimitLabel, resolvePlanById } from '../../data/plans';
import type { Plan, PlatformPaymentSettings, PlatformStoreOverview, SubscriptionRequest } from '../../types';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  ShieldCheck,
  Store as StoreIcon,
  Receipt,
  Sliders,
  Search,
  RefreshCw,
  LogOut,
  Ban,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertCircle,
  Loader2,
  Eye,
  X,
  Lock,
  Mail,
  CreditCard,
  ArrowRight
} from 'lucide-react';

interface Props {
  onExitToStorefront: () => void;
}

type OwnerTab = 'stores' | 'requests' | 'plans';

const STATUS_META: Record<
  PlatformStoreOverview['status'],
  { label: string; colorClass: string }
> = {
  active: { label: 'نشط', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  trial: { label: 'فترة تجريبية', colorClass: 'text-amber-700 dark:text-amber-400' },
  suspended: { label: 'موقوف', colorClass: 'text-rose-700 dark:text-rose-400' }
};

export const PlatformOwnerDashboard: React.FC<Props> = ({ onExitToStorefront }) => {
  const [authStatusLoading, setAuthStatusLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [usesEnvOverride, setUsesEnvOverride] = useState(false);
  const [ownerEmailHint, setOwnerEmailHint] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');

  // Login / Claim form state
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Dashboard data
  const [activeTab, setActiveTab] = useState<OwnerTab>('stores');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [overview, setOverview] = useState<OwnerOverviewResponse | null>(null);

  // Stores filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');

  // Suspend modal
  const [suspendTarget, setSuspendTarget] = useState<PlatformStoreOverview | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isMutatingStore, setIsMutatingStore] = useState(false);

  // Plan assignment modal
  const [planTarget, setPlanTarget] = useState<PlatformStoreOverview | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('plan_pro');
  const [selectedStoreStatus, setSelectedStoreStatus] = useState<'active' | 'trial'>('active');
  const [extendDays, setExtendDays] = useState(30);

  // Receipt review modal
  const [receiptPreviewReq, setReceiptPreviewReq] = useState<SubscriptionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isReviewingReq, setIsReviewingReq] = useState(false);

  // Plan editor & billing settings
  const [planDrafts, setPlanDrafts] = useState<Record<string, Plan>>({});
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [billingDraft, setBillingDraft] = useState<PlatformPaymentSettings>({
    baridimobRip: '',
    baridimobAccountName: '',
    baridimobInstructions: '',
    chargilyEnabled: false
  });
  const [savingBilling, setSavingBilling] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3400);
  };

  const loadOverview = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const res = await platformApi.getOwnerOverview();
      if (!res.ok) {
        if (res.message?.includes('تسجيل الدخول')) {
          setIsAuthenticated(false);
          return;
        }
        setDataError(res.message || 'تعذر تحميل بيانات المنصة');
        return;
      }
      setOverview(res);
      const nextDrafts: Record<string, Plan> = {};
      (res.plans || DEFAULT_PLATFORM_PLANS).forEach(p => {
        nextDrafts[p.id] = { ...p };
      });
      setPlanDrafts(nextDrafts);
      if (res.paymentSettings) {
        setBillingDraft(res.paymentSettings);
      }
    } catch {
      setDataError('تعذر الاتصال بالخادم حالياً');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      setAuthStatusLoading(true);
      const status = await platformApi.getOwnerStatus();
      if (!mounted) return;
      setNeedsSetup(Boolean(status.needsSetup));
      setUsesEnvOverride(Boolean(status.usesEnvOverride));
      setOwnerEmailHint(status.ownerEmailHint || '');
      if (status.ownerEmailHint) {
        setEmailInput(status.ownerEmailHint);
      }
      setAuthStatusLoading(false);
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAuthError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    if (needsSetup) {
      if (passwordInput.length < 8) {
        setAuthError('يجب أن تتكون كلمة مرور المالك من 8 أحرف على الأقل');
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        setAuthError('كلمتا المرور غير متطابقتين');
        return;
      }
      setAuthSubmitting(true);
      const res = await platformApi.claimOwnerPassword(cleanEmail, passwordInput);
      setAuthSubmitting(false);
      if (!res.ok) {
        setAuthError(res.message || 'تعذر إعداد حساب مالك المنصة');
        return;
      }
      setNeedsSetup(false);
      setIsAuthenticated(true);
      setOwnerEmail(res.owner?.email || cleanEmail);
      setPasswordInput('');
      setConfirmPasswordInput('');
      void loadOverview();
      return;
    }

    setAuthSubmitting(true);
    const res = await platformApi.loginOwner(cleanEmail, passwordInput);
    setAuthSubmitting(false);
    if (!res.ok) {
      if (res.needsSetup) setNeedsSetup(true);
      setAuthError(res.message || 'بيانات الدخول غير صحيحة');
      return;
    }
    setIsAuthenticated(true);
    setOwnerEmail(res.owner?.email || cleanEmail);
    setPasswordInput('');
    void loadOverview();
  };

  const handleLogout = async () => {
    await platformApi.logoutOwner();
    setIsAuthenticated(false);
    setOverview(null);
  };

  const plans = overview?.plans || DEFAULT_PLATFORM_PLANS;
  const stores = overview?.stores || [];
  const requests = overview?.subscriptionRequests || [];

  const filteredStores = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stores.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.subdomain.toLowerCase().includes(q) ||
        (s.ownerEmail || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q)
      );
    });
  }, [stores, searchQuery, statusFilter]);

  const handleConfirmSuspendToggle = async () => {
    if (!suspendTarget) return;
    setIsMutatingStore(true);
    const nextStatus = suspendTarget.status === 'suspended' ? 'active' : 'suspended';
    const res = await platformApi.updateStoreStatus(
      suspendTarget.storeId,
      nextStatus,
      nextStatus === 'suspended' ? suspendReason.trim() : undefined
    );
    setIsMutatingStore(false);
    if (!res.ok) {
      showToast(res.message || 'تعذر تحديث حالة المتجر');
      return;
    }
    setSuspendTarget(null);
    setSuspendReason('');
    showToast(
      nextStatus === 'suspended'
        ? `تم إيقاف متجر «${suspendTarget.name}» ومنع استقبال الطلبات`
        : `تم إعادة تفعيل متجر «${suspendTarget.name}» بنجاح`
    );
    void loadOverview();
  };

  const handleSaveStorePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTarget) return;
    setIsMutatingStore(true);
    const res = await platformApi.updateStorePlan(
      planTarget.storeId,
      selectedPlanId,
      extendDays,
      selectedStoreStatus
    );
    setIsMutatingStore(false);
    if (!res.ok) {
      showToast(res.message || 'تعذر تحديث باقة المتجر');
      return;
    }
    setPlanTarget(null);
    showToast(`تم تحديث باقة متجر «${planTarget.name}» بنجاح`);
    void loadOverview();
  };

  const handleReviewRequest = async (reqItem: SubscriptionRequest, decision: 'approve' | 'reject') => {
    setIsReviewingReq(true);
    const res = await platformApi.reviewSubscriptionRequest(
      reqItem.id,
      decision,
      decision === 'reject' ? rejectReason.trim() : undefined
    );
    setIsReviewingReq(false);
    if (!res.ok) {
      showToast(res.message || 'تعذر معالجة طلب الاشتراك');
      return;
    }
    setReceiptPreviewReq(null);
    setRejectReason('');
    showToast(
      decision === 'approve'
        ? `تمت الموافقة وتفعيل باقة متجر «${reqItem.storeName}»`
        : `تم رفض طلب ترقية متجر «${reqItem.storeName}»`
    );
    void loadOverview();
  };

  const handleSavePlanDraft = async (planId: string) => {
    const draft = planDrafts[planId];
    if (!draft) return;
    setSavingPlanId(planId);
    const res = await platformApi.updatePlanConfig(planId, {
      priceDZD: Number(draft.priceDZD) || 0,
      maxLandingPages: Number(draft.maxLandingPages ?? draft.maxProducts) || 1,
      maxMonthlyOrders: Number(draft.maxMonthlyOrders) || 50,
      maxTeamMembers: Number(draft.maxTeamMembers) || 1,
      allowOnlinePayment: Boolean(draft.allowOnlinePayment)
    });
    setSavingPlanId(null);
    if (!res.ok) {
      showToast(res.message || 'تعذر حفظ تعديلات الباقة');
      return;
    }
    showToast(`تم تحديث إعدادات باقة «${draft.nameAr}»`);
    void loadOverview();
  };

  const handleSaveBillingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBilling(true);
    const res = await platformApi.saveOwnerBillingSettings({
      baridimobRip: billingDraft.baridimobRip,
      baridimobAccountName: billingDraft.baridimobAccountName,
      baridimobInstructions: billingDraft.baridimobInstructions
    });
    setSavingBilling(false);
    if (!res.ok) {
      showToast(res.message || 'تعذر حفظ بيانات التحصيل');
      return;
    }
    showToast('تم حفظ بيانات تحصيل الاشتراكات بنجاح');
    void loadOverview();
  };

  if (authStatusLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-slate-900 dark:text-white" />
          <span className="text-xs font-semibold">جارٍ التحقق من بوابة مالك المنصة...</span>
        </div>
      </div>
    );
  }

  // ── Unauthenticated: One-Time Claim OR Secure Login Screen ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between p-6" dir="rtl">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-8 py-2">
          <span className="text-base font-bold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            إدارة المنصة
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={onExitToStorefront}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للمتجر</span>
            </button>
          </div>
        </header>

        <main className="w-full max-w-md mx-auto my-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <div className="w-10 h-10 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {needsSetup ? 'تأمين حساب مالك المنصة' : 'دخول مالك المنصة'}
            </h1>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {needsSetup
                ? 'هذه أول مرة تفتح فيها بوابة المالك. عيّن بريدك وكلمة مرور قوية (8 أحرف على الأقل) لحماية لوحة التحكم العليا للمنصة.'
                : 'بوابة خاصة بمالك المنصة لإدارة التجار والاشتراكات وإيقاف المتاجر المخالفة.'}
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                البريد الإلكتروني للمالك
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder={ownerEmailHint || 'owner@brightdz.dz'}
                  className="w-full pr-9 pl-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={needsSetup ? 8 : 1}
                  dir="ltr"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-9 pl-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-300"
                />
              </div>
            </div>

            {needsSetup && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    dir="ltr"
                    value={confirmPasswordInput}
                    onChange={e => setConfirmPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-9 pl-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-300"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {authSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ التحقق...</span>
                </>
              ) : (
                <span>{needsSetup ? 'حفظ كلمة المرور والدخول' : 'دخول إلى لوحة المالك'}</span>
              )}
            </button>
          </form>

          {usesEnvOverride && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              المصادقة مرتبطة حالياً بمتغيرات البيئة السرية على الخادم.
            </p>
          )}
        </main>

        <footer className="text-center text-[11px] text-slate-500 dark:text-slate-400">
          بوابة إدارة المنصة العليا — الوصول مقتصر على المالك فقط
        </footer>
      </div>
    );
  }

  const summary = overview?.summary || {
    totalStores: 0,
    activeStores: 0,
    trialStores: 0,
    suspendedStores: 0,
    pendingRequests: 0,
    estimatedMrrDZD: 0,
    totalOrdersAllStores: 0
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 rounded-lg text-xs font-semibold shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Sidebar (256px SaaS Workspace Canvas) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
        <div className="h-16 px-5 flex items-center border-b border-slate-200 dark:border-slate-800">
          <span className="font-bold text-base text-slate-900 dark:text-white whitespace-nowrap">
            مركز مالك المنصة
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button
            type="button"
            onClick={() => setActiveTab('stores')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'stores'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <StoreIcon className="w-4 h-4 shrink-0" />
              <span>التجار والمتاجر</span>
            </span>
            <span className="text-xs tabular-nums opacity-75">{summary.totalStores}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Receipt className="w-4 h-4 shrink-0" />
              <span>طلبات الاشتراك</span>
            </span>
            {summary.pendingRequests > 0 && (
              <span className="text-xs font-bold tabular-nums text-amber-500">
                {summary.pendingRequests}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'plans'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Sliders className="w-4 h-4 shrink-0" />
              <span>الباقات والتحصيل</span>
            </span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">
            {ownerEmail}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExitToStorefront}
              className="flex-1 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              واجهة المنصة
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-300 cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (3-zone contract) */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-6">
          <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
            <span>المنصة</span>
            <span className="mx-2">/</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {activeTab === 'stores'
                ? 'التجار والمتاجر'
                : activeTab === 'requests'
                ? 'طلبات الاشتراك والوصولات'
                : 'الباقات وإعدادات التحصيل'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={isLoadingData}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>تحديث البيانات</span>
            </button>
          </div>
        </header>

        {/* Mobile Tab Switcher */}
        <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {(
            [
              { id: 'stores', label: 'التجار والمتاجر' },
              { id: 'requests', label: `طلبات الاشتراك (${summary.pendingRequests})` },
              { id: 'plans', label: 'الباقات والتحصيل' }
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {dataError && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {/* 4-Column KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">إجمالي المتاجر</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {summary.totalStores}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {summary.activeStores} نشط · {summary.trialStores} تجريبي · {summary.suspendedStores} موقوف
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">الإيراد الشهري المتوقع</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatDZD(summary.estimatedMrrDZD)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                من اشتراكات المتاجر النشطة
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">طلبات ترقية معلّقة</div>
              <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {summary.pendingRequests}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                بانتظار مراجعة وصل الدفع
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">إجمالي طلبات المنصة</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {summary.totalOrdersAllStores.toLocaleString('en-US')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                عبر جميع متاجر التجار
              </div>
            </div>
          </div>

          {/* ── TAB 1: STORES MANAGEMENT ── */}
          {activeTab === 'stores' && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="ابحث باسم المتجر أو النطاق الفرعي أو البريد..."
                    className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-300"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                  {(
                    [
                      { id: 'all', label: 'الكل' },
                      { id: 'active', label: 'نشط' },
                      { id: 'trial', label: 'تجريبي' },
                      { id: 'suspended', label: 'موقوف' }
                    ] as const
                  ).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        statusFilter === f.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredStores.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    لا توجد متاجر مطابقة حالياً
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ستظهر جميع متاجر التجار تلقائياً هنا فور تسجيلها أو فتح لوحة المتجر.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                        <th className="py-3 px-4 font-semibold">المتجر</th>
                        <th className="py-3 px-4 font-semibold">الباقة</th>
                        <th className="py-3 px-4 font-semibold">الحالة</th>
                        <th className="py-3 px-4 font-semibold">الاستهلاك</th>
                        <th className="py-3 px-4 font-semibold">المبيعات</th>
                        <th className="py-3 px-4 font-semibold text-left">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredStores.map(st => {
                        const plan = resolvePlanById(st.planId, plans);
                        const meta = STATUS_META[st.status] || STATUS_META.active;
                        return (
                          <tr
                            key={st.storeId}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {st.name}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                <span dir="ltr">{st.subdomain}</span>
                                {st.ownerEmail ? ` · ${st.ownerEmail}` : ''}
                              </div>
                              {st.status === 'suspended' && st.suspendedReason && (
                                <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                                  السبب: {st.suspendedReason}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {plan.nameAr}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                {formatDZD(plan.priceDZD)} / شهر
                              </div>
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={`font-bold ${meta.colorClass}`}>{meta.label}</span>
                              {st.subscriptionEndsAt && st.status === 'active' && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                                  حتى {new Date(st.subscriptionEndsAt).toLocaleDateString('ar-DZ')}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">
                              <div>
                                {st.landingPagesCount} / {formatLimitLabel(plan.maxLandingPages ?? plan.maxProducts)} صفحة
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {st.monthlyOrdersCount} طلب هذا الشهر · {st.activeTeamCount + 1} مستخدم
                              </div>
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap font-bold tabular-nums text-slate-900 dark:text-white">
                              {formatDZD(st.totalRevenueDZD)}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPlanTarget(st);
                                    setSelectedPlanId(st.planId || 'plan_pro');
                                    setSelectedStoreStatus(st.status === 'trial' ? 'trial' : 'active');
                                    setExtendDays(30);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                                >
                                  تغيير الباقة
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSuspendTarget(st);
                                    setSuspendReason(st.suspendedReason || '');
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 cursor-pointer ${
                                    st.status === 'suspended'
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                      : 'border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  }`}
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>{st.status === 'suspended' ? 'إعادة التفعيل' : 'إيقاف'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── TAB 2: SUBSCRIPTION REQUESTS ── */}
          {activeTab === 'requests' && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  طلبات الترقية ووصولات الدفع
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  راجع وصولات بريدي موب ووافق عليها لتفعيل باقة التاجر لمدة 30 يوماً تلقائياً.
                </p>
              </div>

              {requests.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    لا توجد طلبات اشتراك بعد
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    عندما يطلب أحد التجار ترقية باقته ويرفق وصل بريدي موب سيظهر طلبه هنا فوراً.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                        <th className="py-3 px-4 font-semibold">المتجر</th>
                        <th className="py-3 px-4 font-semibold">الباقة المطلوبة</th>
                        <th className="py-3 px-4 font-semibold">المبلغ والطريقة</th>
                        <th className="py-3 px-4 font-semibold">الحالة</th>
                        <th className="py-3 px-4 font-semibold text-left">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {requests.map(r => {
                        const plan = resolvePlanById(r.planId, plans);
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">{r.storeName}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {r.storeSubdomain} · {new Date(r.createdAt).toLocaleDateString('ar-DZ')}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-semibold">{plan.nameAr}</td>
                            <td className="py-3.5 px-4 tabular-nums">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {formatDZD(r.amountDZD)}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {r.paymentMethod === 'chargily' ? 'Chargily إلكتروني' : 'تحويل بريدي موب'}
                                {r.transactionRef ? ` · مرجع: ${r.transactionRef}` : ''}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-bold">
                              {r.status === 'approved' ? (
                                <span className="text-emerald-700 dark:text-emerald-400">مقبول ومفعّل</span>
                              ) : r.status === 'rejected' ? (
                                <span className="text-rose-700 dark:text-rose-400">مرفوض</span>
                              ) : (
                                <span className="text-amber-700 dark:text-amber-400">قيد المراجعة</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptPreviewReq(r);
                                    setRejectReason('');
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{r.status === 'pending' ? 'مراجعة وتفعيل' : 'عرض التفاصيل'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── TAB 3: PLANS & PLATFORM BILLING SETTINGS ── */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    إعدادات تحصيل اشتراكات التجار
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    يظهر رقم حساب بريدي موب هذا للتجار داخل تبويب «الباقة والاشتراك» عند طلب الترقية.
                  </p>
                </div>

                <form onSubmit={handleSaveBillingSettings} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      رقم RIP بريدي موب لتحصيل الاشتراكات
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={billingDraft.baridimobRip}
                      onChange={e =>
                        setBillingDraft(prev => ({ ...prev, baridimobRip: e.target.value }))
                      }
                      placeholder="0079999900XXXXXXXXXX"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      اسم صاحب الحساب البريدي
                    </label>
                    <input
                      type="text"
                      value={billingDraft.baridimobAccountName}
                      onChange={e =>
                        setBillingDraft(prev => ({ ...prev, baridimobAccountName: e.target.value }))
                      }
                      placeholder="الاسم الكامل لصاحب المنصة"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      تعليمات التحويل الظاهرة للتجار
                    </label>
                    <textarea
                      rows={2}
                      value={billingDraft.baridimobInstructions}
                      onChange={e =>
                        setBillingDraft(prev => ({ ...prev, baridimobInstructions: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span>
                        تحصيل الاشتراكات التلقائي عبر Chargily:{' '}
                        <strong className={billingDraft.chargilyEnabled ? 'text-emerald-600' : 'text-slate-600 dark:text-slate-300'}>
                          {billingDraft.chargilyEnabled ? 'مفعّل عبر متغيرات البيئة' : 'غير مضبوط (تفعيل يدوي عبر بريدي موب متاح)'}
                        </strong>
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={savingBilling}
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {savingBilling ? 'جارٍ الحفظ...' : 'حفظ بيانات التحصيل'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {plans.map(plan => {
                  const draft = planDrafts[plan.id] || plan;
                  return (
                    <div
                      key={plan.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {plan.nameAr}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {plan.taglineAr || plan.name}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">السعر (دج/شهر)</label>
                            <input
                              type="number"
                              min={0}
                              value={draft.priceDZD}
                              onChange={e =>
                                setPlanDrafts(prev => ({
                                  ...prev,
                                  [plan.id]: { ...draft, priceDZD: Number(e.target.value) }
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">حد صفحات الهبوط</label>
                            <input
                              type="number"
                              min={1}
                              value={draft.maxLandingPages ?? draft.maxProducts}
                              onChange={e =>
                                setPlanDrafts(prev => ({
                                  ...prev,
                                  [plan.id]: {
                                    ...draft,
                                    maxLandingPages: Number(e.target.value),
                                    maxProducts: Number(e.target.value)
                                  }
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">حد الطلبات/شهر</label>
                            <input
                              type="number"
                              min={1}
                              value={draft.maxMonthlyOrders ?? 100}
                              onChange={e =>
                                setPlanDrafts(prev => ({
                                  ...prev,
                                  [plan.id]: { ...draft, maxMonthlyOrders: Number(e.target.value) }
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">عدد المستخدمين</label>
                            <input
                              type="number"
                              min={1}
                              value={draft.maxTeamMembers ?? 1}
                              onChange={e =>
                                setPlanDrafts(prev => ({
                                  ...prev,
                                  [plan.id]: { ...draft, maxTeamMembers: Number(e.target.value) }
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums font-bold"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.allowOnlinePayment)}
                            onChange={e =>
                              setPlanDrafts(prev => ({
                                ...prev,
                                [plan.id]: { ...draft, allowOnlinePayment: e.target.checked }
                              }))
                            }
                            className="rounded border-slate-300"
                          />
                          <span>السماح بالدفع الإلكتروني (Chargily وبريدي موب)</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        disabled={savingPlanId === plan.id}
                        onClick={() => void handleSavePlanDraft(plan.id)}
                        className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {savingPlanId === plan.id ? 'جارٍ الحفظ...' : 'حفظ حدود الباقة'}
                      </button>
                    </div>
                  );
                })}
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Modal 1: Suspend / Reactivate Store */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {suspendTarget.status === 'suspended'
                  ? `إعادة تفعيل متجر ${suspendTarget.name}`
                  : `إيقاف متجر ${suspendTarget.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {suspendTarget.status !== 'suspended' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  سيتم حجب واجهة هذا المتجر عن الزبائن فوراً ومنع تسجيل طلبات جديدة حتى تقوم بإعادة تفعيله.
                </p>
                <div>
                  <label className="block text-xs font-semibold mb-1">سبب الإيقاف (يظهر للتاجر)</label>
                  <textarea
                    rows={3}
                    value={suspendReason}
                    onChange={e => setSuspendReason(e.target.value)}
                    placeholder="مثال: بيع منتجات مخالفة أو انتهاء مدة الاشتراك دون تجديد"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                سيعود متجر «{suspendTarget.name}» للعمل واستقبال طلبات الزبائن مباشرة بعد التأكيد.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isMutatingStore}
                onClick={() => void handleConfirmSuspendToggle()}
                className={`px-4 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer disabled:opacity-60 ${
                  suspendTarget.status === 'suspended'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {isMutatingStore
                  ? 'جارٍ التنفيذ...'
                  : suspendTarget.status === 'suspended'
                  ? 'تأكيد إعادة التفعيل'
                  : 'تأكيد الإيقاف الفوري'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Assign Store Plan / Extend Trial */}
      {planTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStorePlan}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                تعديل باقة متجر {planTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setPlanTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">الباقة</label>
                <select
                  value={selectedPlanId}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nameAr} — {formatDZD(p.priceDZD)} / شهر
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">الحالة</label>
                  <select
                    value={selectedStoreStatus}
                    onChange={e => setSelectedStoreStatus(e.target.value as 'active' | 'trial')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold"
                  >
                    <option value="active">نشط (اشتراك مفعّل)</option>
                    <option value="trial">فترة تجريبية</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">المدة بالأيام</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={extendDays}
                    onChange={e => setExtendDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPlanTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isMutatingStore}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {isMutatingStore ? 'جارٍ الحفظ...' : 'تطبيق الباقة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Subscription Request & Receipt Review */}
      {receiptPreviewReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 my-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                مراجعة طلب ترقية — {receiptPreviewReq.storeName}
              </h3>
              <button
                type="button"
                onClick={() => setReceiptPreviewReq(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-500">الباقة المطلوبة:</span>{' '}
                <strong>{resolvePlanById(receiptPreviewReq.planId, plans).nameAr}</strong>
              </div>
              <div className="tabular-nums">
                <span className="text-slate-500">المبلغ:</span>{' '}
                <strong>{formatDZD(receiptPreviewReq.amountDZD)}</strong>
              </div>
              {receiptPreviewReq.transactionRef && (
                <div className="col-span-2 font-mono">
                  <span className="text-slate-500 font-sans">مرجع العملية:</span>{' '}
                  {receiptPreviewReq.transactionRef}
                </div>
              )}
              {receiptPreviewReq.notes && (
                <div className="col-span-2">
                  <span className="text-slate-500">ملاحظة التاجر:</span> {receiptPreviewReq.notes}
                </div>
              )}
            </div>

            {receiptPreviewReq.receiptImageUrl && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  صورة وصل التحويل
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 max-h-72 flex items-center justify-center">
                  <img
                    src={receiptPreviewReq.receiptImageUrl}
                    alt="وصل الدفع"
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-auto object-contain"
                  />
                </div>
              </div>
            )}

            {receiptPreviewReq.status === 'pending' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    سبب الرفض (اختياري في حالة الرفض فقط)
                  </label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="مثال: الصورة غير واضحة أو المبلغ ناقص"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isReviewingReq}
                    onClick={() => void handleReviewRequest(receiptPreviewReq, 'approve')}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>موافقة وتفعيل الباقة (30 يوماً)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isReviewingReq}
                    onClick={() => void handleReviewRequest(receiptPreviewReq, 'reject')}
                    className="px-4 py-2.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>رفض</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
