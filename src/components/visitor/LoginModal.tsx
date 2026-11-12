import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { X, Lock, Mail, AlertCircle, Sparkles, LogIn } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenSignup: () => void;
  onSuccess: () => void;
}

export const LoginModal: React.FC<Props> = ({ isOpen, onClose, onOpenSignup, onSuccess }) => {
  const { login, isSupabaseMode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني');
      return;
    }

    if (isSupabaseMode && !password) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    setIsSubmitting(true);
    const res = await login(email.trim(), password);
    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || 'فشل تسجيل الدخول، يرجى التحقق من البيانات المدخلة');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 text-right">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <LogIn className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              تسجيل دخول التاجر
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ادخل لإدارة متجرك ومتابعة طلباتك ومبيعاتك
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              البريد الإلكتروني <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="merchant@example.dz"
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              كلمة المرور <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required={isSupabaseMode}
                dir="ltr"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            {!isSupabaseMode && (
              <p className="text-[11px] text-slate-400 mt-1">
                الوضع التجريبي: يمكنك تسجيل الدخول بـ <code className="text-emerald-600 font-mono">merchant@dokani.dz</code>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>جارٍ التحقق...</span>
              </>
            ) : (
              <span>دخول إلى لوحة التحكم</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500">
          <span>ليس لديك متجر بعد؟</span>{' '}
          <button
            onClick={() => {
              onClose();
              onOpenSignup();
            }}
            className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline mr-1"
          >
            أنشئ متجرك مجاناً الآن
          </button>
        </div>
      </div>
    </div>
  );
};
