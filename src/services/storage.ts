import { Store, Product, Order, User, OrderStatus } from '../types';

const STORES_KEY = 'dokani_stores';
const PRODUCTS_KEY = 'dokani_products';
const ORDERS_KEY = 'dokani_orders';
const USERS_KEY = 'dokani_users';

// Initial Mock Seed Data
const INITIAL_STORES: Store[] = [
  {
    id: 'store_el_nokhba',
    ownerId: 'usr_merchant_1',
    name: 'متجر النخبة للموضة الجزائرية',
    subdomain: 'el-nokhba',
    description: 'أرقى الملابس التقليدية والعصرية للرجال والنساء في الجزائر مع توصيل سريع.',
    logoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=400&q=80',
    brandColor: '#059669', // Emerald
    freeShippingThreshold: 10000,
    planId: 'plan_pro',
    status: 'active',
    phone: '0550123456',
    customWilayaFees: {
      '16': 350,
      '09': 400,
      '31': 550
    },
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'store_techno_casa',
    ownerId: 'usr_merchant_2',
    name: 'تكنو كازا للإلكترونيات',
    subdomain: 'technocasa',
    description: 'الهواتف الذكية والإكسسوارات الأصلية مع ضمان محلي في الجزائر.',
    logoUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=400&q=80',
    brandColor: '#2563eb', // Blue
    freeShippingThreshold: 15000,
    planId: 'plan_starter',
    status: 'active',
    phone: '0661987654',
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod_1',
    storeId: 'store_el_nokhba',
    title: 'قفطان جزائري عصري مطرز بالفتلة الحرة',
    description: 'قفطان فاخر مصنوع يدوياً من حرير الساتان الملكي مع تطريز جزائري أصيل بالفتلة والمجبود. مناسب للأعراس والمناسبات الكبرى.',
    price: 18500,
    comparePrice: 22000,
    costPrice: 11000,
    category: 'ملابس نسائية',
    stock: 14,
    sku: 'KAFT-ALG-01',
    imageUrl: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80',
    variants: [
      { id: 'v1', name: 'المقاس', options: ['M (38-40)', 'L (42-44)', 'XL (46-48)'] },
      { id: 'v2', name: 'اللون', options: ['أخضر زمردي', 'عنابي ملكي', 'أزرق ليلي'] }
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod_2',
    storeId: 'store_el_nokhba',
    title: 'برنوس رجالي صوف أصلي تقرتي ووبر الإبل',
    description: 'برنوس شتوي تقليدي دافئ مصنوع من أجود أنواع صوف الوبر الطبيعي، خياطة يدوية متقنة تمنحك هيبة وأصالة.',
    price: 14800,
    comparePrice: 17500,
    costPrice: 8500,
    category: 'ملابس رجالية',
    stock: 8,
    sku: 'BARN-WOOL-02',
    imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=800&q=80',
    variants: [
      { id: 'v1', name: 'اللون', options: ['بني وبر', 'أبيض سكري', 'رمادي غامق'] }
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod_3',
    storeId: 'store_el_nokhba',
    title: 'حذاء جلدي كلاسيكي مريح صناعة محلية فاخرة',
    description: 'حذاء رجالي مصنوع من الجلد الطبيعي 100% بنعل طبي مريح للمشي الطويل والاستخدام اليومي أو المناسبات الرسمية.',
    price: 6900,
    comparePrice: 8500,
    costPrice: 4200,
    category: 'أحذية',
    stock: 3, // Low stock for dashboard alert demonstration
    sku: 'SHOE-LEA-03',
    imageUrl: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=800&q=80',
    variants: [
      { id: 'v1', name: 'المقاس', options: ['40', '41', '42', '43', '44'] },
      { id: 'v2', name: 'اللون', options: ['أسود كلاسيك', 'بني كراميل'] }
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod_4',
    storeId: 'store_el_nokhba',
    title: 'ساعة يد كوارتز فاخرة مقاومة للماء مع حزام ستانلس ستيل',
    description: 'ساعة أنيقة عالية الدقة بتصميم عصري جذاب وعلبة هدية فخمة، مقاومة لرذاذ الماء وضمان لمدة 12 شهر.',
    price: 4500,
    comparePrice: 5900,
    costPrice: 2400,
    category: 'إكسسوارات',
    stock: 22,
    sku: 'WATCH-QZ-04',
    imageUrl: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod_5',
    storeId: 'store_el_nokhba',
    title: 'حقيبة يد نسائية جلدية أنيقة بتصميم إيطالي',
    description: 'حقيبة يد عملية ومتينة مزودة بحزام كتف قابل للتعديل ومقصورات متعددة لتنظيم الأغراض الشخصية.',
    price: 5200,
    comparePrice: 6500,
    costPrice: 3100,
    category: 'حقائب',
    stock: 2, // Low stock
    sku: 'BAG-LEA-05',
    imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod_6',
    storeId: 'store_el_nokhba',
    title: 'عطر دهن العود والمسك الأبيض الملكي (100 مل)',
    description: 'رائحة شرقية ساحرة تدوم لأكثر من 48 ساعة، مكونات نقية مستخلصة بعناية تناسب الرجال والنساء.',
    price: 7800,
    comparePrice: 9500,
    costPrice: 4000,
    category: 'عطور',
    stock: 19,
    sku: 'PERF-OUD-06',
    imageUrl: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord_101',
    orderNumber: 'DZ-9821',
    storeId: 'store_el_nokhba',
    customerName: 'أمين بلقاسم',
    customerPhone: '0550123456',
    wilayaId: '16',
    wilayaName: 'الجزائر العاصمة',
    address: 'حي 11 ديسمبر، دالي إبراهيم، عمارة ب رقم 12',
    items: [
      {
        productId: 'prod_2',
        title: 'برنوس رجالي صوف أصلي تقرتي ووبر الإبل',
        price: 14800,
        quantity: 1,
        variantText: 'اللون: بني وبر',
        imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=300&q=80'
      }
    ],
    subtotal: 14800,
    shippingFee: 0, // Free shipping since > 10,000 DZD
    total: 14800,
    status: 'shipping',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), note: 'تم تسجيل الطلب عبر الموقع' },
      { status: 'confirmed', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'تم تأكيد الطلب هاتفياً مع الزبون' },
      { status: 'shipping', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), note: 'تم تسليم الطرد لشركة ياليدين اكسبريس (رقم التتبع: YAL-942817)' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'ord_102',
    orderNumber: 'DZ-9822',
    storeId: 'store_el_nokhba',
    customerName: 'فاطمة الزهراء بن علي',
    customerPhone: '0661234567',
    wilayaId: '31',
    wilayaName: 'وهران',
    address: 'شارع العربي بن مهيدي، حي ميرامار',
    items: [
      {
        productId: 'prod_1',
        title: 'قفطان جزائري عصري مطرز بالفتلة الحرة',
        price: 18500,
        quantity: 1,
        variantText: 'المقاس: M (38-40) | اللون: أخضر زمردي',
        imageUrl: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=300&q=80'
      }
    ],
    subtotal: 18500,
    shippingFee: 0,
    total: 18500,
    status: 'delivered',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 6 * 86400000).toISOString() },
      { status: 'confirmed', timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
      { status: 'shipping', timestamp: new Date(Date.now() - 4 * 86400000).toISOString() },
      { status: 'delivered', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), note: 'تم تحصيل المبلغ 18,500 د.ج نقداً من الزبونة' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'ord_103',
    orderNumber: 'DZ-9823',
    storeId: 'store_el_nokhba',
    customerName: 'كريم مزياني',
    customerPhone: '0770345678',
    wilayaId: '19',
    wilayaName: 'سطيف',
    address: 'حي بيلير قرب مسجد العتيق',
    items: [
      {
        productId: 'prod_3',
        title: 'حذاء جلدي كلاسيكي مريح صناعة محلية فاخرة',
        price: 6900,
        quantity: 1,
        variantText: 'المقاس: 42 | اللون: بني كراميل',
        imageUrl: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=300&q=80'
      }
    ],
    subtotal: 6900,
    shippingFee: 600,
    total: 7500,
    status: 'new',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 4 * 3600000).toISOString(), note: 'طلب جديد بانتظار الاتصال الهاتفي للتأكيد' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 3600000).toISOString()
  },
  {
    id: 'ord_104',
    orderNumber: 'DZ-9824',
    storeId: 'store_el_nokhba',
    customerName: 'عبد النور حداد',
    customerPhone: '0555987654',
    wilayaId: '25',
    wilayaName: 'قسنطينة',
    address: 'سيدي مبروك الأسفل، مقابل الصيدلية المركزية',
    items: [
      {
        productId: 'prod_4',
        title: 'ساعة يد كوارتز فاخرة مقاومة للماء مع حزام ستانلس ستيل',
        price: 4500,
        quantity: 1,
        imageUrl: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=300&q=80'
      },
      {
        productId: 'prod_6',
        title: 'عطر دهن العود والمسك الأبيض الملكي (100 مل)',
        price: 7800,
        quantity: 1,
        imageUrl: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=300&q=80'
      }
    ],
    subtotal: 12300,
    shippingFee: 0,
    total: 12300,
    status: 'confirmed',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 14 * 3600000).toISOString() },
      { status: 'confirmed', timestamp: new Date(Date.now() - 10 * 3600000).toISOString(), note: 'تم الاتصال بالزبون وتأكيد العنوان وجاهزية الاستلام' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 3600000).toISOString()
  },
  {
    id: 'ord_105',
    orderNumber: 'DZ-9825',
    storeId: 'store_el_nokhba',
    customerName: 'حسام الدين بوزيد',
    customerPhone: '0669112233',
    wilayaId: '09',
    wilayaName: 'البليدة',
    address: 'وسط المدينة، حي باب الرحبة',
    items: [
      {
        productId: 'prod_5',
        title: 'حقيبة يد نسائية جلدية أنيقة بتصميم إيطالي',
        price: 5200,
        quantity: 1,
        imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=300&q=80'
      }
    ],
    subtotal: 5200,
    shippingFee: 400,
    total: 5600,
    status: 'cancelled',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
      { status: 'cancelled', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), note: 'الزبون غير رأيه بعد الاتصال' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 86400000).toISOString()
  }
];

const INITIAL_USERS: User[] = [
  {
    id: 'usr_merchant_1',
    name: 'سفيان بلحاج',
    email: 'merchant@dokani.dz',
    phone: '0550123456',
    role: 'merchant',
    storeId: 'store_el_nokhba'
  },
  {
    id: 'usr_admin',
    name: 'مسؤول المنصة الجزائري',
    email: 'admin@dokani.dz',
    phone: '021000000',
    role: 'admin'
  }
];

class StorageService {
  private init(): void {
    if (!localStorage.getItem(STORES_KEY)) {
      localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
    }
    if (!localStorage.getItem(PRODUCTS_KEY)) {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
    }
    if (!localStorage.getItem(ORDERS_KEY)) {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(INITIAL_ORDERS));
    }
    if (!localStorage.getItem(USERS_KEY)) {
      localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
    }
  }

  constructor() {
    this.init();
  }

  // --- STORES ---
  getStores(): Store[] {
    try {
      const data = localStorage.getItem(STORES_KEY);
      return data ? JSON.parse(data) : INITIAL_STORES;
    } catch {
      return INITIAL_STORES;
    }
  }

  getStoreById(id: string): Store | undefined {
    return this.getStores().find(s => s.id === id);
  }

  getStoreBySubdomain(subdomain: string): Store | undefined {
    return this.getStores().find(s => s.subdomain.toLowerCase() === subdomain.toLowerCase());
  }

  saveStore(store: Store): void {
    const stores = this.getStores();
    const idx = stores.findIndex(s => s.id === store.id);
    if (idx >= 0) {
      stores[idx] = { ...store, updatedAt: new Date().toISOString() };
    } else {
      stores.push(store);
    }
    localStorage.setItem(STORES_KEY, JSON.stringify(stores));
  }

  // --- PRODUCTS (multi-tenant isolated by storeId) ---
  getProducts(storeId?: string): Product[] {
    try {
      const data = localStorage.getItem(PRODUCTS_KEY);
      const all: Product[] = data ? JSON.parse(data) : INITIAL_PRODUCTS;
      if (storeId) {
        return all.filter(p => p.storeId === storeId);
      }
      return all;
    } catch {
      return INITIAL_PRODUCTS;
    }
  }

  getProductById(id: string): Product | undefined {
    return this.getProducts().find(p => p.id === id);
  }

  saveProduct(product: Product): void {
    const all = this.getProducts();
    const idx = all.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      all[idx] = { ...product, updatedAt: new Date().toISOString() };
    } else {
      all.unshift(product);
    }
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
  }

  deleteProduct(id: string): void {
    const all = this.getProducts().filter(p => p.id !== id);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
  }

  // --- ORDERS (multi-tenant isolated by storeId) ---
  getOrders(storeId?: string): Order[] {
    try {
      const data = localStorage.getItem(ORDERS_KEY);
      const all: Order[] = data ? JSON.parse(data) : INITIAL_ORDERS;
      if (storeId) {
        return all.filter(o => o.storeId === storeId);
      }
      return all;
    } catch {
      return INITIAL_ORDERS;
    }
  }

  getOrderById(id: string): Order | undefined {
    return this.getOrders().find(o => o.id === id);
  }

  getOrderByNumber(orderNumber: string, storeId?: string): Order | undefined {
    const all = this.getOrders(storeId);
    return all.find(o => o.orderNumber.toUpperCase() === orderNumber.toUpperCase().trim());
  }

  saveOrder(order: Order): void {
    const all = this.getOrders();
    const idx = all.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      all[idx] = { ...order, updatedAt: new Date().toISOString() };
    } else {
      all.unshift(order);
    }
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
  }

  updateOrderStatus(orderId: string, newStatus: OrderStatus, note?: string): Order | undefined {
    const order = this.getOrderById(orderId);
    if (!order) return undefined;

    const newEntry = {
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: note || `تغيير الحالة إلى ${newStatus}`
    };

    const updated: Order = {
      ...order,
      status: newStatus,
      statusHistory: [...order.statusHistory, newEntry],
      updatedAt: new Date().toISOString()
    };

    this.saveOrder(updated);
    return updated;
  }

  // --- USERS ---
  getUsers(): User[] {
    try {
      const data = localStorage.getItem(USERS_KEY);
      return data ? JSON.parse(data) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  }

  saveUser(user: User): void {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // Reset to initial demo data
  resetDemoData(): void {
    localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
    localStorage.setItem(ORDERS_KEY, JSON.stringify(INITIAL_ORDERS));
    localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
  }
}

export const storage = new StorageService();
