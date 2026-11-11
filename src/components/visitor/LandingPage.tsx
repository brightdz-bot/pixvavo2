import React, { useState } from 'react';
import { SAAS_PLANS } from '../../data/plans';
import { formatDZD } from '../../data/wilayas';
import { StoreSignupModal } from './StoreSignupModal';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  Store,
  Truck,
  Banknote,
  Check,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Package,
  Layers,
  ArrowLeft,
  Smartphone,
  BarChart3,
  Globe2
} from 'lucide-react';

interface Props {
  onGoToMerchant: () => void;
  onGoToStorefront: () => void;
}

export const LandingPage: React.FC<Props> = ({ onGoToMerchant, onGoToStorefront }) => {
  const [signupOpen, setSignupOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_pro');

  const openSignupWithPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setSignupOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-30 backdrop-blur-md bg-white/85 dark:bg-slate-900/85 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                دُكّانِي <span className="text-emerald-600 dark:text-emerald-400">.dz</span>
              </span>
              <span className="hidden sm:inline-block text-[11px] text-slate-500 dark:text-slate-400 mr-2 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">
                منصة التجارة الإلكترونية في الجزائر
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={onGoToMerchant}
              className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 px-3 py-2 rounded-xl transition-colors hidden md:inline-block"
            >
              دخول التاجر
            </button>
            <button
              onClick={() => openSignupWithPlan('plan_trial')}
              className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>أنشئ متجرك مجاناً</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 px-4 sm:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Right Text (RTL) */}
          <div className="lg:col-span-7 space-y-6 text-right">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>المنصة الأولى المخصصة 100% للسوق الجزائري</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white leading-[1.2] tracking-tight">
              أطلق متجرك الإلكتروني في الجزائر، وبع باحترافية مع{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-emerald-600 to-teal-400">
                الدفع عند الاستلام
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              منصة «دكاني» تمنحك متجراً متكاملاً بنطاقك الخاص، مع حساب تلقائي لأسعار التوصيل لـ 58 ولاية، إدارة المخزون، ونظام تتبع الطلبات خطوة بخطوة.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => openSignupWithPlan('plan_pro')}
                className="px-7 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 hover:-translate-y-0.5"
              >
                <span>ابدأ الآن خلال دقيقتين</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onGoToStorefront}
                className="px-6 py-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-base transition-all flex items-center gap-2"
              >
                <Globe2 className="w-4 h-4 text-emerald-600" />
                <span>معاينة متجر زبائن حقيقي</span>
              </button>
            </div>

            {/* Micro Benefits */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 dark:border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>ربط شركات التوصيل</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>دفع عند الاستلام (COD)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>متوافق تماماً مع الهاتف</span>
              </div>
            </div>
          </div>

          {/* Left Preview Card */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-1.5 shadow-2xl border border-slate-200 dark:border-slate-800">
              <div className="rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-inner p-5 space-y-4">
                {/* Mock Dashboard Sneak Peek */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      ن
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">متجر النخبة للموضة</div>
                      <div className="text-[10px] text-slate-400 font-mono">el-nokhba.dokani.dz</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold">
                    نشط ● 58 ولاية
                  </span>
                </div>

                {/* 3 Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">مبيعات اليوم</span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      84,500 د.ج
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">الطلبات المؤكدة</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                      12 طلب
                    </span>
                  </div>
                </div>

                {/* Mock Recent Orders */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">أحدث الطلبات الواردة:</span>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">أمين بلقاسم (الجزائر العاصمة)</div>
                      <div className="text-[10px] text-slate-400">برنوس رجالي صوف تقرتي • 14,800 د.ج</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                      قيد التوصيل
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">فاطمة الزهراء (وهران)</div>
                      <div className="text-[10px] text-slate-400">قفطان مطرز بالفتلة • 18,500 د.ج</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                      تم التسليم
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights for Algeria */}
      <section className="py-16 px-4 sm:px-8 bg-white dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              لماذا يفضل تجار الجزائر منصة «دكاني»؟
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              صممت خصيصاً لتناسب عادات الشراء الجزائرية وشركات التوصيل المحلية
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">حساب التوصيل حسب 58 ولاية</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                حدد تكلفة شحن خاصة بكل ولاية (الجزائر 400 د.ج، وهران 600 د.ج، بسكرة 800 د.ج...) مع إمكانية تقديم التوصيل المجاني فوق حد معين.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">إدارة متقدمة لمسار الطلبات</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                تدرج بالحالة من "جديد" إلى "مؤكد هاتفياً" ثم "مع شركة الشحن" وحتى "تم التحصيل"، مع سجل زمني كامل لتقليل نسبة المرتجعات.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">عزل تام لبيانات كل متجر</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                بنية برمجية متعددة المستأجرين (Multi-tenant) تضمن خصوصية كاملة لقاعدة بيانات زبائنك ومبيعاتك وقواعد أمان Firestore محكمة.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Plans Section */}
      <section className="py-20 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <span>خطط شفافة بالدينار الجزائري</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
              اختر الخطة المناسبة لحجم تجارتك
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400">
              بدون أي رسوم خفية أو عمولات على مبيعاتك — أرباحك لك بنسبة 100%
            </p>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {SAAS_PLANS.map(plan => {
              const isPro = plan.id === 'plan_pro';
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 ${
                    isPro
                      ? 'bg-gradient-to-b from-emerald-900/10 to-teal-900/10 dark:from-emerald-950/60 dark:to-teal-950/40 border-2 border-emerald-500 shadow-xl shadow-emerald-500/10 -translate-y-2'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {plan.isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-sm">
                      الخطة الأكثر طلباً بالجزائر ★
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                        {plan.nameAr}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {plan.billingPeriod}
                      </p>
                    </div>

                    <div className="py-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                        {plan.priceDZD === 0 ? '0' : new Intl.NumberFormat('ar-DZ').format(plan.priceDZD)}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400 mr-1.5">د.ج</span>
                      </div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                        {plan.commissionRate === 0 ? 'عمولة 0% على المبيعات' : `عمولة ${plan.commissionRate}%`}
                      </span>
                    </div>

                    {/* Features List */}
                    <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 pt-2">
                      {plan.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => openSignupWithPlan(plan.id)}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                        isPro
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {plan.priceDZD === 0 ? 'ابدأ مجاناً 14 يوم' : 'اشترك في الخطة'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
        <p>منصة دكاني © 2026 — أول منصة ساس جزائرية متكاملة للتجارة الإلكترونية والدفع عند الاستلام.</p>
      </footer>

      {/* Signup Modal */}
      <StoreSignupModal
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
        initialPlanId={selectedPlanId}
        onSuccess={onGoToMerchant}
      />
    </div>
  );
};
