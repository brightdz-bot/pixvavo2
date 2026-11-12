import React, { useState, useEffect } from 'react';
import { Store, Product, Order, OrderItem, OrderStatus } from '../../types';
import { storage } from '../../services/storage';
import { ALGERIA_WILAYAS, formatDZD } from '../../data/wilayas';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  ShoppingBag,
  Search,
  Truck,
  CheckCircle2,
  X,
  Phone,
  MapPin,
  ShieldCheck,
  AlertCircle,
  Package,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  ArrowLeft
} from 'lucide-react';

interface Props {
  subdomain: string;
  onGoToMerchant: () => void;
  onGoToLanding: () => void;
}

export const PublicStorefront: React.FC<Props> = ({ subdomain, onGoToMerchant, onGoToLanding }) => {
  const [store, setStore] = useState<Store>(() => storage.getLocalStores().find(s => s.subdomain.toLowerCase() === subdomain.toLowerCase()) || storage.getLocalStores()[0]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingStore, setIsLoadingStore] = useState(true);

  // Cart State
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('الكل');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Variant choices in the product modal, keyed by variant name (e.g. { 'المقاس': 'M', 'اللون': 'أسود' })
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Order Tracking
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [trackingSearched, setTrackingSearched] = useState(false);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);

  // Checkout Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedWilayaId, setSelectedWilayaId] = useState('16'); // Default Alger
  const [address, setAddress] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderCompleted, setOrderCompleted] = useState<any | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Fetch store and products
  useEffect(() => {
    let mounted = true;
    async function fetchStoreAndProducts() {
      setIsLoadingStore(true);
      try {
        const foundStore = await storage.getStoreBySubdomain(subdomain);
        if (foundStore && mounted) {
          setStore(foundStore);
          const prods = await storage.getProducts(foundStore.id);
          if (mounted) setProducts(prods.filter(p => p.isActive));
        } else if (mounted) {
          const fallback = (await storage.getStores())[0];
          if (fallback) {
            setStore(fallback);
            const prods = await storage.getProducts(fallback.id);
            if (mounted) setProducts(prods.filter(p => p.isActive));
          }
        }
      } catch (err) {
        console.error('Error fetching storefront data:', err);
      } finally {
        if (mounted) setIsLoadingStore(false);
      }
    }

    fetchStoreAndProducts();

    return () => {
      mounted = false;
    };
  }, [subdomain]);

  // Categories
  const categories = ['الكل', ...Array.from(new Set(products.map(p => p.category)))];

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCat === 'الكل' || p.category === selectedCat;
    return matchesSearch && matchesCat;
  });

  // Calculate totals
  const cartSubtotal = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const selectedWilaya = ALGERIA_WILAYAS.find(w => w.id === selectedWilayaId) || ALGERIA_WILAYAS[0];

  // Calculate shipping fee considering store threshold and custom wilaya fees
  let shippingFee = selectedWilaya.standardDeliveryFee;
  if (store.customWilayaFees && store.customWilayaFees[selectedWilaya.id] !== undefined) {
    shippingFee = store.customWilayaFees[selectedWilaya.id];
  }
  if (store.freeShippingThreshold && cartSubtotal >= store.freeShippingThreshold) {
    shippingFee = 0;
  }
  const cartGrandTotal = cartSubtotal + shippingFee;

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  // Units of a product already in the cart (across all its variants)
  const unitsInCart = (productId: string) =>
    cart.filter(it => it.productId === productId).reduce((sum, it) => sum + it.quantity, 0);

  const openProduct = (product: Product) => {
    setSelectedVariants({});
    setSelectedProduct(product);
  };

  const handleAddToCart = (product: Product, quantity = 1, selections: Record<string, string> = {}) => {
    const variants = product.variants || [];
    const missing = variants.find(v => !selections[v.name]);
    if (missing) {
      showNotice(`يرجى اختيار ${missing.name} أولاً`);
      return;
    }

    // Check against current products state
    const fresh = products.find(p => p.id === product.id) || product;
    if (fresh.stock <= 0) {
      showNotice('نفدت كمية هذا المنتج');
      return;
    }
    if (unitsInCart(product.id) + quantity > fresh.stock) {
      showNotice(`المتوفر في المخزن ${fresh.stock} قطعة فقط`);
      return;
    }

    const variantText = variants.map(v => `${v.name}: ${selections[v.name]}`).join(' | ');

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.productId === product.id && (item.variantText || '') === variantText);
      if (existingIdx >= 0) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, quantity: item.quantity + quantity } : item));
      }
      return [...prev, {
        productId: product.id,
        title: product.title,
        price: product.price,
        quantity,
        variantText,
        imageUrl: product.imageUrl
      }];
    });

    setIsCartOpen(true);
    setSelectedProduct(null);
  };

  const handleUpdateQuantity = (idx: number, delta: number) => {
    const item = cart[idx];
    if (!item) return;
    if (delta > 0) {
      const fresh = products.find(p => p.id === item.productId);
      if (fresh && unitsInCart(item.productId) + delta > fresh.stock) {
        showNotice(`المتوفر في المخزن ${fresh.stock} قطعة فقط`);
        return;
      }
    }
    setCart(prev =>
      prev
        .map((it, i) => (i === idx ? { ...it, quantity: it.quantity + delta } : it))
        .filter(it => it.quantity > 0)
    );
  };

  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackingSearched(true);
    if (!trackingNumber.trim()) {
      setTrackedOrder(null);
      return;
    }
    const cleanNum = trackingNumber.replace(/^#/, '').trim();
    setIsTrackingLoading(true);
    try {
      const found = await storage.trackOrder(cleanNum);
      setTrackedOrder(found || null);
    } catch (err) {
      console.error('Tracking error:', err);
      setTrackedOrder(null);
    } finally {
      setIsTrackingLoading(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('السلة فارغة، يرجى إضافة منتجات أولاً');
      return;
    }

    if (!customerName.trim() || customerName.trim().length < 2) {
      setCheckoutError('يرجى كتابة الاسم واللقب بشكل كامل');
      return;
    }

    const cleanPhone = customerPhone.replace(/\s+/g, '');
    const phoneRegex = /^(05|06|07)[0-9]{8}$/;
    if (!phoneRegex.test(cleanPhone)) {
      setCheckoutError('يرجى كتابة رقم هاتف جزائري صحيح يبدأ بـ 05 أو 06 أو 07 ويتكون من 10 أرقام');
      return;
    }

    if (!address.trim()) {
      setCheckoutError('يرجى تحديد البلدية والشارع لضمان وصول المندوب إليك بدقة');
      return;
    }

    setIsSubmittingOrder(true);

    try {
      const itemsPayload = cart.map(it => ({
        productId: it.productId,
        quantity: it.quantity,
        variantText: it.variantText
      }));

      const res = await storage.placeOrder({
        storeId: store.id,
        customerName: customerName.trim(),
        customerPhone: cleanPhone,
        wilayaId: selectedWilaya.id,
        wilayaName: selectedWilaya.nameAr,
        address: address.trim(),
        items: itemsPayload
      });

      setIsSubmittingOrder(false);

      if (res.success && res.order) {
        setOrderCompleted(res.order);
        setCart([]);
        setIsCheckoutOpen(false);
        setIsCartOpen(false);

        // Refresh products stock in storefront
        const freshProds = await storage.getProducts(store.id);
        setProducts(freshProds.filter(p => p.isActive));
      } else {
        setCheckoutError(res.error || 'تعذر تسجيل الطلب، يرجى المحاولة مجدداً');
      }
    } catch (err: any) {
      setIsSubmittingOrder(false);
      setCheckoutError(err.message || 'حدث خطأ غير متوقع أثناء إرسال الطلب');
    }
  };

  const brandColor = store.brandColor || '#059669';

  if (store.status === 'suspended') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-black text-slate-900 dark:text-white">هذا المتجر غير متاح حالياً</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            تم تعليق متجر «{store.name}» مؤقتاً من إدارة المنصة. يرجى المحاولة لاحقاً.
          </p>
          <button
            onClick={onGoToLanding}
            className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold"
          >
            العودة إلى المنصة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-2xl border border-slate-700"
        >
          {notice}
        </div>
      )}

      {/* Free Shipping Alert Bar */}
      {store.freeShippingThreshold > 0 && (
        <div
          className="text-white text-xs font-bold py-2 px-4 text-center flex items-center justify-center gap-2 shadow-sm"
          style={{ backgroundColor: brandColor }}
        >
          <Truck className="w-4 h-4 animate-pulse" />
          <span>
            توصيل مجاني لجميع الولايات الجزائرية عند طلب منتجات بقيمة {formatDZD(store.freeShippingThreshold)} أو أكثر!
          </span>
        </div>
      )}

      {/* Store Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Store Name */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md"
              style={{ backgroundColor: brandColor }}
            >
              {store.name.slice(0, 1)}
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                {store.name}
              </h1>
              <span className="text-[11px] text-slate-400 font-mono">
                {store.subdomain}.dokani.dz
              </span>
            </div>
          </div>

          {/* Cart & Theme Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />

            {/* Cart Trigger Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl text-white shadow-md transition-transform hover:scale-105 flex items-center gap-2"
              style={{ backgroundColor: brandColor }}
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="hidden sm:inline-block text-xs font-bold">السلة</span>
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -left-1.5 bg-rose-500 text-white text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {cart.reduce((s, it) => s + it.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8 w-full">
        {/* Hero Banner for Store */}
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-10 relative overflow-hidden shadow-xl border border-slate-800">
          <div className="max-w-2xl space-y-3 relative z-10 text-right">
            <span className="px-3 py-1 rounded-full bg-white/10 text-emerald-400 text-xs font-bold inline-block">
              الدفع عند الاستلام (Cash On Delivery)
            </span>
            <h2 className="text-2xl sm:text-4xl font-black leading-tight">
              {store.name}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {store.description || 'تسوق بكل ثقة مع ضمان جودة المنتجات والتوصيل السريع إلى باب منزلك عبر 58 ولاية.'}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-4 border-t border-slate-700/60 relative z-10">
            <div className="flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-400" />
              <span>توصيل سريع مع ياليدين وزيروكس</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>فحص الطرد قبل دفع المبلغ</span>
            </div>
          </div>
        </div>

        {/* Order Tracking Section */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                تتبع حالة طلبك برقم الشحنة
              </h3>
              <p className="text-[11px] text-slate-400">
                أدخل رقم طلبك (مثل DZ-9821) لمعرفة موقع الطرد
              </p>
            </div>
          </div>

          <form onSubmit={handleTrackOrder} className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="مثال: DZ-9821"
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500 w-full sm:w-48"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-white text-xs font-bold shrink-0 transition-opacity"
              style={{ backgroundColor: brandColor }}
            >
              تتبع
            </button>
          </form>
        </div>

        {/* Tracked Order Result Box */}
        {trackingSearched && (
          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs">
            {trackedOrder ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 dark:border-emerald-800 pb-2">
                  <div className="font-bold text-slate-900 dark:text-white font-mono">
                    طلب #{trackedOrder.orderNumber} ({trackedOrder.customerFirstName || trackedOrder.customerName?.split(' ')[0] || 'الزبون'} - {trackedOrder.wilayaName})
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                    الحالة الحالية: {trackedOrder.status === 'new' ? 'جديد' : trackedOrder.status === 'confirmed' ? 'مؤكد' : trackedOrder.status === 'shipping' ? 'قيد التوصيل' : trackedOrder.status === 'delivered' ? 'تم التسليم' : 'ملغي'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block">سجل الحركة:</span>
                  {trackedOrder.statusHistory?.map((h: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="font-mono text-[10px]">{new Date(h.timestamp).toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span>— {h.note || h.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-2 text-slate-500 dark:text-slate-400">
                لم يتم العثور على طلب بهذا الرقم في هذا المتجر. يرجى التأكد من الرقم والمحاولة مجدداً.
              </div>
            )}
          </div>
        )}

        {/* Product Search & Categories Filter */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="w-full pr-10 pl-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCat === cat
                    ? 'text-white font-bold shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                }`}
                style={selectedCat === cat ? { backgroundColor: brandColor } : {}}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="p-16 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              لا توجد منتجات مطابقة في المتجر
            </h3>
            <p className="text-xs text-slate-400">
              يرجى تغيير كلمة البحث أو اختيار تصنيف آخر
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map(p => {
              const isOutOfStock = p.stock <= 0;
              return (
                <div
                  key={p.id}
                  className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between group hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300"
                >
                  <div>
                    {/* Image */}
                    <div
                      className="relative h-56 bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer"
                      onClick={() => openProduct(p)}
                    >
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 right-3">
                        <span className="px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold">
                          {p.category}
                        </span>
                      </div>
                      {p.comparePrice && p.comparePrice > p.price && (
                        <div className="absolute top-3 left-3 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                          تخفيض -{Math.round(((p.comparePrice - p.price) / p.comparePrice) * 100)}%
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-2">
                      <h3
                        onClick={() => openProduct(p)}
                        className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 cursor-pointer hover:underline"
                      >
                        {p.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {p.description}
                      </p>

                      {/* Pricing */}
                      <div className="pt-2 flex items-baseline gap-2">
                        <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                          {formatDZD(p.price)}
                        </span>
                        {p.comparePrice && p.comparePrice > p.price && (
                          <span className="text-xs text-slate-400 line-through font-mono">
                            {formatDZD(p.comparePrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 pt-0">
                    <button
                      disabled={isOutOfStock}
                      onClick={() => {
                        if (p.variants && p.variants.length > 0) {
                          openProduct(p);
                        } else {
                          handleAddToCart(p);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ backgroundColor: brandColor }}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>{isOutOfStock ? 'نفدت الكمية' : 'أضف للسلة'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-start bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full p-6 flex flex-col justify-between shadow-2xl overflow-y-auto text-right">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" style={{ color: brandColor }} />
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    سلة المشتريات ({cart.reduce((sum, it) => sum + it.quantity, 0)})
                  </h3>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items */}
              {cart.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <ShoppingBag className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-xs text-slate-400">سلتك فارغة حالياً</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 py-2">
                  {cart.map((item, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        )}
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white line-clamp-1">
                            {item.title}
                          </h4>
                          {item.variantText && (
                            <span className="text-[11px] text-slate-400 block">{item.variantText}</span>
                          )}
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {formatDZD(item.price)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateQuantity(idx, -1)}
                          className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdateQuantity(idx, 1)}
                          className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex justify-between text-xs text-slate-500 font-mono">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatDZD(cartSubtotal)}</span>
                </div>

                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full py-3 rounded-xl text-white font-bold text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2"
                  style={{ backgroundColor: brandColor }}
                >
                  <span>متابعة الطلب والدفع عند الاستلام</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsCheckoutOpen(false)}
              className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              تأكيد الطلب — الدفع عند الاستلام (COD)
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              لن تدفع أي شيء الآن. سيصلك الطرد إلى عنوانك وتدفع نقداً بعد المعاينة.
            </p>

            {checkoutError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            <form onSubmit={handlePlaceOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الاسم الكامل للزبون <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="مثال: يوسف بلعيد"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رقم الهاتف للتأكيد والتوصيل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="05 / 06 / 07 XX XX XX XX"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الولاية <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedWilayaId}
                  onChange={e => setSelectedWilayaId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {ALGERIA_WILAYAS.map(w => {
                    const fee = store.customWilayaFees?.[w.id] !== undefined ? store.customWilayaFees[w.id] : w.standardDeliveryFee;
                    return (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.nameAr} ({w.nameFr}) — توصيل: {formatDZD(fee)} ({w.deliveryDays})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  العنوان بالتفصيل والبلدية <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="مثال: بلدية الأبيار، حي النصر، عمارة 4 شقة 12"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Order Calculation Preview */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs font-mono space-y-1.5">
                <div className="flex justify-between text-slate-500">
                  <span>سعر السلع ({cart.reduce((sum, it) => sum + it.quantity, 0)}):</span>
                  <span>{formatDZD(cartSubtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>رسوم التوصيل لـ {selectedWilaya.nameAr}:</span>
                  <span className={shippingFee === 0 ? 'text-emerald-600 font-bold' : ''}>
                    {shippingFee === 0 ? 'مجاناً' : formatDZD(shippingFee)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>المبلغ المطلوب تسليمه للمندوب:</span>
                  <span style={{ color: brandColor }}>{formatDZD(cartGrandTotal)}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrder}
                  className="px-6 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-lg flex items-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: brandColor }}
                >
                  {isSubmittingOrder ? 'جارٍ تسجيل الطلب...' : 'تأكيد الطلب الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Completed Success Modal */}
      {orderCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-4 text-right">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                تم تسجيل طلبك بنجاح!
              </h3>
              <p className="text-xs text-slate-500">
                سيتصل بك فريق المتجر لتأكيد موعد التسليم
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">رقم الطلب الخاص بك:</span>
                <strong className="font-mono font-bold text-emerald-600 text-sm">
                  #{orderCompleted.orderNumber}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الزبون:</span>
                <strong>{orderCompleted.customerName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الولاية:</span>
                <strong>{orderCompleted.wilayaName}</strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold">
                <span>المبلغ للدفع عند الاستلام:</span>
                <span className="font-mono text-emerald-600">{formatDZD(orderCompleted.total)}</span>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => setOrderCompleted(null)}
                className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md"
                style={{ backgroundColor: brandColor }}
              >
                العودة للتسوق في المتجر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Quick View Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
              <div className="rounded-2xl overflow-hidden h-72 bg-slate-100 dark:bg-slate-800">
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-xs text-emerald-600 font-bold">{selectedProduct.category}</span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {selectedProduct.title}
                  </h3>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                    {formatDZD(selectedProduct.price)}
                  </span>
                  {selectedProduct.comparePrice && (
                    <span className="text-xs line-through text-slate-400 font-mono">
                      {formatDZD(selectedProduct.comparePrice)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedProduct.description}
                </p>

                {/* Variants Picker if available */}
                {selectedProduct.variants?.map(v => (
                  <div key={v.id} className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      اختر {v.name}:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {v.options.map(opt => {
                        const isSelected = selectedVariants[v.name] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSelectedVariants(prev => ({ ...prev, [v.name]: opt }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 font-bold'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => handleAddToCart(selectedProduct, 1, selectedVariants)}
                  disabled={selectedProduct.stock <= 0}
                  className="w-full py-3 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                  style={{ backgroundColor: brandColor }}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{selectedProduct.stock <= 0 ? 'نفدت الكمية' : 'أضف إلى السلة والدفع عند الاستلام'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto py-8 px-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 space-y-2">
        <p>متجر {store.name} — يعمل بواسطة منصة دكاني للتجارة الإلكترونية في الجزائر.</p>
        <p>جميع الحقوق محفوظة © 2026</p>
      </footer>
    </div>
  );
};
