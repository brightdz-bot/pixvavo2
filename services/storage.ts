import { Store, Product, Order, User, OrderStatus } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export function isUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

const STORES_KEY = 'dokani_stores';
const PRODUCTS_KEY = 'dokani_products';
const ORDERS_KEY = 'dokani_orders';
const USERS_KEY = 'dokani_users';

// Initial Mock Seed Data for Local Fallback
const INITIAL_STORES: Store[] = [
  {
    id: 'store_el_nokhba',
    ownerId: 'usr_merchant_1',
    name: 'متجر النخبة للموضة الجزائرية',
    subdomain: 'el-nokhba',
    description: 'أرقى الملابس التقليدية والعصرية للرجال والنساء في الجزائر مع توصيل سريع.',
    logoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=400&q=80',
    brandColor: '#059669',
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
    brandColor: '#2563eb',
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
    stock: 3,
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
    stock: 2,
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
    orderNumber: 'DZ-9821A4B2',
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
    shippingFee: 0,
    total: 14800,
    status: 'shipping',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), note: 'تم تسجيل الطلب عبر المتجر والدفع عند الاستلام' },
      { status: 'confirmed', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'تم تأكيد الطلب هاتفياً مع الزبون' },
      { status: 'shipping', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), note: 'تم تسليم الطرد لشركة ياليدين اكسبريس' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'ord_102',
    orderNumber: 'DZ-7140B8F9',
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
      { status: 'new', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), note: 'تم تسجيل الطلب' },
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
    orderNumber: 'DZ-3392E1C4',
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

// Helper to map DB store row to Store interface
function mapDbStore(row: any): Store {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    subdomain: row.subdomain,
    description: row.description || '',
    logoUrl: row.logo_url,
    brandColor: row.brand_color || '#059669',
    freeShippingThreshold: Number(row.free_shipping_threshold || 10000),
    planId: row.plan_id || 'plan_trial',
    status: row.status || 'active',
    phone: row.phone || '',
    customWilayaFees: row.custom_wilaya_fees || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Helper to map DB product row to Product interface
function mapDbProduct(row: any, costPrice?: number): Product {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    description: row.description || '',
    price: Number(row.price),
    comparePrice: row.compare_price ? Number(row.compare_price) : undefined,
    costPrice: costPrice !== undefined ? Number(costPrice) : undefined,
    category: row.category || 'عام',
    stock: Number(row.stock || 0),
    sku: row.sku || '',
    imageUrl: row.image_url || '',
    additionalImages: row.additional_images || [],
    variants: row.variants || [],
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Helper to map DB order row to Order interface
function mapDbOrder(row: any): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    storeId: row.store_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    wilayaId: row.wilaya_id,
    wilayaName: row.wilaya_name,
    address: row.address,
    items: row.items || [],
    subtotal: Number(row.subtotal),
    shippingFee: Number(row.shipping_fee || 0),
    total: Number(row.total),
    status: row.status as OrderStatus,
    statusHistory: row.status_history || [],
    paymentMethod: 'cod',
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class StorageService {
  private initLocal(): void {
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
    this.initLocal();
  }

  // --- STORES ---
  async getStores(): Promise<Store[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase getStores error:', error);
        return [];
      }
      return (data || []).map(mapDbStore);
    }
    return this.getLocalStores();
  }

  getLocalStores(): Store[] {
    try {
      const data = localStorage.getItem(STORES_KEY);
      return data ? JSON.parse(data) : INITIAL_STORES;
    } catch {
      return INITIAL_STORES;
    }
  }

  async getStoreById(id: string): Promise<Store | undefined> {
    if (isSupabaseConfigured && supabase) {
      if (!isUuid(id)) {
        return undefined;
      }
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        console.error('Supabase getStoreById error:', error);
        return undefined;
      }
      if (!data) return undefined;
      return mapDbStore(data);
    }
    return this.getLocalStores().find(s => s.id === id);
  }

  async getStoreBySubdomain(subdomain: string): Promise<Store | undefined> {
    const clean = subdomain.toLowerCase().trim();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .ilike('subdomain', clean)
        .maybeSingle();
      if (error) {
        console.error('Supabase getStoreBySubdomain error:', error);
        throw error;
      }
      if (!data) return undefined;
      return mapDbStore(data);
    }
    return this.getLocalStores().find(s => s.subdomain.toLowerCase() === clean);
  }

  async saveStore(store: Store): Promise<{ success: boolean; error?: string; store?: Store }> {
    if (isSupabaseConfigured && supabase) {
      // Check if updating or creating
      if (store.id && !store.id.startsWith('store_')) {
        // Update existing store (never send plan_id or status from regular merchant UI)
        const updatePayload: any = {
          name: store.name,
          description: store.description,
          logo_url: store.logoUrl,
          brand_color: store.brandColor,
          free_shipping_threshold: store.freeShippingThreshold,
          phone: store.phone,
          custom_wilaya_fees: store.customWilayaFees || {},
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('stores')
          .update(updatePayload)
          .eq('id', store.id)
          .select()
          .single();

        if (error) {
          console.error('Supabase saveStore update error:', error);
          return { success: false, error: error.message };
        }
        return { success: true, store: mapDbStore(data) };
      } else {
        // Insert new store with only permitted columns
        const insertPayload: any = {
          owner_id: store.ownerId,
          name: store.name,
          subdomain: store.subdomain.toLowerCase().trim(),
          description: store.description || '',
          logo_url: store.logoUrl,
          brand_color: store.brandColor || '#059669',
          free_shipping_threshold: store.freeShippingThreshold || 10000,
          phone: store.phone || '',
          custom_wilaya_fees: store.customWilayaFees || {}
        };

        const { data, error } = await supabase
          .from('stores')
          .insert(insertPayload)
          .select()
          .single();

        if (error) {
          console.error('Supabase saveStore insert error:', error);
          return { success: false, error: error.message };
        }
        return { success: true, store: mapDbStore(data) };
      }
    }

    // LocalStorage fallback
    const stores = this.getLocalStores();
    const idx = stores.findIndex(s => s.id === store.id);
    if (idx >= 0) {
      stores[idx] = { ...store, updatedAt: new Date().toISOString() };
    } else {
      stores.push(store);
    }
    localStorage.setItem(STORES_KEY, JSON.stringify(stores));
    return { success: true, store };
  }

  // Admin RPC to change store plan or status
  async adminSetStore(storeId: string, status: string, planId: string): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase && isUuid(storeId)) {
      const { error } = await supabase.rpc('admin_set_store', {
        p_store_id: storeId,
        p_status: status,
        p_plan_id: planId
      });
      if (error) {
        console.error('Supabase admin_set_store error:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    // Local fallback
    const stores = this.getLocalStores();
    const target = stores.find(s => s.id === storeId);
    if (target) {
      target.status = status as any;
      target.planId = planId;
      target.updatedAt = new Date().toISOString();
      localStorage.setItem(STORES_KEY, JSON.stringify(stores));
    }
    return { success: true };
  }

  // --- PRODUCTS ---
  async getProducts(storeId?: string): Promise<Product[]> {
    if (isSupabaseConfigured && supabase) {
      if (storeId && !isUuid(storeId)) {
        return [];
      }
      let query = supabase.from('products').select('*');
      if (storeId) {
        query = query.eq('store_id', storeId);
      }
      const { data: prods, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase getProducts error:', error);
        throw error;
      }

      // Try fetching confidential cost prices for store owner from product_costs
      const productIds = (prods || []).map(p => p.id).filter(id => isUuid(id));
      let costMap: Record<string, number> = {};
      if (productIds.length > 0) {
        try {
          const { data: costs } = await supabase
            .from('product_costs')
            .select('product_id, cost_price')
            .in('product_id', productIds);
          if (costs) {
            costs.forEach((c: any) => {
              costMap[c.product_id] = Number(c.cost_price);
            });
          }
        } catch {
          // Normal: public storefront cannot read product_costs due to RLS
        }
      }

      return (prods || []).map(p => mapDbProduct(p, costMap[p.id]));
    }

    return this.getLocalProducts(storeId);
  }

  getLocalProducts(storeId?: string): Product[] {
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

  async getProductById(id: string): Promise<Product | undefined> {
    if (isSupabaseConfigured && supabase) {
      if (!isUuid(id)) {
        return undefined;
      }
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        console.error('Supabase getProductById error:', error);
        return undefined;
      }
      if (!data) return undefined;

      // Fetch cost if available
      let costPrice: number | undefined;
      try {
        const { data: costData } = await supabase
          .from('product_costs')
          .select('cost_price')
          .eq('product_id', id)
          .maybeSingle();
        if (costData) costPrice = Number(costData.cost_price);
      } catch {
        /* ignore RLS for non-owners */
      }

      return mapDbProduct(data, costPrice);
    }

    return this.getLocalProducts().find(p => p.id === id);
  }

  async saveProduct(product: Product): Promise<{ success: boolean; error?: string; product?: Product }> {
    if (isSupabaseConfigured && supabase) {
      const isExisting = product.id && !product.id.startsWith('prod_');
      const payload: any = {
        store_id: product.storeId,
        title: product.title,
        description: product.description,
        price: product.price,
        compare_price: product.comparePrice || null,
        category: product.category,
        stock: product.stock,
        sku: product.sku || null,
        image_url: product.imageUrl,
        additional_images: product.additionalImages || [],
        variants: product.variants || [],
        is_active: product.isActive,
        updated_at: new Date().toISOString()
      };

      let savedDbProduct: any;
      if (isExisting) {
        const { data, error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', product.id)
          .select()
          .single();
        if (error) return { success: false, error: error.message };
        savedDbProduct = data;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(payload)
          .select()
          .single();
        if (error) return { success: false, error: error.message };
        savedDbProduct = data;
      }

      // Update or insert cost_price in product_costs table
      if (savedDbProduct && product.costPrice !== undefined) {
        try {
          await supabase
            .from('product_costs')
            .upsert({
              product_id: savedDbProduct.id,
              cost_price: product.costPrice
            });
        } catch (e) {
          console.warn('Cost price save warning:', e);
        }
      }

      return { success: true, product: mapDbProduct(savedDbProduct, product.costPrice) };
    }

    // Local fallback
    const all = this.getLocalProducts();
    const idx = all.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      all[idx] = { ...product, updatedAt: new Date().toISOString() };
    } else {
      all.unshift(product);
    }
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
    return { success: true, product };
  }

  async deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase && isUuid(id)) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    const all = this.getLocalProducts().filter(p => p.id !== id);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
    return { success: true };
  }

  // --- ORDERS ---
  async getOrders(storeId?: string): Promise<Order[]> {
    if (isSupabaseConfigured && supabase) {
      if (storeId && !isUuid(storeId)) {
        return [];
      }
      let query = supabase.from('orders').select('*');
      if (storeId) {
        query = query.eq('store_id', storeId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase getOrders error:', error);
        throw error;
      }
      return (data || []).map(mapDbOrder);
    }
    return this.getLocalOrders(storeId);
  }

  getLocalOrders(storeId?: string): Order[] {
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

  async getOrderById(id: string): Promise<Order | undefined> {
    if (isSupabaseConfigured && supabase) {
      if (!isUuid(id)) {
        return this.getLocalOrders().find(o => o.id === id);
      }
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) return undefined;
      return mapDbOrder(data);
    }
    return this.getLocalOrders().find(o => o.id === id);
  }

  // Atomic Place Order via Supabase RPC (Server-side price loading, stock locking & Algerian phone validation)
  async placeOrder(params: {
    storeId: string;
    customerName: string;
    customerPhone: string;
    wilayaId: string;
    wilayaName: string;
    address: string;
    items: { productId: string; quantity: number; variantText?: string }[];
    notes?: string;
  }): Promise<{ success: boolean; error?: string; order?: Order }> {
    if (isSupabaseConfigured && supabase && isUuid(params.storeId)) {
      const { data, error } = await supabase.rpc('place_order', {
        p_store_id: params.storeId,
        p_customer_name: params.customerName,
        p_customer_phone: params.customerPhone,
        p_wilaya_id: params.wilayaId,
        p_wilaya_name: params.wilayaName,
        p_address: params.address,
        p_items: params.items,
        p_notes: params.notes || null
      });

      if (error) {
        console.error('Supabase place_order RPC error:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        order: {
          id: data.id,
          orderNumber: data.orderNumber,
          storeId: data.storeId,
          customerName: data.customerName,
          customerPhone: params.customerPhone,
          wilayaId: params.wilayaId,
          wilayaName: data.wilayaName,
          address: params.address,
          items: params.items.map(it => ({
            productId: it.productId,
            title: '',
            price: 0,
            quantity: it.quantity,
            variantText: it.variantText
          })),
          subtotal: Number(data.subtotal),
          shippingFee: Number(data.shippingFee),
          total: Number(data.total),
          status: 'new',
          statusHistory: [{ status: 'new', timestamp: new Date().toISOString() }],
          paymentMethod: 'cod',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
    }

    // Local fallback order placement
    const cleanPhone = params.customerPhone.replace(/\s+/g, '');
    const uniqueOrderNumber = this.generateLocalOrderNumber();

    const orderItems = params.items.map(it => {
      const p = this.getLocalProducts().find(x => x.id === it.productId);
      return {
        productId: it.productId,
        title: p?.title || 'منتج',
        price: p?.price || 0,
        quantity: it.quantity,
        variantText: it.variantText,
        imageUrl: p?.imageUrl
      };
    });

    const subtotal = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);
    const store = this.getLocalStores().find(s => s.id === params.storeId);
    let shippingFee = 600;
    if (store?.customWilayaFees?.[params.wilayaId] !== undefined) {
      shippingFee = store.customWilayaFees[params.wilayaId];
    }
    if (store?.freeShippingThreshold && subtotal >= store.freeShippingThreshold) {
      shippingFee = 0;
    }

    const newOrder: Order = {
      id: 'ord_' + Math.random().toString(36).substring(2, 9),
      orderNumber: uniqueOrderNumber,
      storeId: params.storeId,
      customerName: params.customerName.trim(),
      customerPhone: cleanPhone,
      wilayaId: params.wilayaId,
      wilayaName: params.wilayaName,
      address: params.address.trim(),
      items: orderItems,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      status: 'new',
      statusHistory: [
        { status: 'new', timestamp: new Date().toISOString(), note: 'تم تسجيل الطلب والدفع عند الاستلام' }
      ],
      paymentMethod: 'cod',
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const all = this.getLocalOrders();
    all.unshift(newOrder);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));

    // Deduct stock in local products
    orderItems.forEach(it => {
      const p = this.getLocalProducts().find(x => x.id === it.productId);
      if (p) {
        this.saveProduct({ ...p, stock: Math.max(0, p.stock - it.quantity) });
      }
    });

    return { success: true, order: newOrder };
  }

  // Update status via Supabase RPC with automatic inventory restock on cancellation
  async updateOrderStatus(orderId: string, newStatus: OrderStatus, note?: string): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase && isUuid(orderId)) {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
        p_note: note || null
      });

      if (error) {
        console.error('Supabase update_order_status RPC error:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    // Local fallback
    const all = this.getLocalOrders();
    const order = all.find(o => o.id === orderId);
    if (!order) return { success: false, error: 'الطلب غير موجود' };

    if (order.status !== 'cancelled' && newStatus === 'cancelled') {
      order.items.forEach(it => {
        const p = this.getLocalProducts().find(x => x.id === it.productId);
        if (p) this.saveProduct({ ...p, stock: p.stock + it.quantity });
      });
    } else if (order.status === 'cancelled' && newStatus !== 'cancelled') {
      order.items.forEach(it => {
        const p = this.getLocalProducts().find(x => x.id === it.productId);
        if (p) this.saveProduct({ ...p, stock: Math.max(0, p.stock - it.quantity) });
      });
    }

    order.status = newStatus;
    order.statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: note || `تغيير الحالة إلى ${newStatus}`
    });
    order.updatedAt = new Date().toISOString();
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
    return { success: true };
  }

  // Public Order Tracking via Supabase RPC (Safe, hides PII)
  async trackOrder(orderNumber: string): Promise<any> {
    const cleanNum = orderNumber.trim().toUpperCase();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('track_order', {
        p_order_number: cleanNum
      });
      if (error) {
        console.error('Supabase track_order error:', error);
        return null;
      }
      return data;
    }

    // Local fallback
    const order = this.getLocalOrders().find(o => o.orderNumber.toUpperCase() === cleanNum);
    if (!order) return null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerFirstName: order.customerName.split(' ')[0],
      wilayaName: order.wilayaName,
      total: order.total,
      status: order.status,
      statusHistory: order.statusHistory,
      createdAt: order.createdAt
    };
  }

  // Generates unique DZ-1A2B3C4D format
  generateLocalOrderNumber(): string {
    const chars = '0123456789ABCDEF';
    let hex = '';
    for (let i = 0; i < 8; i++) {
      hex += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `DZ-${hex}`;
  }

  // --- USERS (Local) ---
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

  resetDemoData(): void {
    localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
    localStorage.setItem(ORDERS_KEY, JSON.stringify(INITIAL_ORDERS));
    localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
  }
}

export const storage = new StorageService();
