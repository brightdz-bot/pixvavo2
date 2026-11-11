import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { storage } from '../../services/storage';
import { ConfirmDialog } from './ConfirmDialog';
import { ShieldCheck, Store as StoreIcon, Globe, LayoutDashboard, RotateCcw } from 'lucide-react';

interface Props {
  currentView: 'visitor' | 'merchant' | 'storefront' | 'admin';
  setCurrentView: (view: 'visitor' | 'merchant' | 'storefront' | 'admin') => void;
}

export const RoleSwitcherBanner: React.FC<Props> = ({ currentView, setCurrentView }) => {
  const { switchRole, currentStore, setCurrentSubdomain } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);

  const handleSelectView = (view: 'visitor' | 'merchant' | 'storefront' | 'admin') => {
    setCurrentView(view);
    if (view === 'visitor') {
      switchRole('visitor');
    } else if (view === 'merchant') {
      switchRole('merchant');
    } else if (view === 'admin') {
      switchRole('admin');
    } else if (view === 'storefront') {
      // Keep store
      if (currentStore) setCurrentSubdomain(currentStore.subdomain);
    }
  };

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
      message="سيتم حذف كل المتاجر والمنتجات والطلبات التي أضفتها والعودة إلى البيانات الأولية."
      confirmLabel="نعم، أعد التعيين"
      onConfirm={handleResetData}
      onCancel={() => setResetOpen(false)}
    />
    <header className="bg-slate-900 text-slate-100 text-xs px-3 sm:px-6 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shadow-inner">
      <div className="flex items-center gap-2">
        <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-sm">
          <StoreIcon className="w-4 h-4" />
          <span>منصة دكاني الجزائر</span>
        </span>
        <span className="hidden sm:inline-block text-slate-400">|</span>
        <span className="hidden md:inline-block text-slate-400">
          المتجر الحالي: <strong className="text-white">{currentStore?.name || 'النخبة'}</strong>
          <span className="font-mono text-emerald-300 text-[11px] mr-1">({currentStore?.subdomain}.dokani.dz)</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-slate-400 hidden lg:inline-block ml-1">الأدوار الأربعة:</span>

        {/* Visitor */}
        <button
          onClick={() => handleSelectView('visitor')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
            currentView === 'visitor'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="صفحة الهبوط والتسعير ونموذج إنشاء المتجر"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>1. زائر / إنشاء متجر</span>
        </button>

        {/* Merchant Dashboard */}
        <button
          onClick={() => handleSelectView('merchant')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
            currentView === 'merchant'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="لوحة تحكم التاجر: المنتجات، الطلبات، الإحصائيات والإعدادات"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>2. لوحة التاجر</span>
        </button>

        {/* Public Storefront */}
        <button
          onClick={() => handleSelectView('storefront')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
            currentView === 'storefront'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="المتجر العام للزبائن والدفع عند الاستلام مع حساب التوصيل"
        >
          <StoreIcon className="w-3.5 h-3.5" />
          <span>3. واجهة المتجر للزبون</span>
        </button>

        {/* Platform Admin */}
        <button
          onClick={() => handleSelectView('admin')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
            currentView === 'admin'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          title="إدارة المنصة، التجار، الاشتراكات والعمولات"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>4. إدارة المنصة</span>
        </button>

        {/* Reset Demo Data */}
        <button
          onClick={() => setResetOpen(true)}
          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors mr-1"
          title="إعادة تعيين البيانات الأولية"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
    </>
  );
};
