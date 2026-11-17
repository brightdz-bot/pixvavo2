import {
  Store,
  Product,
  Order,
  User,
  OrderStatus,
  LandingPage,
  DeliveryType
} from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DEFAULT_ASSETS } from '../data/defaultAssets';
import { ALGERIA_WILAYAS, LANDING_THEME_PRESETS } from '../data/wilayas';

export function isUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

const STORES_KEY = 'brightdz_stores';
const LANDING_PAGES_KEY = 'brightdz_landing_pages';
const PRODUCTS_KEY = 'brightdz_products';
const ORDERS_KEY = 'brightdz_orders';
const USERS_KEY = 'brightdz_users';

const INITIAL_STORES: Store[] = [
  {
    id: 'store_bright_dz',
    ownerId: 'usr_owner_1',
    name: 'Bright DZ',
    subdomain: 'bright-dz',
    description: 'متجر الجودة والديكور العصري في الجزائر — منتجات مختارة بعناية مع الدفع بعد المعاينة والاستلام.',
    announcementText: 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
    brandColor: '#754b2d',
    freeShippingThreshold: 0,
    planId: 'plan_pro',
    status: 'active',
    phone: '0798353165',
    defaultWhatsapp: '213798353165',
    defaultPixelId: '',
    googleSheetWebhook: '',
    customWilayaFees: {},
    customWilayaRates: {},
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_LANDING_PAGES: LandingPage[] = [
  {
    id: 'lp_towel_holder',
    storeId: 'store_bright_dz',
    slug: 'gravity-towel-holder',
    title: 'حامل المناشف الخشبي الفاخر',
    highlightTitle: 'بنظام القفل بالجاذبية',
    description: 'أضف لمسة جمالية وعصرية لحمامك أو مطبخك! مشبك تثبيت فريد مصنوع من الخشب الطبيعي المحمي ضد الرطوبة بدون ثقب الجدران.',
    category: 'الديكور والمنزل',
    stock: 42,
    badgeText: 'الأكثر طلباً',
    mainImage: DEFAULT_ASSETS.towelHolderMain,
    galleryImages: [
      DEFAULT_ASSETS.towelHolderMain,
      DEFAULT_ASSETS.towelHolderBathroom,
      DEFAULT_ASSETS.towelHolderKitchen,
      DEFAULT_ASSETS.towelHolderDetail
    ],
    offers: [
      {
        id: 'pack1',
        title: 'العرض العادي (قطعة واحدة)',
        subtitle: 'مناسب لحمام واحد أو مطبخ',
        quantity: 1,
        price: 1900,
        isDefault: false
      },
      {
        id: 'pack2',
        title: 'عرض القطعتين (باك المطبخ والحمام)',
        subtitle: 'قطعتين لتغطية المنزل بالكامل',
        quantity: 2,
        price: 3300,
        comparePrice: 3800,
        badge: 'توفير رائع',
        isDefault: true
      },
      {
        id: 'pack4',
        title: 'العرض العائلي الفاخر (4 قطع)',
        subtitle: 'أقصى توفير للعائلات الكبيرة',
        quantity: 4,
        price: 6200,
        comparePrice: 7600,
        isDefault: false
      }
    ],
    theme: LANDING_THEME_PRESETS[0],
    integrations: {
      pixelId: '',
      whatsappNumber: '213798353165',
      googleSheetWebhook: ''
    },
    isPublished: true,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'lp_organizer_shelf',
    storeId: 'store_bright_dz',
    slug: 'wooden-bathroom-shelf',
    title: 'رف الحمام الخشبي العصري',
    highlightTitle: 'مع خطافات نحاسية بدون ثقب',
    description: 'نظم مستلزمات الحمام والعطور بأناقة دون الحاجة لحفر الجدران. خشب معالج ضد الماء مع تثبيت لاصق فائق القوة يتحمل حتى 8 كغ.',
    category: 'تنظيم الحمام',
    stock: 26,
    badgeText: 'وصل حديثاً',
    mainImage: DEFAULT_ASSETS.organizerShelfHero,
    galleryImages: [
      DEFAULT_ASSETS.organizerShelfHero,
      DEFAULT_ASSETS.towelHolderBathroom,
      DEFAULT_ASSETS.towelHolderDetail,
      DEFAULT_ASSETS.towelHolderKitchen
    ],
    offers: [
      {
        id: 'shelf1',
        title: 'رف واحد مع خطافين (قطعة واحدة)',
        subtitle: 'تثبيت فوري بدون ثقب أو أدوات',
        quantity: 1,
        price: 2800,
        comparePrice: 3400,
        isDefault: false
      },
      {
        id: 'shelf2',
        title: 'باك التنظيم الكامل (قطعتين)',
        subtitle: 'رف رئيسي + رف إضافي للحمام أو المطبخ',
        quantity: 2,
        price: 4900,
        comparePrice: 5600,
        badge: 'الأكثر مبيعاً',
        isDefault: true
      },
      {
        id: 'shelf3',
        title: 'العرض الثلاثي الفاخر (3 قطع)',
        subtitle: 'تغطية شاملة للحمام والمطبخ والمدخل',
        quantity: 3,
        price: 6800,
        comparePrice: 8400,
        isDefault: false
      }
    ],
    theme: LANDING_THEME_PRESETS[1],
    integrations: {
      pixelId: '',
      whatsappNumber: '213798353165',
      googleSheetWebhook: ''
    },
    isPublished: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_PRODUCTS: Product[] = [];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord_201',
    orderNumber: 'DZ-9821A4B2',
    storeId: 'store_bright_dz',
    landingPageId: 'lp_towel_holder',
    bundleLabel: 'عرض القطعتين (باك المطبخ والحمام) (الكمية: 2)',
    customerName: 'محمد الأمين بن عمارة',
    customerPhone: '0550123456',
    wilayaId: '16',
    wilayaName: 'الجزائر العاصمة',
    commune: 'دالي إبراهيم',
    deliveryType: 'home',
    address: 'الجزائر العاصمة - دالي إبراهيم',
    items: [
      {
        productId: 'lp_towel_holder',
        title: 'حامل المناشف الخشبي الفاخر',
        price: 3300,
        quantity: 1,
        variantText: 'عرض القطعتين (باك المطبخ والحمام) (الكمية: 2)',
        imageUrl: DEFAULT_ASSETS.towelHolderMain
      }
    ],
    subtotal: 3300,
    shippingFee: 600,
    total: 3900,
    status: 'shipping',
    trackingCode: '28-H8G9NDFX0V-ZR',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), note: 'تم تسجيل الطلب والدفع عند الاستلام' },
      { status: 'confirmed', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'تم تأكيد الطلب هاتفياً مع الزبون' },
      { status: 'shipping', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), note: 'تم إرسال الطرد عبر ZR Express' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'ord_202',
    orderNumber: 'DZ-7140B8F9',
    storeId: 'store_bright_dz',
    landingPageId: 'lp_towel_holder',
    bundleLabel: 'العرض العائلي الفاخر (4 قطع) (الكمية: 4)',
    customerName: 'ياسمين قاسمي',
    customerPhone: '0661234567',
    wilayaId: '31',
    wilayaName: 'وهران',
    commune: 'بئر الجير',
    deliveryType: 'stop',
    address: 'وهران - بئر الجير (مكتب الشحن Stop Desk)',
    items: [
      {
        productId: 'lp_towel_holder',
        title: 'حامل المناشف الخشبي الفاخر',
        price: 6200,
        quantity: 1,
        variantText: 'العرض العائلي الفاخر (4 قطع) (الكمية: 4)',
        imageUrl: DEFAULT_ASSETS.towelHolderMain
      }
    ],
    subtotal: 6200,
    shippingFee: 450,
    total: 6650,
    status: 'delivered',
    trackingCode: 'YAL-3109941',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), note: 'تم تسجيل الطلب' },
      { status: 'confirmed', timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
      { status: 'shipping', timestamp: new Date(Date.now() - 4 * 86400000).toISOString() },
      { status: 'delivered', timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), note: 'تم تسليم الطرد وتحصيل المبلغ' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'ord_203',
    orderNumber: 'DZ-3392E1C4',
    storeId: 'store_bright_dz',
    landingPageId: 'lp_organizer_shelf',
    bundleLabel: 'باك التنظيم الكامل (قطعتين) (الكمية: 2)',
    customerName: 'كريم مزياني',
    customerPhone: '0770345678',
    wilayaId: '19',
    wilayaName: 'سطيف',
    commune: 'العلمة',
    deliveryType: 'home',
    address: 'سطيف - العلمة',
    items: [
      {
        productId: 'lp_organizer_shelf',
        title: 'رف الحمام الخشبي العصري',
        price: 4900,
        quantity: 1,
        variantText: 'باك التنظيم الكامل (قطعتين) (الكمية: 2)',
        imageUrl: DEFAULT_ASSETS.organizerShelfHero
      }
    ],
    subtotal: 4900,
    shippingFee: 600,
    total: 5500,
    status: 'new',
    statusHistory: [
      { status: 'new', timestamp: new Date(Date.now() - 3 * 3600000).toISOString(), note: 'طلب جديد بانتظار الاتصال الهاتفي للتأكيد' }
    ],
    paymentMethod: 'cod',
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString()
  }
];

const INITIAL_USERS: User[] = [
  {
    id: 'usr_owner_1',
    name: 'صاحب متجر Bright DZ',
    email: 'owner@brightdz.dz',
    phone: '0798353165',
    role: 'merchant',
    storeId: 'store_bright_dz'
  }
];

function mapDbStore(row: any): Store {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    subdomain: row.subdomain,
    description: row.description || '',
    announcementText: row.announcement_text || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
    logoUrl: row.logo_url,
    brandColor: row.brand_color || '#754b2d',
    freeShippingThreshold: Number(row.free_shipping_threshold || 0),
    planId: row.plan_id || 'plan_pro',
    status: row.status || 'active',
    phone: row.phone || '',
    defaultWhatsapp: row.default_whatsapp || row.phone || '',
    defaultPixelId: row.default_pixel_id || '',
    googleSheetWebhook: row.google_sheet_webhook || '',
    customWilayaFees: row.custom_wilaya_fees || {},
    customWilayaRates: row.custom_wilaya_rates || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDbLandingPage(row: any): LandingPage {
  const theme = row.theme && row.theme.primaryColor ? row.theme : LANDING_THEME_PRESETS[0];
  return {
    id: row.id,
    storeId: row.store_id,
    slug: row.slug,
    title: row.title,
    highlightTitle: row.highlight_title || '',
    description: row.description || '',
    category: row.category || 'عام',
    stock: Number(row.stock || 0),
    badgeText: row.badge_text || '',
    mainImage: row.main_image || DEFAULT_ASSETS.towelHolderMain,
    galleryImages: Array.isArray(row.gallery_images) ? row.gallery_images : [],
    offers: Array.isArray(row.offers) ? row.offers : [],
    theme,
    integrations: row.integrations || {},
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

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

function mapDbOrder(row: any): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    storeId: row.store_id,
    landingPageId: row.landing_page_id || undefined,
    bundleLabel: row.bundle_label || undefined,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    wilayaId: row.wilaya_id,
    wilayaName: row.wilaya_name,
    commune: row.commune || undefined,
    deliveryType: (row.delivery_type === 'stop' ? 'stop' : 'home') as DeliveryType,
    address: row.address,
    items: row.items || [],
    subtotal: Number(row.subtotal),
    shippingFee: Number(row.shipping_fee || 0),
    total: Number(row.total),
    status: row.status as OrderStatus,
    trackingCode: row.tracking_code || undefined,
    statusHistory: row.status_history || [],
    paymentMethod: 'cod',
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class StorageService {
  private initLocal(): void {
    try {
      const rawStores = localStorage.getItem(STORES_KEY);
      const parsedStores = rawStores ? JSON.parse(rawStores) : null;
      if (!Array.isArray(parsedStores) || parsedStores.length === 0) {
        localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
      }
    } catch {
      localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
    }

    try {
      const rawPages = localStorage.getItem(LANDING_PAGES_KEY);
      const parsedPages = rawPages ? JSON.parse(rawPages) : null;
      if (!Array.isArray(parsedPages)) {
        localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(INITIAL_LANDING_PAGES));
      }
    } catch {
      localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(INITIAL_LANDING_PAGES));
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

  private demoOverride: boolean = (() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('brightdz_demo_override') === '1';
    } catch {
      return false;
    }
  })();

  isDemoOverride(): boolean {
    return this.demoOverride;
  }

  setDemoOverride(enabled: boolean): void {
    this.demoOverride = enabled;
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (enabled) sessionStorage.setItem('brightdz_demo_override', '1');
        else sessionStorage.removeItem('brightdz_demo_override');
      }
    } catch {
      // ignore
    }
    this.initLocal();
  }

  private useSupabase(): boolean {
    return isSupabaseConfigured && Boolean(supabase) && !this.demoOverride;
  }

  constructor() {
    this.initLocal();
  }

  // --- STORES ---
  async getStores(): Promise<Store[]> {
    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Supabase getStores error:', error);
        return [];
      }
      return (data || []).map(mapDbStore);
    }
    return this.getLocalStores();
  }

  async getPrimaryStoreDetailed(): Promise<{ store?: Store; error?: string }> {
    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Supabase getPrimaryStore error:', error);
        return { error: error.message };
      }
      return { store: data ? mapDbStore(data) : undefined };
    }
    return { store: this.getLocalStores()[0] };
  }

  async getPrimaryStore(): Promise<Store | undefined> {
    const res = await this.getPrimaryStoreDetailed();
    return res.store;
  }

  getLocalStores(): Store[] {
    try {
      const data = localStorage.getItem(STORES_KEY);
      const parsed = data ? JSON.parse(data) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
      return INITIAL_STORES;
    } catch {
      return INITIAL_STORES;
    }
  }

  async getStoreById(id: string): Promise<Store | undefined> {
    if (this.useSupabase() && supabase) {
      if (!isUuid(id)) return undefined;
      const { data, error } = await supabase.from('stores').select('*').eq('id', id).maybeSingle();
      if (error || !data) return undefined;
      return mapDbStore(data);
    }
    return this.getLocalStores().find(s => s.id === id);
  }

  async getStoreBySubdomain(subdomain: string): Promise<Store | undefined> {
    const clean = subdomain.toLowerCase().trim();
    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .ilike('subdomain', clean)
        .maybeSingle();
      if (error) throw error;
      if (!data) return this.getPrimaryStore();
      return mapDbStore(data);
    }
    return this.getLocalStores().find(s => s.subdomain.toLowerCase() === clean) || this.getLocalStores()[0];
  }

  async saveStore(store: Store): Promise<{ success: boolean; error?: string; store?: Store }> {
    if (this.useSupabase() && supabase) {
      if (store.id && isUuid(store.id)) {
        const updatePayload: any = {
          name: store.name,
          description: store.description || '',
          announcement_text: store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
          logo_url: store.logoUrl || null,
          brand_color: store.brandColor || '#754b2d',
          free_shipping_threshold: Number(store.freeShippingThreshold || 0),
          phone: store.phone || '',
          default_whatsapp: store.defaultWhatsapp || '',
          default_pixel_id: store.defaultPixelId || '',
          google_sheet_webhook: store.googleSheetWebhook || '',
          custom_wilaya_fees: store.customWilayaFees || {},
          custom_wilaya_rates: store.customWilayaRates || {},
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('stores')
          .update(updatePayload)
          .eq('id', store.id)
          .select()
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, store: mapDbStore(data) };
      } else {
        const insertPayload: any = {
          owner_id: store.ownerId,
          name: store.name,
          subdomain: store.subdomain.toLowerCase().trim(),
          description: store.description || '',
          announcement_text: store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
          logo_url: store.logoUrl || null,
          brand_color: store.brandColor || '#754b2d',
          free_shipping_threshold: Number(store.freeShippingThreshold || 0),
          phone: store.phone || '',
          default_whatsapp: store.defaultWhatsapp || '',
          default_pixel_id: store.defaultPixelId || '',
          google_sheet_webhook: store.googleSheetWebhook || '',
          custom_wilaya_fees: store.customWilayaFees || {},
          custom_wilaya_rates: store.customWilayaRates || {}
        };

        const { data, error } = await supabase
          .from('stores')
          .insert(insertPayload)
          .select()
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, store: mapDbStore(data) };
      }
    }

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

  // --- LANDING PAGES ---
  async getLandingPages(storeId?: string): Promise<LandingPage[]> {
    if (this.useSupabase() && supabase) {
      if (storeId && !isUuid(storeId)) return [];
      let query = supabase.from('landing_pages').select('*');
      if (storeId) query = query.eq('store_id', storeId);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase getLandingPages error:', error);
        throw error;
      }
      return (data || []).map(mapDbLandingPage);
    }
    return this.getLocalLandingPages(storeId);
  }

  getLocalLandingPages(storeId?: string): LandingPage[] {
    try {
      const data = localStorage.getItem(LANDING_PAGES_KEY);
      const all: LandingPage[] = data ? JSON.parse(data) : INITIAL_LANDING_PAGES;
      if (storeId) return all.filter(p => p.storeId === storeId);
      return all;
    } catch {
      return INITIAL_LANDING_PAGES;
    }
  }

  async getLandingPageBySlug(slug: string): Promise<LandingPage | undefined> {
    const clean = slug.trim().toLowerCase();
    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase
        .from('landing_pages')
        .select('*')
        .ilike('slug', clean)
        .maybeSingle();
      if (error || !data) return undefined;
      return mapDbLandingPage(data);
    }
    return this.getLocalLandingPages().find(p => p.slug.toLowerCase() === clean);
  }

  async saveLandingPage(page: LandingPage): Promise<{ success: boolean; error?: string; page?: LandingPage }> {
    const cleanSlug = page.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!cleanSlug || cleanSlug.length < 3) {
      return { success: false, error: 'يجب أن يحتوي رابط الصفحة (Slug) على 3 أحرف إنجليزية أو أرقام على الأقل' };
    }

    if (this.useSupabase() && supabase) {
      const isExisting = page.id && isUuid(page.id);
      const commonFields = {
        slug: cleanSlug,
        title: page.title.trim(),
        highlight_title: page.highlightTitle?.trim() || null,
        description: page.description.trim(),
        category: page.category || 'عام',
        stock: Math.max(0, Number(page.stock) || 0),
        badge_text: page.badgeText?.trim() || null,
        main_image: page.mainImage,
        gallery_images: page.galleryImages || [],
        offers: page.offers || [],
        theme: page.theme || LANDING_THEME_PRESETS[0],
        integrations: page.integrations || {},
        is_published: page.isPublished
      };

      if (isExisting) {
        const updatePayload = {
          ...commonFields,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase
          .from('landing_pages')
          .update(updatePayload)
          .eq('id', page.id)
          .select()
          .single();
        if (error) return { success: false, error: error.message };
        return { success: true, page: mapDbLandingPage(data) };
      } else {
        const insertPayload = {
          store_id: page.storeId,
          ...commonFields
        };
        const { data, error } = await supabase
          .from('landing_pages')
          .insert(insertPayload)
          .select()
          .single();
        if (error) return { success: false, error: error.message };
        return { success: true, page: mapDbLandingPage(data) };
      }
    }

    const all = this.getLocalLandingPages();
    const duplicateSlug = all.find(p => p.slug.toLowerCase() === cleanSlug && p.id !== page.id);
    if (duplicateSlug) {
      return { success: false, error: 'هذا الرابط (Slug) مستخدم في صفحة أخرى، اختر رابطاً مختلفاً' };
    }

    const saved: LandingPage = {
      ...page,
      slug: cleanSlug,
      updatedAt: new Date().toISOString()
    };
    const idx = all.findIndex(p => p.id === page.id);
    if (idx >= 0) {
      all[idx] = saved;
    } else {
      all.unshift(saved);
    }
    localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(all));
    return { success: true, page: saved };
  }

  async deleteLandingPage(id: string): Promise<{ success: boolean; error?: string }> {
    if (this.useSupabase() && supabase && isUuid(id)) {
      const { error } = await supabase.from('landing_pages').delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    const all = this.getLocalLandingPages().filter(p => p.id !== id);
    localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(all));
    return { success: true };
  }

  async seedStarterLandingPages(storeId: string): Promise<void> {
    try {
      const existing = await this.getLandingPages(storeId);
      if (existing.length > 0) return;

      const suffix = Math.random().toString(36).substring(2, 6);
      for (const tpl of INITIAL_LANDING_PAGES) {
        const res = await this.saveLandingPage({
          ...tpl,
          id: '',
          storeId
        });
        if (!res.success && res.error?.toLowerCase().includes('duplicate')) {
          await this.saveLandingPage({
            ...tpl,
            id: '',
            storeId,
            slug: `${tpl.slug}-${suffix}`
          });
        }
      }
    } catch (err) {
      console.warn('Starter landing page seeding skipped:', err);
    }
  }

  // --- PRODUCTS (Legacy fallback kept clean) ---
  async getProducts(storeId?: string): Promise<Product[]> {
    if (this.useSupabase() && supabase) {
      if (storeId && !isUuid(storeId)) return [];
      let query = supabase.from('products').select('*');
      if (storeId) query = query.eq('store_id', storeId);
      const { data: prods, error } = await query.order('created_at', { ascending: false });
      if (error) return [];
      return (prods || []).map(p => mapDbProduct(p));
    }
    return this.getLocalProducts(storeId);
  }

  getLocalProducts(storeId?: string): Product[] {
    try {
      const data = localStorage.getItem(PRODUCTS_KEY);
      const all: Product[] = data ? JSON.parse(data) : INITIAL_PRODUCTS;
      if (storeId) return all.filter(p => p.storeId === storeId);
      return all;
    } catch {
      return INITIAL_PRODUCTS;
    }
  }

  async saveProduct(product: Product): Promise<{ success: boolean; error?: string; product?: Product }> {
    const all = this.getLocalProducts();
    const idx = all.findIndex(p => p.id === product.id);
    if (idx >= 0) all[idx] = { ...product, updatedAt: new Date().toISOString() };
    else all.unshift(product);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
    return { success: true, product };
  }

  // --- ORDERS ---
  async getOrders(storeId?: string): Promise<Order[]> {
    if (this.useSupabase() && supabase) {
      if (storeId && !isUuid(storeId)) return [];
      let query = supabase.from('orders').select('*');
      if (storeId) query = query.eq('store_id', storeId);
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
      if (storeId) return all.filter(o => o.storeId === storeId);
      return all;
    } catch {
      return INITIAL_ORDERS;
    }
  }

  async placeOrder(params: {
    storeId: string;
    landingPageId?: string;
    offerId?: string;
    customerName: string;
    customerPhone: string;
    wilayaId: string;
    wilayaName: string;
    commune?: string;
    deliveryType?: DeliveryType;
    address: string;
    items?: { productId: string; quantity: number; variantText?: string }[];
    notes?: string;
  }): Promise<{ success: boolean; error?: string; order?: Order }> {
    const deliveryType: DeliveryType = params.deliveryType === 'stop' ? 'stop' : 'home';

    if (this.useSupabase() && supabase && isUuid(params.storeId)) {
      const { data, error } = await supabase.rpc('place_order', {
        p_store_id: params.storeId,
        p_customer_name: params.customerName,
        p_customer_phone: params.customerPhone,
        p_wilaya_id: params.wilayaId,
        p_wilaya_name: params.wilayaName,
        p_address: params.address,
        p_items: params.items || [],
        p_notes: params.notes || null,
        p_landing_page_id: params.landingPageId && isUuid(params.landingPageId) ? params.landingPageId : null,
        p_offer_id: params.offerId || null,
        p_commune: params.commune || null,
        p_delivery_type: deliveryType
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
          landingPageId: data.landingPageId || params.landingPageId,
          bundleLabel: data.bundleLabel,
          customerName: data.customerName,
          customerPhone: params.customerPhone,
          wilayaId: params.wilayaId,
          wilayaName: data.wilayaName,
          commune: data.commune || params.commune,
          deliveryType: data.deliveryType || deliveryType,
          address: params.address,
          items: (params.items || []).map(it => ({
            productId: it.productId,
            title: data.bundleLabel || '',
            price: Number(data.subtotal),
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

    // Local fallback
    const cleanPhone = params.customerPhone.replace(/[\s\-\.]/g, '');
    if (!/^(\+213|00213|0)[0-9]{8,9}$/.test(cleanPhone)) {
      return { success: false, error: 'يرجى إدخال رقم هاتف جزائري صحيح (مثال: 0550123456)' };
    }

    const store = this.getLocalStores().find(s => s.id === params.storeId) || this.getLocalStores()[0];
    const wilaya = ALGERIA_WILAYAS.find(w => w.id === params.wilayaId) || ALGERIA_WILAYAS[15];
    const uniqueOrderNumber = this.generateLocalOrderNumber();

    let subtotal = 0;
    let bundleLabel = '';
    let orderItems: Order['items'] = [];

    if (params.landingPageId) {
      const pages = this.getLocalLandingPages();
      const page = pages.find(p => p.id === params.landingPageId);
      if (!page) return { success: false, error: 'صفحة المنتج غير موجودة' };
      const offer =
        page.offers.find(o => o.id === params.offerId) ||
        page.offers.find(o => o.isDefault) ||
        page.offers[0];
      if (!offer) return { success: false, error: 'العرض المختار غير متوفر' };
      const bundleQty = Math.max(1, offer.quantity || 1);
      if (page.stock < bundleQty) {
        return { success: false, error: `عذراً، الكمية المتوفرة حالياً هي ${page.stock} قطع فقط` };
      }

      // Deduct landing page stock
      page.stock = Math.max(0, page.stock - bundleQty);
      page.updatedAt = new Date().toISOString();
      localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(pages));

      subtotal = offer.price;
      bundleLabel = `${offer.title} (الكمية: ${bundleQty})`;
      orderItems = [
        {
          productId: page.id,
          title: page.title,
          price: offer.price,
          quantity: 1,
          variantText: bundleLabel,
          imageUrl: page.mainImage
        }
      ];
    } else {
      orderItems = (params.items || []).map(it => {
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
      subtotal = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);
    }

    // Calculate delivery fee (custom rates -> custom home fee -> wilaya home/stop default)
    let shippingFee = deliveryType === 'stop' ? wilaya.stopFee : wilaya.homeFee;
    const customRate = store?.customWilayaRates?.[wilaya.id];
    if (customRate && customRate[deliveryType] !== undefined) {
      shippingFee = customRate[deliveryType];
    } else if (deliveryType === 'home' && store?.customWilayaFees?.[wilaya.id] !== undefined) {
      shippingFee = store.customWilayaFees[wilaya.id];
    }
    if (store?.freeShippingThreshold && store.freeShippingThreshold > 0 && subtotal >= store.freeShippingThreshold) {
      shippingFee = 0;
    }

    const newOrder: Order = {
      id: 'ord_' + Math.random().toString(36).substring(2, 9),
      orderNumber: uniqueOrderNumber,
      storeId: params.storeId,
      landingPageId: params.landingPageId,
      bundleLabel,
      customerName: params.customerName.trim(),
      customerPhone: cleanPhone,
      wilayaId: wilaya.id,
      wilayaName: wilaya.nameAr,
      commune: params.commune || '',
      deliveryType,
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
    return { success: true, order: newOrder };
  }

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    note?: string,
    trackingCode?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.useSupabase() && supabase && isUuid(orderId)) {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
        p_note: note || null,
        p_tracking_code: trackingCode !== undefined ? trackingCode : null
      });
      if (error) {
        console.error('Supabase update_order_status RPC error:', error);
        return { success: false, error: error.message };
      }

      const { data: savedOrder, error: verifyError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .maybeSingle();

      if (verifyError) {
        return { success: false, error: 'تعذر التحقق من حفظ الحالة: ' + verifyError.message };
      }
      if (!savedOrder || savedOrder.status !== newStatus) {
        return { success: false, error: 'لم يتم تحديث الحالة في قاعدة البيانات' };
      }
      return { success: true };
    }

    const all = this.getLocalOrders();
    const order = all.find(o => o.id === orderId);
    if (!order) return { success: false, error: 'الطلب غير موجود' };

    if (order.landingPageId) {
      const pages = this.getLocalLandingPages();
      const page = pages.find(p => p.id === order.landingPageId);
      if (page) {
        const match = order.bundleLabel?.match(/الكمية:\s*(\d+)/);
        const qty = match ? parseInt(match[1], 10) : 1;
        if (order.status !== 'cancelled' && newStatus === 'cancelled') {
          page.stock += qty;
        } else if (order.status === 'cancelled' && newStatus !== 'cancelled') {
          page.stock = Math.max(0, page.stock - qty);
        }
        localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(pages));
      }
    }

    order.status = newStatus;
    if (trackingCode !== undefined && trackingCode.trim()) {
      order.trackingCode = trackingCode.trim();
    }
    order.statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: note || `تحديث الحالة`
    });
    order.updatedAt = new Date().toISOString();
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
    return { success: true };
  }

  async trackOrder(orderNumber: string): Promise<any> {
    const cleanNum = orderNumber.trim().toUpperCase();
    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase.rpc('track_order', {
        p_order_number: cleanNum
      });
      if (error) {
        console.error('Supabase track_order error:', error);
        return null;
      }
      return data;
    }

    const order = this.getLocalOrders().find(o => o.orderNumber.toUpperCase() === cleanNum);
    if (!order) return null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerFirstName: order.customerName.split(' ')[0],
      wilayaName: order.wilayaName,
      commune: order.commune,
      deliveryType: order.deliveryType || 'home',
      bundleLabel: order.bundleLabel || order.items[0]?.title || '',
      total: order.total,
      status: order.status,
      trackingCode: order.trackingCode,
      statusHistory: order.statusHistory,
      createdAt: order.createdAt
    };
  }

  generateLocalOrderNumber(): string {
    const chars = '0123456789ABCDEF';
    let hex = '';
    for (let i = 0; i < 8; i++) {
      hex += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `DZ-${hex}`;
  }

  getUsers(): User[] {
    try {
      const data = localStorage.getItem(USERS_KEY);
      return data ? JSON.parse(data) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  }

  resetDemoData(): void {
    localStorage.setItem(STORES_KEY, JSON.stringify(INITIAL_STORES));
    localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(INITIAL_LANDING_PAGES));
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
    localStorage.setItem(ORDERS_KEY, JSON.stringify(INITIAL_ORDERS));
    localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
  }
}

export const storage = new StorageService();
