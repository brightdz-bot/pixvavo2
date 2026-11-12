import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { SAAS_PLANS } from '../../data/plans';
import { formatDZD } from '../../data/wilayas';
import { X, CheckCircle2, AlertCircle, Sparkles, Store, Lock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialPlanId?: string;
  onSuccess: () => void;
}

export const StoreSignupModal: React.FC<Props> = ({ isOpen, onClose, initialPlanId, onSuccess }) => {
  const { registerStore } = useAuth();
  const [storeName, setStoreName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [merchantName, setMerchantName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [planId, setPlanId] = useState(initialPlanId || 'plan_trial');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto generate slug from store name if subdomain not typed manually
  const handleStoreNameChange = (val: string) => {
    setStoreName(val);
    // Keep suggesting a slug until the merchant edits the field manually
    if (!subdomainTouched) {
      const generated = val
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .slice(0, 30);
      setSubdomain(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!storeName.trim() || storeName.trim().length < 2) {
      setError('يرجى إدخال اسم المتجر بشكل صحيح (حرفين على الأقل)');
      return;
    }

    const cleanSub = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSub || cleanSub.length < 3) {
      setError('يرجى تحديد رابط المتجر الفرعي (3 أحرف إنجليزية أو أرقام على الأقل)');
      return;
    }

    if (!merchantName.trim()) {
      setError('يرجى إدخال اسمك الكامل');
      return;
    }

    // Algerian phone validation: begins with 05, 06, or 07 and 10 digits
    const cleanPhone = phone.replace(/\s+/g, '');
    const phoneRegex = /^(05|06|07)[0-9]{8}$/;
    if (!phoneRegex.test(cleanPhone)) {
      setError('يرجى إدخال رقم هاتف جزائري صحيح يبدأ بـ 05 أو 06 أو 07 ويتكون من 10 أرقام');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('يرجى إدخال بريد إلكتروني صحيح لتصلك بيانات الدخول والطلبات');
      return;
    }

    if (!password || password.length < 6) {
      setError('يرجى إدخال كلمة مرور تتكون من 6 أحرف على الأقل لحماية متجرك');
      return;
    }

    setIsSubmitting(true);

    const res = await registerStore({
      storeName: storeName.trim(),
      subdomain: cleanSub,
      planId,
      merchantName: merchantName.trim(),
      email: email.trim(),
      phone: cleanPhone,
      password: password
    });

    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || 'حدث خطأ غير متوقع أثناء إنشاء المتجر');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 my-8 text-right">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>أنشئ متجرك الإلكتروني في الجزائر</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                جاهز في دقيقة
              </span>
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              ابدأ البيع عبر الإنترنت مع الدفع عند الاستلام والتوصيل عبر 58 ولاية
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Store Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                اسم المتجر <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={e => handleStoreNameChange(e.target.value)}
                placeholder="مثال: متجر الأصالة، رويال فاشن..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            {/* Subdomain */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                رابط المتجر (Subdomain) <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 text-sm">
                <span className="px-2.5 py-2.5 bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs font-mono border-l border-slate-200 dark:border-slate-700">
                  .dokani.dz
                </span>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={subdomain}
                  onChange={e => {
                    setSubdomainTouched(true);
                    setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  placeholder="my-store"
                  className="w-full px-3 py-2 bg-transparent text-slate-900 dark:text-white font-mono text-sm focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                سيكون رابط متجرك: <span className="font-mono text-emerald-600 dark:text-emerald-400">{subdomain || 'store'}.dokani.dz</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Merchant Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                اسم التاجر / المالك <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={merchantName}
                onChange={e => setMerchantName(e.target.value)}
                placeholder="مثال: محمد بلقاسم"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            {/* Algerian Phone */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                رقم الهاتف الجزائري <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                dir="ltr"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="05 / 06 / 07 XX XX XX XX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              البريد الإلكتروني للتاجر <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="merchant@example.dz"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              كلمة مرور الحساب <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              dir="ltr"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="•••••••• (6 أحرف على الأقل)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          {/* Plan Selection */}
          <div className="pt-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              اختر خطة الاشتراك المناسبة:
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {SAAS_PLANS.map(plan => {
                const isSelected = planId === plan.id;
                return (
                  <div
                    key={plan.id}
                    onClick={() => setPlanId(plan.id)}
                    className={`cursor-pointer rounded-xl p-3 border text-center transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">
                      {plan.nameAr}
                    </div>
                    <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      {plan.priceDZD === 0 ? 'مجاناً' : formatDZD(plan.priceDZD)}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {plan.billingPeriod}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quality Notice */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>نظام آمن 100%، لا نطلب أي بيانات بنكية، والدفع للتوصيل عند الاستلام دائماً.</span>
          </div>

          {/* Submit */}
          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جارٍ إنشاء المتجر...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>تأكيد وإنشاء المتجر فوراً</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
