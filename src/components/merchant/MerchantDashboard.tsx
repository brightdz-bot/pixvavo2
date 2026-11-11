import React, { useState } from 'react';
import { useAuth } from '../../services/authContext';
import { storage } from '../../services/storage';
import { SAAS_PLANS } from '../../data/plans';
import { Product, Order, OrderStatus, Store } from '../../types';
import { OverviewTab } from './OverviewTab';
import { ProductsTab } from './ProductsTab';
import { OrdersTab } from './OrdersTab';
import { SettingsTab } from './SettingsTab';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Settings,
  ExternalLink,
  Store as StoreIcon,
  Bell,
  CheckCircle2,
  Menu,
  X,
  LogOut,
  ChevronDown
} from 'lucide-react';

interface Props {
  onGoToStorefront: (subdomain?: string) => void;
  onGoToLanding: () => void;
}

export const MerchantDashboard: React.FC<Props> = ({ onGoToStorefront, onGoToLanding }) => {
  const { currentStore, currentUser, refreshCurrentStore, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'settings'>('overview');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If no store loaded, fallback
  const store = currentStore || storage.getStores()[0];

  // Refresh reactive store data
  const [products, setProducts] = useState<Product[]>(() => storage.getProducts(store.id));
  const [orders, setOrders] = useState<Order[]>(() => storage.getOrders(store.id));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveProduct = (prod: Product) => {
    const isNew = !products.some(p => p.id === prod.id);
    const plan = SAAS_PLANS.find(p => p.id === store.planId);
    if (isNew && plan && products.length >= plan.maxProducts) {
      showToast(`وصلت للحد الأقصى لخطتك (${plan.maxProducts} منتج). رقّ خطتك لإضافة المزيد`);
      return;
    }
    storage.saveProduct(prod);
    setProducts(storage.getProducts(store.id));
    showToast('تم حفظ المنتج وتحديث بيانات المخزون بنجاح');
  };

  const handleDeleteProduct = (prodId: string) => {
    storage.deleteProduct(prodId);
    setProducts(storage.getProducts(store.id));
    showToast('تم حذف المنتج من المتجر');
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus, note?: string) => {
    storage.updateOrderStatus(orderId, newStatus, note);
    const updatedOrders = storage.getOrders(store.id);
    setOrders(updatedOrders);
    if (selectedOrder && selectedOrder.id === orderId) {
      const found = updatedOrders.find(o => o.id === orderId);
      if (found) setSelectedOrder(found);
    }
    const statusLabels: Record<OrderStatus, string> = {
      new: 'جديد',
      confirmed: 'مؤكد',
      shipping: 'قيد التوصيل',
      delivered: 'تم التسليم',
      cancelled: 'ملغي'
    };
    // Cancelling or re-opening an order changes stock, so refresh products too
    setProducts(storage.getProducts(store.id));
    showToast(`تم تحديث حالة الطلب إلى "${statusLabels[newStatus]}"`);
  };

  const handleRestockProduct = (prodId: string, addCount: number) => {
    const prod = storage.getProductById(prodId);
    if (prod) {
      storage.saveProduct({ ...prod, stock: prod.stock + addCount });
      setProducts(storage.getProducts(store.id));
      showToast(`تم تزويد المخزون بـ +${addCount} قطع بنجاح`);
    }
  };

  const handleSaveSettings = (updated: Store) => {
    storage.saveStore(updated);
    refreshCurrentStore();
    showToast('تم حفظ إعدادات وهوية المتجر بنجاح');
  };

  const navItems = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
    { id: 'products', label: 'المنتجات والمخزون', icon: Package, badge: products.length },
    { id: 'orders', label: 'الطلبات والشحن', icon: ShoppingBag, badge: orders.filter(o => o.status === 'new').length },
    { id: 'settings', label: 'إعدادات وهوية المتجر', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-colors">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 p-4 rounded-xl bg-slate-900 text-white dark:bg-emerald-600 shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col justify-between w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-5 shrink-0">
        <div className="space-y-6">
          {/* Store Brand Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-md shrink-0"
              style={{ backgroundColor: store.brandColor || '#059669' }}
            >
              {store.name.slice(0, 1)}
            </div>
            <div className="truncate">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {store.name}
              </h2>
              <div className="text-[11px] text-slate-400 font-mono truncate">
                {store.subdomain}.dokani.dz
              </div>
            </div>
          </div>

          {/* Quick View Public Store Link */}
          <button
            onClick={() => onGoToStorefront(store.subdomain)}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-between border border-slate-200 dark:border-slate-700/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>معاينة متجر الزبائن</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Navigation Links */}
          <nav className="space-y-1.5 pt-2">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
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

        {/* Sidebar Footer with Merchant profile & Logout */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                {(currentUser?.name || 'تاجر')[0]}
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {currentUser?.name || 'سفيان بلحاج'}
                </div>
                <div className="text-[10px] text-slate-400">تاجر معتمد</div>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <button
            onClick={onGoToLanding}
            className="w-full py-1.5 text-center text-xs text-slate-400 hover:text-rose-500 font-semibold transition-colors flex items-center justify-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج للمنصة</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-6">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {navItems.find(i => i.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => onGoToStorefront(store.subdomain)}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"
            >
              <StoreIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">معاينة واجهة المتجر</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
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
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/20">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab Body */}
        <div className="p-4 sm:p-8 flex-1">
          {activeTab === 'overview' && (
            <OverviewTab
              store={store}
              orders={orders}
              products={products}
              onSelectOrder={ord => {
                setSelectedOrder(ord);
                setActiveTab('orders');
              }}
              onGoToProducts={() => setActiveTab('products')}
              onRestockProduct={handleRestockProduct}
            />
          )}

          {activeTab === 'products' && (
            <ProductsTab
              storeId={store.id}
              products={products}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              onUpdateStatus={handleUpdateOrderStatus}
              selectedOrder={selectedOrder}
              onSelectOrder={setSelectedOrder}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              store={store}
              onSaveSettings={handleSaveSettings}
            />
          )}
        </div>
      </main>
    </div>
  );
};
