import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { storage } from '../../services/storage';
import { ConfirmDialog } from './ConfirmDialog';
import { Store as StoreIcon, LayoutDashboard, RotateCcw, Layers, ShieldCheck } from 'lucide-react';

interface Props {
  currentView: 'merchant' | 'storefront' | 'owner';
  setCurrentView: (view: 'merchant' | 'storefront' | 'owner') => void;
}

export const RoleSwitcherBanner: React.FC<Props> = ({ currentView, setCurrentView }) => {
  const { currentStore, hasSupabaseEnv, isSupabaseMode, enableDemoPreview } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);

  const handleResetData = () => {
    storage.resetDemoData();
    window.location.reload();
  };

  return (
    <>
      <ConfirmDialog
        isOpen={resetOpen}
        danger
        title="إعادة تعيين البيانات التجريبية؟"
        message="سيتم استعادة صفحات الهبوط والطلبات الأولية لهذا المتجر."
        confirmLabel="نعم، أعد التعيين"
        onConfirm={handleResetData}
        onCancel={() => setResetOpen(false)}
      />
      <div className="bg-slate-900 text-slate-100 text-xs px-3 sm:px-6 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-amber-400 flex items-center gap-1.5 text-sm">
            <Layers className="w-4 h-4" />
            <span>{currentStore?.name || 'Bright DZ'}</span>
          </span>
          <span className="hidden sm:inline-block text-slate-500">|</span>
          <span className="hidden md:inline-block text-slate-400">
            متجر خاص ومنشئ صفحات الهبوط
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setCurrentView('merchant')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              currentView === 'merchant'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>لوحة المتجر ومنشئ الصفحات</span>
          </button>

          <button
            onClick={() => setCurrentView('storefront')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              currentView === 'storefront'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <StoreIcon className="w-3.5 h-3.5" />
            <span>واجهة الزبائن وصفحات الهبوط</span>
          </button>

          <button
            onClick={() => setCurrentView('owner')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-amber-300 hover:bg-slate-800 border border-slate-700 transition-all cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>لوحة مالك المنصة</span>
          </button>

          {hasSupabaseEnv && !isSupabaseMode && (
            <button
              onClick={() => enableDemoPreview(false)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-bold text-[11px] cursor-pointer"
              title="العودة للاتصال بقاعدة بيانات Supabase"
            >
              العودة لـ Supabase
            </button>
          )}

          <button
            onClick={() => setResetOpen(true)}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="إعادة تعيين البيانات الأولية"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
};
