import React, { useState } from 'react';
import { Store, User, Order } from '../../types';
import { storage } from '../../services/storage';
import { SAAS_PLANS } from '../../data/plans';
import { formatDZD } from '../../data/wilayas';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  ShieldCheck,
  Store as StoreIcon,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  Search,
  Filter
} from 'lucide-react';

interface Props {
  onGoToMerchant: (storeId: string) => void;
  onGoToStorefront: (subdomain: string) => void;
  onGoToLanding: () => void;
}

export const PlatformAdmin: React.FC<Props> = ({
  onGoToMerchant,
  onGoToStorefront,
  onGoToLanding
}) => {
  const [stores, setStores] = useState<Store[]>(() => storage.getStores());
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [search, setSearch] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Calculate platform financial stats
  const allOrders: Order[] = storage.getOrders();
  const totalStores = stores.length;
  const activeStores = stores.filter(s => s.status === 'active').length;
  const suspendedStores = stores.filter(s => s.status === 'suspended').length;

  // Monthly subscription revenue calculation
  const monthlySubscriptionRev = stores.reduce((sum, s) => {
    const plan = SAAS_PLANS.find(p => p.id === s.planId);
    return sum + (plan ? plan.priceDZD : 0);
  }, 0);

  // Platform commissions (if any plan has commission)
  const totalOrdersAmount = allOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);

  const handleChangePlan = (storeId: string, newPlanId: string) => {
    const store = storage.getStoreById(storeId);
    if (store) {
      const updated: Store = { ...store, planId: newPlanId, updatedAt: new Date().toISOString() };
      storage.saveStore(updated);
      setStores(storage.getStores());
      showToast(`تم تغيير خطة متجر "${store.name}" بنجاح`);
    }
  };

  const handleToggleStoreStatus = (storeId: string) => {
    const store = storage.getStoreById(storeId);
    if (store) {
      const newStatus = store.status === 'active' ? 'suspended' : 'active';
      const updated: Store = { ...store, status: newStatus, updatedAt: new Date().toISOString() };
      storage.saveStore(updated);
      setStores(storage.getStores());
      showToast(newStatus === 'active' ? `تم تفعيل متجر "${store.name}"` : `تم تعليق وتجميد متجر "${store.name}"`);
    }
  };

  const filteredStores = stores.filter(s => {
    return s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.subdomain.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 left-5 z-50 p-4 rounded-xl bg-slate-900 text-white dark:bg-emerald-600 shadow-2xl flex items-center gap-2 text-xs font-bold border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Admin Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white dark:bg-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                لوحة الإدارة المركزية لمنصة «دكاني»
              </h1>
              <span className="text-[11px] text-slate-400">
                مراقبة التجار، خطط الاشتراكات وإيرادات المنصة
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={onGoToLanding}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-colors hidden sm:inline"
            >
              الصفحة الرئيسية
            </button>
          </div>
        </div>
      </header>

      {/* Admin Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8 w-full">
        {/* Platform KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Subscription Revenue */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">إيرادات الاشتراكات الشهرية</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              {formatDZD(monthlySubscriptionRev)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">تجدد شهرياً من التجار</div>
          </div>

          {/* Total Stores */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">إجمالي المتاجر المسجلة</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <StoreIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {totalStores} متجر
            </div>
            <div className="text-[11px] text-emerald-600 mt-1 font-semibold">
              {activeStores} متجر نشط • {suspendedStores} معلق
            </div>
          </div>

          {/* Total Merchants */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">حسابات التجار</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {users.filter(u => u.role === 'merchant').length} تاجر
            </div>
            <div className="text-[11px] text-slate-400 mt-1">عبر مختلف الولايات الجزائرية</div>
          </div>

          {/* Orders Volume */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">حجم مبيعات المتاجر المحققة</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {formatDZD(totalOrdersAmount)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">مبيعات دفع عند الاستلام</div>
          </div>
        </div>

        {/* Merchants & Stores List */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                قائمة المتاجر والتجار
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                إدارة الخطط، تجميد أو تفعيل المتاجر والوصول المباشر للوحات التحكم
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث باسم المتجر أو الرابط..."
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-bold">المتجر والرابط</th>
                  <th className="py-3 px-4 font-bold">التاجر المسجل</th>
                  <th className="py-3 px-4 font-bold">خطة الاشتراك</th>
                  <th className="py-3 px-4 font-bold">المنتجات والطلبات</th>
                  <th className="py-3 px-4 font-bold">حالة المتجر</th>
                  <th className="py-3 px-4 font-bold text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStores.map(store => {
                  const merchant = users.find(u => u.storeId === store.id || u.id === store.ownerId);
                  const storeProds = storage.getProducts(store.id);
                  const storeOrds = storage.getOrders(store.id);
                  const currentPlan = SAAS_PLANS.find(p => p.id === store.planId) || SAAS_PLANS[0];

                  return (
                    <tr key={store.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: store.brandColor || '#059669' }}
                          />
                          <span>{store.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {store.subdomain}.dokani.dz
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {merchant?.name || 'تاجر مسجل'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {merchant?.email || store.phone || '0550XXXXXX'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={store.planId}
                          onChange={e => handleChangePlan(store.id, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                        >
                          {SAAS_PLANS.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.nameAr} ({p.priceDZD === 0 ? 'مجاناً' : formatDZD(p.priceDZD)})
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {storeProds.length} منتج • {storeOrds.length} طلب
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            store.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {store.status === 'active' ? 'نشط' : 'معلق ومجمد'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-left">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleStoreStatus(store.id)}
                            className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors ${
                              store.status === 'active'
                                ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/40'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/60 dark:hover:bg-emerald-950/40'
                            }`}
                            title={store.status === 'active' ? 'تجميد وتعليق المتجر' : 'تفعيل المتجر'}
                          >
                            {store.status === 'active' ? (
                              <PauseCircle className="w-4 h-4" />
                            ) : (
                              <PlayCircle className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => onGoToMerchant(store.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                          >
                            لوحة التحكم
                          </button>

                          <button
                            onClick={() => onGoToStorefront(store.subdomain)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                            title="عرض المتجر العام"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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
      </main>
    </div>
  );
};
