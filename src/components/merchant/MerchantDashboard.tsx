import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../services/authContext';
import { storage } from '../../services/storage';
import { LandingPage, Order, OrderStatus, Store } from '../../types';
import { OverviewTab } from './OverviewTab';
import { LandingPagesTab } from './LandingPagesTab';
import { OrdersTab } from './OrdersTab';
import { SettingsTab } from './SettingsTab';
import { ThemeToggle } from '../common/ThemeToggle';
import { LoginModal } from '../visitor/LoginModal';
import {
  LayoutDashboard,
  Layers,
  ShoppingBag,
  Settings,
  ExternalLink,
  Store as StoreIcon,
  CheckCircle2,
  Menu,
  X,
  LogOut,
  Lock,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Props {
  onGoToStorefront: (slug?: string) => void;
}

export const MerchantDashboard: React.FC<Props> = ({ onGoToStorefront }) => {
  const {
    currentStore,
    currentUser,
    isSupabaseMode,
    isLoading: isAuthLoading,
    refreshCurrentStore,
    setupPrivateStore,
    enableDemoPreview,
    logout
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'orders' | 'settings'>('pages');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // First-time private store setup form (in Supabase mode when DB has no store yet)
  const [setupStoreName, setSetupStoreName] = useState('Bright DZ');
  const [setupSubdomain, setSetupSubdomain] = useState('bright-dz');
  const [setupPhone, setSetupPhone] = useState('0798353165');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Data states
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const store = currentStore || (!isSupabaseMode ? storage.getLocalStores()[0] : null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!store?.id) {
      setIsDataLoading(false);
      return;
    }
    setIsDataLoading(true);
    setLoadError(null);
    try {
      const [loadedPages, loadedOrders] = await Promise.all([
        storage.getLandingPages(store.id),
        storage.getOrders(store.id)
      ]);
      setLandingPages(loadedPages);
      setOrders(loadedOrders);
    } catch (err) {
      console.error('Failed to load store data:', err);
      setLoadError('تعذر تحميل بيانات المتجر، يرجى إعادة المحاولة');
    } finally {
      setIsDataLoading(false);
    }
  }, [store?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveLandingPage = async (page: LandingPage): Promise<boolean> => {
    const res = await storage.saveLandingPage(page);
    if (res.success) {
      await loadData();
      showToast('تم حفظ صفحة الهبوط ونشر التعديلات بنجاح');
      return true;
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ صفحة الهبوط'));
      return false;
    }
  };

  const handleDeleteLandingPage = async (pageId: string) => {
    const res = await storage.deleteLandingPage(pageId);
    if (res.success) {
      await loadData();
      showToast('تم حذف صفحة الهبوط');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر الحذف'));
    }
  };

  const handleRestockPage = async (pageId: string, addCount: number) => {
    const page = landingPages.find(p => p.id === pageId);
    if (!page) return;
    const res = await storage.saveLandingPage({ ...page, stock: page.stock + addCount });
    if (res.success) {
      await loadData();
      showToast(`تم تزويد المخزون بـ +${addCount} قطع بنجاح`);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    note?: string,
    trackingCode?: string
  ) => {
    if (!store?.id) return;
    const res = await storage.updateOrderStatus(orderId, newStatus, note, trackingCode);
    if (res.success) {
      const [updatedOrders, updatedPages] = await Promise.all([
        storage.getOrders(store.id),
        storage.getLandingPages(store.id)
      ]);
      setOrders(updatedOrders);
      setLandingPages(updatedPages);
      if (selectedOrder && selectedOrder.id === orderId) {
        const found = updatedOrders.find(o => o.id === orderId);
        if (found) setSelectedOrder(found);
      }
      showToast('تم تحديث حالة الطلب بنجاح');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر تحديث الطلب'));
    }
  };

  const handleSaveSettings = async (updated: Store) => {
    const res = await storage.saveStore(updated);
    if (res.success) {
      await refreshCurrentStore();
      showToast('تم حفظ إعدادات المتجر بنجاح');
    } else {
      showToast('خطأ: ' + (res.error || 'تعذر حفظ الإعدادات'));
    }
  };

  const handleInitialStoreSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    setIsSettingUp(true);
    const res = await setupPrivateStore({
      storeName: setupStoreName,
      subdomain: setupSubdomain,
      phone: setupPhone
    });
    setIsSettingUp(false);
    if (!res.success) {
      setSetupError(res.error || 'تعذر إنشاء المتجر');
    }
  };

  // Protected route in Supabase mode
  if (isSupabaseMode && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 text-center">
        <LoginModal
          isOpen={loginModalOpen}
          onClose={() => setLoginModalOpen(false)}
          onSuccess={() => setLoginModalOpen(false)}
        />
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            لوحة إدارة متجرك الخاصة
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            سجّل الدخول بحساب مالك المتجر للوصول إلى منشئ صفحات الهبوط والطلبات.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setLoginModalOpen(true)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md cursor-pointer"
            >
              تسجيل دخول المالك
            </button>
          </div>
        </div>
      </div>
    );
  }

  // First-time store initialization in Supabase mode
  if (isSupabaseMode && !isAuthLoading && !store) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
              <StoreIcon className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">تهيئة متجرك الخاص</h2>
            <p className="text-xs text-slate-500">أدخل الاسم الأولي لمتجرك لتفعيل منشئ صفحات الهبوط</p>
          </div>
          {setupError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {setupError}
            </div>
          )}
          <form onSubmit={handleInitialStoreSetup} className="space-y-3">
            <div>
              <label className="block text-xs font-bold mb-1">اسم المتجر</label>
              <input
                type="text"
                required
                value={setupStoreName}
                onChange={e => setSetupStoreName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">معرف المتجر (بالإنجليزية)</label>
              <input
                type="text"
                dir="ltr"
                required
                value={setupSubdomain}
                onChange={e => setSetupSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">رقم الهاتف / واتساب</label>
              <input
                type="text"
                dir="ltr"
                required
                value={setupPhone}
                onChange={e => setSetupPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSettingUp}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
            >
              {isSettingUp ? 'جارٍ الإنشاء وتجهيز الصفحات...' : 'حفظ وفتح لوحة التحكم'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => enableDemoPreview(true)}
            className="w-full py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold cursor-pointer"
          >
            تشغيل الوضع التجريبي المباشر (بدون قاعدة بيانات)
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full py-2 text-center text-xs text-slate-400 hover:text-rose-500 font-semibold cursor-pointer"
          >
            تسجيل الخروج ({currentUser?.email})
          </button>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <span className="text-xs text-slate-500 font-bold">جارٍ تحميل لوحة المتجر...</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
    { id: 'pages', label: 'صفحات الهبوط', icon: Layers, badge: landingPages.length },
    { id: 'orders', label: 'الطلبات والشحن', icon: ShoppingBag, badge: orders.filter(o => o.status === 'new').length },
    { id: 'settings', label: 'الإعدادات والتوصيل', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-colors">
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 p-4 rounded-xl bg-slate-900 text-white dark:bg-emerald-600 shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col justify-between w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-5 shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-md shrink-0"
              style={{ backgroundColor: store.brandColor || '#754b2d' }}
            >
              {store.name.slice(0, 1)}
            </div>
            <div className="truncate">
              <h2 className="font-bold text-sm truncate">{store.name}</h2>
              <div className="text-[11px] text-slate-400 truncate">لوحة المتجر وصفحات الهبوط</div>
            </div>
          </div>

          <button
            onClick={() => onGoToStorefront()}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-between border border-slate-200 dark:border-slate-700/60 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>معاينة المتجر والصفحات</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <nav className="space-y-1.5 pt-2">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 rounded-full text-[10px] font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                {(currentUser?.name || store.name)[0]}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold truncate">{currentUser?.name || store.name}</div>
                <div className="text-[10px] text-slate-400 truncate">
                  {isSupabaseMode ? currentUser?.email : 'وضع محلي تجريبي'}
                </div>
              </div>
            </div>
            <ThemeToggle />
          </div>
          {isSupabaseMode && (
            <button
              onClick={logout}
              className="w-full py-1.5 text-center text-xs text-slate-400 hover:text-rose-500 font-semibold flex items-center justify-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-6">
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="text-base font-extrabold">
              {navItems.find(i => i.id === activeTab)?.label}
            </span>
          </div>

          <button
            onClick={() => onGoToStorefront()}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <StoreIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">معاينة واجهة المتجر</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="md:hidden p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold ${
                    isActive ? 'bg-emerald-600 text-white' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-4 sm:p-8 flex-1">
          {isDataLoading && (
            <div className="p-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">جارٍ تحميل بيانات المتجر...</p>
            </div>
          )}

          {loadError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{loadError}</span>
              </div>
              <button onClick={loadData} className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold">
                إعادة المحاولة
              </button>
            </div>
          )}

          {!isDataLoading && (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  store={store}
                  orders={orders}
                  landingPages={landingPages}
                  onSelectOrder={ord => {
                    setSelectedOrder(ord);
                    setActiveTab('orders');
                  }}
                  onGoToPages={() => setActiveTab('pages')}
                  onRestockPage={handleRestockPage}
                />
              )}

              {activeTab === 'pages' && (
                <LandingPagesTab
                  storeId={store.id}
                  landingPages={landingPages}
                  onSaveLandingPage={handleSaveLandingPage}
                  onDeleteLandingPage={handleDeleteLandingPage}
                  onPreviewPage={slug => onGoToStorefront(slug)}
                />
              )}

              {activeTab === 'orders' && (
                <OrdersTab
                  store={store}
                  orders={orders}
                  onUpdateStatus={handleUpdateOrderStatus}
                  selectedOrder={selectedOrder}
                  onSelectOrder={setSelectedOrder}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab store={store} onSaveSettings={handleSaveSettings} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
