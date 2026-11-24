import {
  Store,
  Product,
  Order,
  User,
  OrderStatus,
  LandingPage,
  DeliveryType,
  StoreApiConfig,
  ApiDiagnosticLog,
  AbandonedOrder,
  AbandonedOrderStatus
} from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  normalizePhoneCanonical,
  SheetOrderRow,
  SheetAbandonedRow,
  ABANDONED_STAGE_LABELS,
  sendAbandonedOrderToGoogleSheet,
  updateAbandonedStatusInGoogleSheet,
  deleteAbandonedOrderInGoogleSheet
} from './integrations';
import { DEFAULT_ASSETS } from '../data/defaultAssets';
import { ALGERIA_WILAYAS, LANDING_THEME_PRESETS } from '../data/wilayas';
import {
  isRealSheetOrderRow,
  validateAlgerianPhone,
  validateCustomerName
} from '../utils/orderValidation';
import {
  normalizeDomainHost,
  isPlatformDefaultHost,
  extractStoreSubdomainFromLocation
} from '../utils/urlRouting';

export function isUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

const STORES_KEY = 'brightdz_stores';
const LANDING_PAGES_KEY = 'brightdz_landing_pages';
const PRODUCTS_KEY = 'brightdz_products';
const ORDERS_KEY = 'brightdz_orders';
const USERS_KEY = 'brightdz_users';
const API_CONFIGS_KEY = 'brightdz_api_configs';
const ORDER_COURIER_META_KEY = 'brightdz_order_courier_meta';
const DELETED_SHEET_ORDERS_KEY = 'brightdz_deleted_sheet_orders';
const ABANDONED_ORDERS_KEY = 'brightdz_abandoned_orders';
const DELETED_ABANDONED_SESSIONS_KEY = 'brightdz_deleted_abandoned_sessions';

export const CUSTOM_DOMAIN_SQL_MIGRATION_SNIPPET = `BEGIN;
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS custom_domain TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_custom_domain_unique
  ON public.stores (lower(custom_domain))
  WHERE custom_domain IS NOT NULL AND trim(custom_domain) <> '';
COMMIT;`;

export const ABANDONED_SQL_MIGRATION_SNIPPET = `BEGIN;
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION public.owns_store(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$;

CREATE TABLE IF NOT EXISTS public.abandoned_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  store_id UUID NOT NULL,
  landing_page_id UUID,
  landing_page_title TEXT,
  offer_id TEXT,
  bundle_label TEXT,
  variant_label TEXT,
  customer_name TEXT,
  customer_phone TEXT NOT NULL,
  wilaya_id TEXT,
  wilaya_name TEXT,
  commune TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'home',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  shipping_fee NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  recovered_order_number TEXT,
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abandoned_orders_store_session_unique UNIQUE (store_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_orders_store_updated
  ON public.abandoned_orders (store_id, updated_at DESC);

ALTER TABLE public.abandoned_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandoned_orders_owner_select ON public.abandoned_orders;
CREATE POLICY abandoned_orders_owner_select ON public.abandoned_orders
  FOR SELECT TO authenticated
  USING (public.owns_store(public.abandoned_orders.store_id) OR public.is_admin());

DROP POLICY IF EXISTS abandoned_orders_owner_update ON public.abandoned_orders;
CREATE POLICY abandoned_orders_owner_update ON public.abandoned_orders
  FOR UPDATE TO authenticated
  USING (public.owns_store(public.abandoned_orders.store_id) OR public.is_admin())
  WITH CHECK (public.owns_store(public.abandoned_orders.store_id) OR public.is_admin());

DROP POLICY IF EXISTS abandoned_orders_owner_delete ON public.abandoned_orders;
CREATE POLICY abandoned_orders_owner_delete ON public.abandoned_orders
  FOR DELETE TO authenticated
  USING (public.owns_store(public.abandoned_orders.store_id) OR public.is_admin());

GRANT SELECT, UPDATE, DELETE ON TABLE public.abandoned_orders TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_abandoned_order(
  p_store_id UUID, p_session_id TEXT, p_customer_phone TEXT,
  p_customer_name TEXT DEFAULT NULL, p_landing_page_id UUID DEFAULT NULL,
  p_landing_page_title TEXT DEFAULT NULL, p_offer_id TEXT DEFAULT NULL,
  p_bundle_label TEXT DEFAULT NULL, p_variant_label TEXT DEFAULT NULL,
  p_wilaya_id TEXT DEFAULT NULL, p_wilaya_name TEXT DEFAULT NULL,
  p_commune TEXT DEFAULT NULL, p_delivery_type TEXT DEFAULT 'home',
  p_subtotal NUMERIC DEFAULT 0, p_shipping_fee NUMERIC DEFAULT 0, p_total NUMERIC DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_phone TEXT; v_session TEXT; v_id UUID;
BEGIN
  v_session := left(trim(COALESCE(p_session_id, '')), 80);
  v_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
  IF left(v_phone, 5) = '00213' AND length(v_phone) >= 13 THEN v_phone := '0' || substr(v_phone, 6);
  ELSIF left(v_phone, 3) = '213' AND length(v_phone) >= 11 THEN v_phone := '0' || substr(v_phone, 4);
  ELSIF length(v_phone) = 9 AND left(v_phone, 1) IN ('5','6','7') THEN v_phone := '0' || v_phone;
  END IF;
  IF p_store_id IS NULL OR v_session = '' OR v_phone !~ '^0[567][0-9]{8}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;
  INSERT INTO public.abandoned_orders (
    session_id, store_id, landing_page_id, landing_page_title, offer_id,
    bundle_label, variant_label, customer_name, customer_phone,
    wilaya_id, wilaya_name, commune, delivery_type,
    subtotal, shipping_fee, total, status, created_at, updated_at
  ) VALUES (
    v_session, p_store_id, p_landing_page_id,
    NULLIF(left(trim(COALESCE(p_landing_page_title, '')), 180), ''),
    NULLIF(left(trim(COALESCE(p_offer_id, '')), 80), ''),
    NULLIF(left(trim(COALESCE(p_bundle_label, '')), 200), ''),
    NULLIF(left(trim(COALESCE(p_variant_label, '')), 160), ''),
    NULLIF(left(trim(COALESCE(p_customer_name, '')), 100), ''),
    v_phone,
    NULLIF(left(trim(COALESCE(p_wilaya_id, '')), 10), ''),
    NULLIF(left(trim(COALESCE(p_wilaya_name, '')), 100), ''),
    NULLIF(left(trim(COALESCE(p_commune, '')), 120), ''),
    CASE WHEN p_delivery_type = 'stop' THEN 'stop' ELSE 'home' END,
    GREATEST(0, COALESCE(p_subtotal, 0)),
    GREATEST(0, COALESCE(p_shipping_fee, 0)),
    GREATEST(0, COALESCE(p_total, 0)),
    'new', now(), now()
  )
  ON CONFLICT (store_id, session_id) DO UPDATE SET
    landing_page_id = COALESCE(EXCLUDED.landing_page_id, public.abandoned_orders.landing_page_id),
    landing_page_title = COALESCE(EXCLUDED.landing_page_title, public.abandoned_orders.landing_page_title),
    offer_id = COALESCE(EXCLUDED.offer_id, public.abandoned_orders.offer_id),
    bundle_label = COALESCE(EXCLUDED.bundle_label, public.abandoned_orders.bundle_label),
    variant_label = COALESCE(EXCLUDED.variant_label, public.abandoned_orders.variant_label),
    customer_name = COALESCE(EXCLUDED.customer_name, public.abandoned_orders.customer_name),
    customer_phone = EXCLUDED.customer_phone,
    wilaya_id = COALESCE(EXCLUDED.wilaya_id, public.abandoned_orders.wilaya_id),
    wilaya_name = COALESCE(EXCLUDED.wilaya_name, public.abandoned_orders.wilaya_name),
    commune = COALESCE(EXCLUDED.commune, public.abandoned_orders.commune),
    delivery_type = EXCLUDED.delivery_type,
    subtotal = EXCLUDED.subtotal,
    shipping_fee = EXCLUDED.shipping_fee,
    total = EXCLUDED.total,
    updated_at = now()
  WHERE public.abandoned_orders.status <> 'recovered'
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_abandoned_order(
  p_store_id UUID, p_session_id TEXT, p_order_number TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.abandoned_orders
  SET status = 'recovered',
      recovered_order_number = COALESCE(NULLIF(trim(COALESCE(p_order_number, '')), ''), recovered_order_number),
      updated_at = now()
  WHERE store_id = p_store_id AND session_id = trim(COALESCE(p_session_id, ''));
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_abandoned_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_abandoned_order(UUID, TEXT, TEXT) TO anon, authenticated;
COMMIT;`;

export const ORDERS_SQL_MIGRATION_SNIPPET = `BEGIN;
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION public.owns_store(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id UUID,
  ADD COLUMN IF NOT EXISTS landing_page_id UUID,
  ADD COLUMN IF NOT EXISTS bundle_label TEXT,
  ADD COLUMN IF NOT EXISTS commune TEXT,
  ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'home',
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS courier_provider TEXT,
  ADD COLUMN IF NOT EXISTS courier_label_url TEXT,
  ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores') THEN
    UPDATE public.orders
    SET store_id = (SELECT id FROM public.stores ORDER BY created_at ASC LIMIT 1)
    WHERE store_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_owner_delete ON public.orders;
CREATE POLICY orders_owner_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.owns_store(public.orders.store_id) OR public.is_admin());
GRANT DELETE ON TABLE public.orders TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_orders(p_store_id UUID, p_order_ids UUID[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted INTEGER := 0;
BEGIN
  IF NOT (public.owns_store(p_store_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'غير مصرح لك بحذف طلبات هذا المتجر';
  END IF;
  DELETE FROM public.orders WHERE store_id = p_store_id AND id = ANY(p_order_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_order_from_sheet(
  p_store_id UUID, p_order_number TEXT, p_customer_name TEXT, p_customer_phone TEXT,
  p_wilaya_id TEXT, p_wilaya_name TEXT, p_commune TEXT DEFAULT NULL,
  p_delivery_type TEXT DEFAULT 'home', p_address TEXT DEFAULT '',
  p_bundle_label TEXT DEFAULT 'طلب من Google Sheet', p_subtotal NUMERIC DEFAULT 0,
  p_shipping_fee NUMERIC DEFAULT 0, p_total NUMERIC DEFAULT 0, p_status TEXT DEFAULT 'new',
  p_tracking_code TEXT DEFAULT NULL, p_landing_page_id UUID DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order_num TEXT; v_wilaya_id TEXT; v_status TEXT; v_delivery TEXT; v_id UUID;
BEGIN
  IF NOT (public.owns_store(p_store_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'غير مصرح لك باستيراد طلبات لهذا المتجر';
  END IF;
  v_order_num := upper(trim(regexp_replace(COALESCE(p_order_number, ''), '^#', '')));
  IF v_order_num = '' THEN RAISE EXCEPTION 'رقم الطلب غير صالح'; END IF;
  SELECT id INTO v_id FROM public.orders WHERE upper(trim(order_number)) = v_order_num LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_id, 'orderNumber', v_order_num, 'existing', true); END IF;
  v_wilaya_id := CASE WHEN EXISTS (SELECT 1 FROM public.wilayas WHERE id = p_wilaya_id) THEN p_wilaya_id ELSE '16' END;
  v_status := CASE WHEN p_status IN ('new','confirmed','shipping','delivered','cancelled') THEN p_status ELSE 'new' END;
  v_delivery := CASE WHEN p_delivery_type = 'stop' THEN 'stop' ELSE 'home' END;
  INSERT INTO public.orders (
    order_number, store_id, landing_page_id, bundle_label, customer_name, customer_phone,
    wilaya_id, wilaya_name, commune, delivery_type, address, items, subtotal, shipping_fee, total,
    status, tracking_code, status_history, payment_method, notes, created_at
  ) VALUES (
    v_order_num, p_store_id, p_landing_page_id,
    left(COALESCE(NULLIF(trim(p_bundle_label), ''), 'طلب من Google Sheet'), 200),
    left(COALESCE(NULLIF(trim(p_customer_name), ''), 'زبون Google Sheet'), 100),
    left(COALESCE(NULLIF(trim(p_customer_phone), ''), '0000000000'), 30),
    v_wilaya_id, left(COALESCE(NULLIF(trim(p_wilaya_name), ''), 'الجزائر العاصمة'), 100),
    NULLIF(left(trim(COALESCE(p_commune, '')), 120), ''), v_delivery,
    left(COALESCE(NULLIF(trim(p_address), ''), COALESCE(p_wilaya_name, 'الجزائر العاصمة')), 250),
    jsonb_build_array(jsonb_build_object('productId', COALESCE(p_landing_page_id::text, 'sheet_import'), 'title', left(COALESCE(NULLIF(trim(p_bundle_label), ''), 'طلب من Google Sheet'), 200), 'price', GREATEST(0, COALESCE(p_subtotal, p_total, 0)), 'quantity', 1, 'variantText', left(COALESCE(NULLIF(trim(p_bundle_label), ''), 'طلب من Google Sheet'), 200))),
    GREATEST(0, COALESCE(p_subtotal, 0)), GREATEST(0, COALESCE(p_shipping_fee, 0)),
    GREATEST(0, COALESCE(p_total, COALESCE(p_subtotal, 0) + COALESCE(p_shipping_fee, 0))),
    v_status, NULLIF(left(trim(COALESCE(p_tracking_code, '')), 120), ''),
    jsonb_build_array(jsonb_build_object('status', v_status, 'timestamp', COALESCE(p_created_at, now()), 'note', 'تم استيراد الطلب تلقائياً من Google Sheet')),
    'cod', 'مستورد من Google Sheet', COALESCE(p_created_at, now())
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'orderNumber', v_order_num);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_orders(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_order_from_sheet(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated;
COMMIT;`;

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
        costPrice: 950,
        isDefault: false
      },
      {
        id: 'pack2',
        title: 'عرض القطعتين (باك المطبخ والحمام)',
        subtitle: 'قطعتين لتغطية المنزل بالكامل',
        quantity: 2,
        price: 3300,
        costPrice: 1750,
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
        costPrice: 3300,
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
        costPrice: 1400,
        comparePrice: 3400,
        isDefault: false
      },
      {
        id: 'shelf2',
        title: 'باك التنظيم الكامل (قطعتين)',
        subtitle: 'رف رئيسي + رف إضافي للحمام أو المطبخ',
        quantity: 2,
        price: 4900,
        costPrice: 2500,
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
        costPrice: 3500,
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
    customDomain: row.custom_domain ? normalizeDomainHost(row.custom_domain) : '',
    description: row.description || '',
    announcementText: row.announcement_text || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
    logoUrl: row.logo_url,
    brandColor: row.brand_color || '#754b2d',
    storefrontTheme: row.storefront_theme === 'light' ? 'light' : 'dark',
    storefrontHeadingFont: row.storefront_heading_font || 'reem-kufi',
    storefrontBodyFont: row.storefront_body_font || 'plex-arabic',
    freeShippingThreshold: Number(row.free_shipping_threshold || 0),
    planId: row.plan_id || 'plan_pro',
    status: row.status || 'active',
    phone: row.phone || '',
    defaultWhatsapp: row.default_whatsapp || row.phone || '',
    defaultPixelId: row.default_pixel_id || '',
    tiktokPixelId: row.tiktok_pixel_id || '',
    googleSheetWebhook: row.google_sheet_webhook || '',
    customWilayaFees: row.custom_wilaya_fees || {},
    customWilayaRates: row.custom_wilaya_rates || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDbLandingPage(row: any): LandingPage {
  const theme = row.theme && row.theme.primaryColor ? row.theme : LANDING_THEME_PRESETS[0];
  const integrations = row.integrations || {};
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
    variants: Array.isArray(row.variants)
      ? row.variants
      : Array.isArray(integrations.variants)
      ? integrations.variants
      : [],
    reviews: Array.isArray(row.reviews)
      ? row.reviews
      : Array.isArray(integrations.reviews)
      ? integrations.reviews
      : [],
    theme,
    integrations,
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

function getLocalOrderCourierMetaMap(): Record<string, { provider?: string; labelUrl?: string }> {
  try {
    const raw = localStorage.getItem(ORDER_COURIER_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function mapDbOrder(row: any): Order {
  const localMeta = getLocalOrderCourierMetaMap()[row.id];
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
    courierProvider: row.courier_provider || localMeta?.provider || undefined,
    courierLabelUrl: row.courier_label_url || localMeta?.labelUrl || undefined,
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
    if (!clean) return undefined;
    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .ilike('subdomain', clean)
        .maybeSingle();
      if (error) throw error;
      if (!data) return undefined;
      return mapDbStore(data);
    }
    return this.getLocalStores().find(s => s.subdomain.toLowerCase() === clean);
  }

  async getStoreByCustomDomain(hostname: string): Promise<Store | undefined> {
    const bareHost = normalizeDomainHost(hostname);
    if (!bareHost || isPlatformDefaultHost(bareHost)) return undefined;

    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .or(`custom_domain.ilike.${bareHost},custom_domain.ilike.www.${bareHost}`)
        .limit(1)
        .maybeSingle();
      if (error) {
        // Gracefully ignore if custom_domain column isn't migrated yet
        const msg = (error.message || '').toLowerCase();
        if (error.code === '42703' || msg.includes('custom_domain') || msg.includes('does not exist')) {
          return undefined;
        }
        console.warn('getStoreByCustomDomain error:', error.message);
        return undefined;
      }
      return data ? mapDbStore(data) : undefined;
    }

    return this.getLocalStores().find(
      s => normalizeDomainHost(s.customDomain) === bareHost
    );
  }

  async resolveStoreForRequest(options?: {
    hostname?: string;
    subdomainHint?: string;
  }): Promise<{
    store?: Store;
    matchedBy?: 'custom_domain' | 'query_subdomain' | 'subdomain' | 'primary';
    customDomainUnmapped?: boolean;
    error?: string;
  }> {
    const host =
      options?.hostname ||
      (typeof window !== 'undefined' ? window.location.hostname : '');
    const bareHost = normalizeDomainHost(host);

    // 1. Highest priority: independent custom domain mapped to a specific store
    if (bareHost && !isPlatformDefaultHost(bareHost)) {
      const byDomain = await this.getStoreByCustomDomain(bareHost);
      if (byDomain) {
        return { store: byDomain, matchedBy: 'custom_domain' };
      }
      // Fall back to primary store so an unmapped custom domain still renders safely
      const primaryRes = await this.getPrimaryStoreDetailed();
      if (primaryRes.error) return { error: primaryRes.error };
      return {
        store: primaryRes.store,
        matchedBy: 'primary',
        customDomainUnmapped: true
      };
    }

    // 2. Explicit ?store=<subdomain> query parameter (for previewing multiple stores on platform host)
    const querySub = extractStoreSubdomainFromLocation();
    if (querySub) {
      const byQuery = await this.getStoreBySubdomain(querySub);
      if (byQuery) {
        return { store: byQuery, matchedBy: 'query_subdomain' };
      }
    }

    // 3. Explicit subdomain hint (e.g. merchant previewing their own store)
    if (options?.subdomainHint) {
      const byHint = await this.getStoreBySubdomain(options.subdomainHint);
      if (byHint) {
        return { store: byHint, matchedBy: 'subdomain' };
      }
    }

    // 4. Default primary store
    const primaryRes = await this.getPrimaryStoreDetailed();
    if (primaryRes.error) return { error: primaryRes.error };
    return { store: primaryRes.store, matchedBy: 'primary' };
  }

  async saveStore(
    store: Store
  ): Promise<{ success: boolean; error?: string; store?: Store; needsDomainSql?: boolean }> {
    const cleanDomain = normalizeDomainHost(store.customDomain) || '';

    if (this.useSupabase() && supabase) {
      if (store.id && isUuid(store.id)) {
        const basePayload: any = {
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

        const updatePayload: any = {
          ...basePayload,
          custom_domain: cleanDomain || null,
          storefront_theme: store.storefrontTheme === 'light' ? 'light' : 'dark',
          storefront_heading_font: store.storefrontHeadingFont || 'reem-kufi',
          storefront_body_font: store.storefrontBodyFont || 'plex-arabic'
        };

        let { data, error } = await supabase
          .from('stores')
          .update(updatePayload)
          .eq('id', store.id)
          .select()
          .single();

        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (error.code === '23505' || msg.includes('idx_stores_custom_domain_unique')) {
            return {
              success: false,
              error: 'هذا النطاق مستخدم بالفعل في متجر آخر على المنصة، اختر نطاقاً مختلفاً.'
            };
          }
          if (error.code === '42703' || error.code === '42501' || msg.includes('custom_domain') || msg.includes('storefront_theme') || msg.includes('storefront_heading_font') || msg.includes('storefront_body_font')) {
            // Self-healing fallback: save all other settings without failing, and prompt merchant to run 4-line SQL
            const retry = await supabase
              .from('stores')
              .update(basePayload)
              .eq('id', store.id)
              .select()
              .single();
            if (retry.error) return { success: false, error: retry.error.message };
            return {
              success: true,
              store: { ...mapDbStore(retry.data), customDomain: cleanDomain },
              needsDomainSql: Boolean(cleanDomain)
            };
          }
          return { success: false, error: error.message };
        }
        return { success: true, store: mapDbStore(data) };
      } else {
        const baseInsert: any = {
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

        const insertPayload: any = cleanDomain
          ? { ...baseInsert, custom_domain: cleanDomain }
          : baseInsert;

        let { data, error } = await supabase
          .from('stores')
          .insert(insertPayload)
          .select()
          .single();

        if (error && (error.code === '42703' || (error.message || '').toLowerCase().includes('custom_domain'))) {
          const retry = await supabase
            .from('stores')
            .insert(baseInsert)
            .select()
            .single();
          if (retry.error) return { success: false, error: retry.error.message };
          return {
            success: true,
            store: { ...mapDbStore(retry.data), customDomain: cleanDomain },
            needsDomainSql: Boolean(cleanDomain)
          };
        }

        if (error) return { success: false, error: error.message };
        return { success: true, store: mapDbStore(data) };
      }
    }

    const stores = this.getLocalStores();
    const normalizedStore: Store = {
      ...store,
      customDomain: cleanDomain,
      updatedAt: new Date().toISOString()
    };
    const idx = stores.findIndex(s => s.id === store.id);
    if (idx >= 0) {
      stores[idx] = normalizedStore;
    } else {
      stores.push(normalizedStore);
    }
    localStorage.setItem(STORES_KEY, JSON.stringify(stores));
    return { success: true, store: normalizedStore };
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

    const normalizedIntegrations = {
      ...(page.integrations || {}),
      variants: page.variants || [],
      reviews: page.reviews || []
    };

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
        integrations: normalizedIntegrations,
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
        const cleanIntegrations = {
          ...(tpl.integrations || {}),
          pixelId: '',
          tiktokPixelId: '',
          whatsappNumber: '',
          googleSheetWebhook: ''
        };
        const res = await this.saveLandingPage({
          ...tpl,
          id: '',
          storeId,
          integrations: cleanIntegrations
        });
        if (!res.success && res.error?.toLowerCase().includes('duplicate')) {
          await this.saveLandingPage({
            ...tpl,
            id: '',
            storeId,
            slug: `${tpl.slug}-${suffix}`,
            integrations: cleanIntegrations
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
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return [];
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
    variantLabel?: string;
    promoCode?: string;
    discount?: number;
    discountReason?: string;
    antiBot?: { honeypot?: string; fillTimeMs?: number };
  }): Promise<{ success: boolean; error?: string; order?: Order }> {
    // Reject obvious bot traps immediately before any network/DB calls
    if (params.antiBot?.honeypot && params.antiBot.honeypot.trim().length > 0) {
      return {
        success: false,
        error: 'تعذر التحقق من صحة الطلب، يرجى إعادة تحميل الصفحة والمحاولة مجدداً'
      };
    }

    const nameCheck = validateCustomerName(params.customerName);
    if (!nameCheck.valid) {
      return { success: false, error: nameCheck.error || 'يرجى إدخال الاسم الكامل بشكل صحيح' };
    }
    const phoneCheck = validateAlgerianPhone(params.customerPhone);
    if (!phoneCheck.valid) {
      return {
        success: false,
        error: phoneCheck.error || 'يرجى إدخال رقم هاتف جزائري حقيقي (10 أرقام يبدأ بـ 05 أو 06 أو 07)'
      };
    }
    const cleanCustomerName = nameCheck.cleaned;
    const cleanCustomerPhone = phoneCheck.normalized;

    const deliveryType: DeliveryType = params.deliveryType === 'stop' ? 'stop' : 'home';
    const noteParts = [
      params.notes?.trim() || '',
      params.variantLabel?.trim() ? `المواصفات: ${params.variantLabel.trim()}` : '',
      params.promoCode?.trim()
        ? `كوبون خصم: ${params.promoCode.trim().toUpperCase()}${params.discount ? ` (-${params.discount} دج)` : ''}`
        : ''
    ].filter(Boolean);
    const mergedNotes = noteParts.length > 0 ? noteParts.join(' | ').slice(0, 480) : undefined;

    // Anti-Fraud COD Check (Local config + Server Endpoint)
    const canonicalPhone = normalizePhoneCanonical(cleanCustomerPhone);
    const localCfg = this.getLocalApiConfigsMap()[params.storeId];
    if (localCfg && localCfg.antiFraudEnabled !== false && canonicalPhone.length >= 9) {
      const blocked = (localCfg.blacklistedPhones || []).some(
        entry => normalizePhoneCanonical(entry?.phone) === canonicalPhone
      );
      if (blocked) {
        return {
          success: false,
          error: 'عذراً، تعذر تأكيد تسجيل الطلب لهذا الرقم حالياً. يرجى التواصل معنا عبر واتساب للمساعدة.'
        };
      }
      const dailyLimit = Number(localCfg.dailyMaxOrdersPerPhone ?? 2);
      if (dailyLimit > 0 && !this.useSupabase()) {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentSamePhone = this.getLocalOrders(params.storeId).filter(
          o =>
            o.status !== 'cancelled' &&
            new Date(o.createdAt).getTime() >= dayAgo &&
            normalizePhoneCanonical(o.customerPhone) === canonicalPhone
        ).length;
        if (recentSamePhone >= dailyLimit) {
          return {
            success: false,
            error: `تم بلوغ الحد الأقصى للطلبات المسموح بها لهذا الرقم اليوم (${dailyLimit} طلب خلال 24 ساعة). يمكنك متابعة أو تعديل طلبك السابق عبر صفحة التتبع.`
          };
        }
      }
    }

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const fraudRes = await fetch('/api/orders/fraud-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: params.storeId,
          phone: cleanCustomerPhone,
          customerName: cleanCustomerName,
          honeypot: params.antiBot?.honeypot || '',
          fillTimeMs: params.antiBot?.fillTimeMs,
          record: true
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (fraudRes.ok) {
        const fraudJson = await fraudRes.json();
        if (fraudJson && fraudJson.allowed === false) {
          return {
            success: false,
            error:
              fraudJson.message ||
              'عذراً، تعذر تسجيل الطلب لهذا الرقم حالياً. يرجى التواصل مع خدمة الزبائن.'
          };
        }
      }
    } catch {
      // Non-fatal if server endpoint unreachable
    }

    if (this.useSupabase() && supabase && isUuid(params.storeId)) {
      const { data, error } = await supabase.rpc('place_order', {
        p_store_id: params.storeId,
        p_customer_name: cleanCustomerName,
        p_customer_phone: cleanCustomerPhone,
        p_wilaya_id: params.wilayaId,
        p_wilaya_name: params.wilayaName,
        p_address: params.address,
        p_items: params.items || [],
        p_notes: mergedNotes || null,
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
          customerPhone: cleanCustomerPhone,
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
    const cleanPhone = cleanCustomerPhone;

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

      const discountVal = Math.max(0, Math.min(offer.price, Number(params.discount) || 0));
      subtotal = Math.max(0, offer.price - discountVal);
      const variantSuffix = params.variantLabel?.trim() ? ` [${params.variantLabel.trim()}]` : '';
      bundleLabel = `${offer.title}${variantSuffix} (الكمية: ${bundleQty})`;
      orderItems = [
        {
          productId: page.id,
          title: page.title,
          price: subtotal,
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
      const rawSubtotal = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const discountVal = Math.max(0, Math.min(rawSubtotal, Number(params.discount) || 0));
      subtotal = Math.max(0, rawSubtotal - discountVal);
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
      notes: mergedNotes,
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
    trackingCode?: string,
    courierMeta?: { provider?: string; labelUrl?: string }
  ): Promise<{ success: boolean; error?: string }> {
    if (courierMeta?.provider || courierMeta?.labelUrl) {
      try {
        const metaMap = getLocalOrderCourierMetaMap();
        metaMap[orderId] = {
          provider: courierMeta.provider || metaMap[orderId]?.provider,
          labelUrl: courierMeta.labelUrl || metaMap[orderId]?.labelUrl
        };
        localStorage.setItem(ORDER_COURIER_META_KEY, JSON.stringify(metaMap));
      } catch {
        // ignore storage quota errors
      }
    }

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

      if (courierMeta?.provider || courierMeta?.labelUrl) {
        await supabase
          .from('orders')
          .update({
            courier_provider: courierMeta.provider || null,
            courier_label_url: courierMeta.labelUrl || null
          })
          .eq('id', orderId);
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
    if (courierMeta?.provider) order.courierProvider = courierMeta.provider;
    if (courierMeta?.labelUrl) order.courierLabelUrl = courierMeta.labelUrl;
    order.statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: note || `تحديث الحالة`
    });
    order.updatedAt = new Date().toISOString();
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
    return { success: true };
  }

  async updateOrderDetails(params: {
    orderNumber: string;
    offerId?: string;
    bundleLabel?: string;
    wilayaId?: string;
    commune?: string;
    deliveryType?: DeliveryType;
    allowCustomBundle?: boolean;
  }): Promise<{
    success: boolean;
    error?: string;
    updated?: {
      orderNumber: string;
      landingPageId?: string;
      bundleLabel: string;
      wilayaId: string;
      wilayaName: string;
      commune: string;
      deliveryType: DeliveryType;
      subtotal: number;
      shippingFee: number;
      total: number;
      status: OrderStatus;
    };
  }> {
    const cleanNum = params.orderNumber.trim().toUpperCase();
    if (!cleanNum) {
      return { success: false, error: 'رقم الطلب غير صحيح' };
    }

    if (this.useSupabase() && supabase) {
      const { data, error } = await supabase.rpc('update_order_details', {
        p_order_number: cleanNum,
        p_offer_id: params.offerId || null,
        p_bundle_label: params.bundleLabel || null,
        p_wilaya_id: params.wilayaId || null,
        p_commune: params.commune !== undefined ? params.commune : null,
        p_delivery_type: params.deliveryType || null
      });
      if (error) {
        console.error('Supabase update_order_details RPC error:', error);
        return { success: false, error: error.message };
      }
      return {
        success: true,
        updated: {
          orderNumber: data.orderNumber,
          landingPageId: data.landingPageId || undefined,
          bundleLabel: data.bundleLabel,
          wilayaId: data.wilayaId,
          wilayaName: data.wilayaName,
          commune: data.commune || '',
          deliveryType: data.deliveryType === 'stop' ? 'stop' : 'home',
          subtotal: Number(data.subtotal),
          shippingFee: Number(data.shippingFee),
          total: Number(data.total),
          status: data.status
        }
      };
    }

    // Local fallback
    const all = this.getLocalOrders();
    const order = all.find(o => o.orderNumber.toUpperCase() === cleanNum);
    if (!order) return { success: false, error: 'الطلب غير موجود' };
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return { success: false, error: 'لا يمكن تعديل طلب مسلم أو ملغي' };
    }
    if (!params.allowCustomBundle && order.status !== 'new') {
      return { success: false, error: 'يمكن تعديل العرض أو الوجهة فقط عندما يكون الطلب قيد التأكيد' };
    }

    const store = this.getLocalStores().find(s => s.id === order.storeId) || this.getLocalStores()[0];
    let subtotal = order.subtotal;
    let bundleLabel = order.bundleLabel || order.items[0]?.title || '';

    if (params.offerId && order.landingPageId) {
      const pages = this.getLocalLandingPages();
      const page = pages.find(p => p.id === order.landingPageId);
      if (!page) return { success: false, error: 'صفحة المنتج غير موجودة' };
      const offer = page.offers.find(o => o.id === params.offerId);
      if (!offer) return { success: false, error: 'العرض المختار غير موجود' };

      const match = order.bundleLabel?.match(/الكمية:\s*(\d+)/);
      const oldQty = match ? Math.max(1, parseInt(match[1], 10)) : 1;
      const newQty = Math.max(1, offer.quantity || 1);
      const delta = newQty - oldQty;
      if (delta > 0 && page.stock < delta) {
        return { success: false, error: `عذراً، الكمية المتوفرة حالياً هي ${page.stock} قطع فقط` };
      }
      if (delta !== 0) {
        page.stock = Math.max(0, page.stock - delta);
        page.updatedAt = new Date().toISOString();
        localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(pages));
      }

      subtotal = offer.price;
      bundleLabel = `${offer.title} (الكمية: ${newQty})`;
      order.items = [
        {
          productId: page.id,
          title: page.title,
          price: offer.price,
          quantity: 1,
          variantText: bundleLabel,
          imageUrl: page.mainImage
        }
      ];
    } else if (params.allowCustomBundle && params.bundleLabel && params.bundleLabel.trim()) {
      bundleLabel = params.bundleLabel.trim();
      if (order.items.length > 0) {
        order.items[0] = { ...order.items[0], variantText: bundleLabel };
      }
    }

    const wilaya =
      ALGERIA_WILAYAS.find(w => w.id === (params.wilayaId || order.wilayaId)) || ALGERIA_WILAYAS[15];
    const deliveryType: DeliveryType =
      (params.deliveryType || order.deliveryType) === 'stop' ? 'stop' : 'home';
    const commune = params.commune !== undefined ? params.commune.trim() : order.commune || '';

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

    order.bundleLabel = bundleLabel;
    order.subtotal = subtotal;
    order.wilayaId = wilaya.id;
    order.wilayaName = wilaya.nameAr;
    order.commune = commune;
    order.deliveryType = deliveryType;
    order.address = `${wilaya.nameAr}${commune ? ' - ' + commune : ''}${
      deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''
    }`;
    order.shippingFee = shippingFee;
    order.total = subtotal + shippingFee;
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({
      status: order.status,
      timestamp: order.updatedAt,
      note: `تعديل العرض/الوجهة: ${bundleLabel} | ${wilaya.nameAr}${commune ? ' - ' + commune : ''}`
    });

    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
    return {
      success: true,
      updated: {
        orderNumber: order.orderNumber,
        landingPageId: order.landingPageId,
        bundleLabel,
        wilayaId: wilaya.id,
        wilayaName: wilaya.nameAr,
        commune,
        deliveryType,
        subtotal,
        shippingFee,
        total: order.total,
        status: order.status
      }
    };
  }

  async syncOrderFromSheet(params: {
    orderId: string;
    status?: OrderStatus;
    trackingCode?: string;
    bundleLabel?: string;
    wilayaId?: string;
    wilayaName?: string;
    commune?: string;
    deliveryType?: DeliveryType;
    subtotal?: number;
    shippingFee?: number;
    total?: number;
    customerName?: string;
    customerPhone?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (this.useSupabase() && supabase && isUuid(params.orderId)) {
      const { error } = await supabase.rpc('sync_order_from_sheet', {
        p_order_id: params.orderId,
        p_status: params.status || null,
        p_tracking_code: params.trackingCode !== undefined ? params.trackingCode : null,
        p_bundle_label: params.bundleLabel !== undefined ? params.bundleLabel : null,
        p_wilaya_id: params.wilayaId || null,
        p_wilaya_name: params.wilayaName !== undefined ? params.wilayaName : null,
        p_commune: params.commune !== undefined ? params.commune : null,
        p_delivery_type: params.deliveryType || null,
        p_subtotal: params.subtotal !== undefined ? params.subtotal : null,
        p_shipping_fee: params.shippingFee !== undefined ? params.shippingFee : null,
        p_total: params.total !== undefined ? params.total : null,
        p_customer_name: params.customerName !== undefined ? params.customerName : null,
        p_customer_phone: params.customerPhone !== undefined ? params.customerPhone : null
      });
      if (error) {
        console.error('Supabase sync_order_from_sheet RPC error:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    const all = this.getLocalOrders();
    const order = all.find(o => o.id === params.orderId);
    if (!order) return { success: false, error: 'الطلب غير موجود' };

    const nextStatus = params.status || order.status;
    if (order.landingPageId) {
      const pages = this.getLocalLandingPages();
      const page = pages.find(p => p.id === order.landingPageId);
      if (page) {
        const match = order.bundleLabel?.match(/الكمية:\s*(\d+)/);
        const qty = match ? parseInt(match[1], 10) : 1;
        if (order.status !== 'cancelled' && nextStatus === 'cancelled') {
          page.stock += qty;
        } else if (order.status === 'cancelled' && nextStatus !== 'cancelled') {
          page.stock = Math.max(0, page.stock - qty);
        }
        localStorage.setItem(LANDING_PAGES_KEY, JSON.stringify(pages));
      }
    }

    order.status = nextStatus;
    if (params.trackingCode !== undefined) {
      order.trackingCode = params.trackingCode.trim() || undefined;
    }
    if (params.bundleLabel !== undefined && params.bundleLabel.trim()) {
      order.bundleLabel = params.bundleLabel.trim();
      if (order.items.length > 0) {
        order.items[0] = {
          ...order.items[0],
          variantText: order.bundleLabel,
          price: params.subtotal !== undefined ? params.subtotal : order.items[0].price
        };
      }
    }
    if (params.wilayaId) order.wilayaId = params.wilayaId;
    if (params.wilayaName !== undefined && params.wilayaName.trim()) {
      order.wilayaName = params.wilayaName.trim();
    }
    if (params.commune !== undefined) order.commune = params.commune.trim();
    if (params.deliveryType) order.deliveryType = params.deliveryType;
    if (params.subtotal !== undefined) order.subtotal = Math.max(0, params.subtotal);
    if (params.shippingFee !== undefined) order.shippingFee = Math.max(0, params.shippingFee);
    if (params.total !== undefined) {
      order.total = Math.max(0, params.total);
    } else {
      order.total = order.subtotal + order.shippingFee;
    }
    if (params.customerName !== undefined && params.customerName.trim()) {
      order.customerName = params.customerName.trim();
    }
    if (params.customerPhone !== undefined && params.customerPhone.trim()) {
      order.customerPhone = params.customerPhone.trim();
    }
    order.address = `${order.wilayaName}${order.commune ? ' - ' + order.commune : ''}${
      order.deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''
    }`;
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({
      status: order.status,
      timestamp: order.updatedAt,
      note: 'مزامنة التعديلات من Google Sheet'
    });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
    return { success: true };
  }

  getDeletedSheetOrderNumbers(storeId: string): Set<string> {
    try {
      const raw = localStorage.getItem(`${DELETED_SHEET_ORDERS_KEY}_${storeId}`);
      const list = raw ? JSON.parse(raw) : [];
      return new Set(
        Array.isArray(list) ? list.map((x: unknown) => String(x || '').trim().toUpperCase()).filter(Boolean) : []
      );
    } catch {
      return new Set();
    }
  }

  rememberDeletedSheetOrderNumbers(storeId: string, orderNumbers: string[]): void {
    try {
      const existing = this.getDeletedSheetOrderNumbers(storeId);
      orderNumbers.forEach(num => {
        const clean = String(num || '').replace(/^#/, '').trim().toUpperCase();
        if (clean) existing.add(clean);
      });
      const trimmed = Array.from(existing).slice(-500);
      localStorage.setItem(`${DELETED_SHEET_ORDERS_KEY}_${storeId}`, JSON.stringify(trimmed));
    } catch {
      // ignore storage errors
    }
  }

  async importOrdersFromSheet(
    storeId: string,
    rows: SheetOrderRow[],
    landingPages: LandingPage[] = []
  ): Promise<{ success: boolean; importedCount: number; error?: string; needsSqlMigration?: boolean }> {
    if (!storeId || !Array.isArray(rows) || rows.length === 0) {
      return { success: true, importedCount: 0 };
    }

    const validRows = rows.filter(row =>
      isRealSheetOrderRow({
        fullName: row.fullName,
        phone: row.phone,
        wilaya: row.wilaya,
        orderName: row.orderName,
        total: row.total
      })
    );
    if (validRows.length === 0) {
      return { success: true, importedCount: 0 };
    }

    const prepared = validRows.map(row => {
      const cleanWilaya = (row.wilaya || '').trim();
      const matchedWilaya =
        (cleanWilaya
          ? ALGERIA_WILAYAS.find(
              w =>
                w.nameAr === cleanWilaya ||
                w.id === cleanWilaya.padStart(2, '0') ||
                cleanWilaya.includes(w.nameAr)
            )
          : undefined) || ALGERIA_WILAYAS[15];
      const deliveryType: DeliveryType = row.deliveryType === 'stop' ? 'stop' : 'home';
      const commune = (row.commune || '').trim();
      const bundleLabel = (row.orderName || '').trim() || 'طلب من Google Sheet';
      const matchedPage = landingPages.find(
        lp =>
          bundleLabel.includes(lp.title) ||
          lp.offers.some(o => bundleLabel.includes(o.title))
      );
      const shippingFee = Math.max(0, Number(row.shippingCost) || 0);
      const subtotal =
        row.productPrice > 0
          ? Math.max(0, row.productPrice - Math.max(0, row.discount || 0))
          : Math.max(0, (row.total || 0) - shippingFee);
      const total = row.total > 0 ? row.total : subtotal + shippingFee;
      const address = `${matchedWilaya.nameAr}${commune ? ' - ' + commune : ''}${
        deliveryType === 'stop' ? ' (مكتب الشحن Stop Desk)' : ''
      }`;

      return {
        orderNumber: row.orderId.replace(/^#/, '').trim().toUpperCase(),
        landingPageId: matchedPage?.id,
        customerName: (row.fullName || '').trim() || 'زبون Google Sheet',
        customerPhone: (row.phone || '').trim() || '0000000000',
        wilayaId: matchedWilaya.id,
        wilayaName: cleanWilaya || matchedWilaya.nameAr,
        commune,
        deliveryType,
        address,
        bundleLabel,
        subtotal,
        shippingFee,
        total,
        status: row.status || ('new' as OrderStatus),
        trackingCode: (row.trackingCode || '').trim() || undefined,
        createdAt: row.createdAt || row.sheetUpdatedAt || new Date().toISOString()
      };
    });

    if (this.useSupabase() && supabase && isUuid(storeId)) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (accessToken && typeof fetch !== 'undefined') {
        try {
          const res = await fetch('/api/orders/import-from-sheet', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ storeId, orders: prepared })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.ok) {
            return { success: true, importedCount: Number(data.importedCount) || 0 };
          }
          // Fall through to RPC only if server lacks service key
          if (data?.code !== 'missing_service_key') {
            return {
              success: false,
              importedCount: 0,
              error: data?.message || 'تعذر استيراد الطلبات من Google Sheet'
            };
          }
        } catch (err: any) {
          console.warn('Server import-from-sheet failed, trying RPC fallback:', err);
        }
      }

      // Fallback RPC if server service key is not configured
      let importedCount = 0;
      let lastError: string | undefined;
      for (const item of prepared) {
        const { error } = await supabase.rpc('import_order_from_sheet', {
          p_store_id: storeId,
          p_order_number: item.orderNumber,
          p_customer_name: item.customerName,
          p_customer_phone: item.customerPhone,
          p_wilaya_id: item.wilayaId,
          p_wilaya_name: item.wilayaName,
          p_commune: item.commune || null,
          p_delivery_type: item.deliveryType,
          p_address: item.address,
          p_bundle_label: item.bundleLabel,
          p_subtotal: item.subtotal,
          p_shipping_fee: item.shippingFee,
          p_total: item.total,
          p_status: item.status,
          p_tracking_code: item.trackingCode || null,
          p_landing_page_id: item.landingPageId && isUuid(item.landingPageId) ? item.landingPageId : null,
          p_created_at: item.createdAt
        });
        if (!error) importedCount += 1;
        else lastError = error.message;
      }

      if (importedCount > 0 || !lastError) {
        return { success: true, importedCount };
      }
      const isPermOrMissing =
        /permission denied|could not find the function|does not exist/i.test(lastError);
      return {
        success: false,
        importedCount: 0,
        needsSqlMigration: isPermOrMissing,
        error: isPermOrMissing
          ? 'يلزم تشغيل كود SQL التفعيل مرة واحدة في Supabase (SQL Editor) للسماح باستيراد وحذف الطلبات.'
          : `تعذر استيراد الطلبات الجديدة في Supabase: ${lastError}`
      };
    }

    // Local fallback
    const all = this.getLocalOrders();
    const existingNums = new Set(all.map(o => o.orderNumber.toUpperCase()));
    let importedCount = 0;

    for (const item of prepared) {
      if (existingNums.has(item.orderNumber)) continue;
      existingNums.add(item.orderNumber);
      const parsedTs = new Date(item.createdAt);
      const iso = Number.isNaN(parsedTs.getTime()) ? new Date().toISOString() : parsedTs.toISOString();
      const newOrd: Order = {
        id: 'ord_gs_' + Math.random().toString(36).substring(2, 10),
        orderNumber: item.orderNumber,
        storeId,
        landingPageId: item.landingPageId,
        bundleLabel: item.bundleLabel,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        wilayaId: item.wilayaId,
        wilayaName: item.wilayaName,
        commune: item.commune,
        deliveryType: item.deliveryType,
        address: item.address,
        items: [
          {
            productId: item.landingPageId || 'sheet_import',
            title: item.bundleLabel,
            price: item.subtotal || item.total,
            quantity: 1,
            variantText: item.bundleLabel
          }
        ],
        subtotal: item.subtotal,
        shippingFee: item.shippingFee,
        total: item.total,
        status: item.status,
        trackingCode: item.trackingCode,
        statusHistory: [
          {
            status: item.status,
            timestamp: iso,
            note: 'تم استيراد الطلب تلقائياً من Google Sheet'
          }
        ],
        paymentMethod: 'cod',
        notes: 'مستورد من Google Sheet',
        createdAt: iso,
        updatedAt: new Date().toISOString()
      };
      all.unshift(newOrd);
      importedCount += 1;
    }

    if (importedCount > 0) {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
    }
    return { success: true, importedCount };
  }

  async deleteOrders(
    storeId: string,
    orderIds: string[]
  ): Promise<{ success: boolean; deletedCount: number; error?: string; needsSqlMigration?: boolean }> {
    const cleanIds = Array.from(new Set(orderIds.map(id => String(id || '').trim()).filter(Boolean)));
    if (!storeId || cleanIds.length === 0) {
      return { success: false, deletedCount: 0, error: 'لم يتم تحديد أي طلب للحذف' };
    }

    if (this.useSupabase() && supabase && isUuid(storeId)) {
      const uuidIds = cleanIds.filter(id => isUuid(id));
      if (uuidIds.length === 0) {
        return { success: false, deletedCount: 0, error: 'معرّفات الطلبات غير صالحة' };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (accessToken && typeof fetch !== 'undefined') {
        try {
          const res = await fetch('/api/orders/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ storeId, orderIds: uuidIds })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.ok) {
            return { success: true, deletedCount: Number(data.deletedCount) || uuidIds.length };
          }
          if (data?.code !== 'missing_service_key') {
            return {
              success: false,
              deletedCount: 0,
              error: data?.message || 'تعذر حذف الطلبات من قاعدة البيانات'
            };
          }
        } catch (err: any) {
          console.warn('Server /api/orders/delete failed, trying Supabase fallback:', err);
        }
      }

      // Fallback 1: RPC delete_orders
      const rpcRes = await supabase.rpc('delete_orders', {
        p_store_id: storeId,
        p_order_ids: uuidIds
      });
      if (!rpcRes.error) {
        return { success: true, deletedCount: Number(rpcRes.data) || uuidIds.length };
      }

      // Fallback 2: Direct table delete (works if owner DELETE policy exists)
      const directRes = await supabase
        .from('orders')
        .delete()
        .eq('store_id', storeId)
        .in('id', uuidIds);
      if (!directRes.error) {
        return { success: true, deletedCount: uuidIds.length };
      }

      const rawErr = directRes.error.message || rpcRes.error.message || 'تعذر حذف الطلبات';
      const isPermOrMissing =
        /permission denied|could not find the function|does not exist/i.test(rawErr);
      return {
        success: false,
        deletedCount: 0,
        needsSqlMigration: isPermOrMissing,
        error: isPermOrMissing
          ? 'يلزم تشغيل كود SQL التفعيل مرة واحدة في Supabase (SQL Editor) لتفعيل صلاحية حذف واستيراد الطلبات.'
          : rawErr
      };
    }

    // Local fallback
    const all = this.getLocalOrders();
    const idSet = new Set(cleanIds);
    const remaining = all.filter(o => !(o.storeId === storeId && idSet.has(o.id)));
    const deletedCount = all.length - remaining.length;
    localStorage.setItem(ORDERS_KEY, JSON.stringify(remaining));
    return { success: true, deletedCount };
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
      landingPageId: order.landingPageId,
      customerFirstName: order.customerName.split(' ')[0],
      wilayaId: order.wilayaId,
      wilayaName: order.wilayaName,
      commune: order.commune,
      deliveryType: order.deliveryType || 'home',
      bundleLabel: order.bundleLabel || order.items[0]?.title || '',
      total: order.total,
      status: order.status,
      trackingCode: order.trackingCode,
      statusHistory: order.statusHistory,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
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

  // --- STORE API CONFIGURATIONS & DIAGNOSTICS ---
  createDefaultStoreApiConfig(store: Store): StoreApiConfig {
    return {
      storeId: store.id,
      courierProvider: 'none',
      courierApiId: '',
      courierApiToken: '',
      courierFromWilayaId: '16',
      courierFromWilayaName: 'الجزائر العاصمة',
      courierSenderName: store.name || '',
      courierBaseUrl: '',
      courierAutoSendOnConfirm: true,
      metaPixelId: store.defaultPixelId || '',
      metaCapiEnabled: false,
      metaCapiToken: '',
      metaTestEventCode: '',
      tiktokPixelId: store.tiktokPixelId || '',
      tiktokEventsEnabled: false,
      tiktokEventsToken: '',
      tiktokTestEventCode: '',
      whatsappProvider: 'none',
      whatsappApiUrl: '',
      whatsappInstance: '',
      whatsappPhoneNumberId: '',
      whatsappApiToken: '',
      whatsappTemplateName: '',
      whatsappAutoSendOnOrder: false,
      whatsappAutoSendOnShipping: false,
      googleSheetWebhook: store.googleSheetWebhook || '',
      adSpendTotal: 0,
      adSpendByPage: {},
      antiFraudEnabled: true,
      duplicateWindowHours: 24,
      dailyMaxOrdersPerPhone: 2,
      autoFlagReturnsThreshold: 2,
      blacklistedPhones: [],
      promoCoupons: [],
      whatsappConfirmTemplate: '',
      whatsappShippingTemplate: '',
      whatsappAbandonedTemplate: '',
      faviconUrl: '',
      diagnosticLogs: []
    };
  }

  getLocalStoreApiConfig(storeId: string): StoreApiConfig | undefined {
    return this.getLocalApiConfigsMap()[storeId];
  }

  private getLocalApiConfigsMap(): Record<string, StoreApiConfig> {
    try {
      const raw = localStorage.getItem(API_CONFIGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveLocalApiConfig(config: StoreApiConfig): void {
    try {
      const all = this.getLocalApiConfigsMap();
      all[config.storeId] = config;
      localStorage.setItem(API_CONFIGS_KEY, JSON.stringify(all));
    } catch {
      // ignore localStorage errors
    }
  }

  async getStoreApiConfig(store: Store): Promise<{ config: StoreApiConfig; needsSqlMigration?: boolean }> {
    const fallback = this.createDefaultStoreApiConfig(store);
    const localSaved = this.getLocalApiConfigsMap()[store.id];
    const baseMerged: StoreApiConfig = localSaved
      ? {
          ...fallback,
          ...localSaved,
          metaPixelId: localSaved.metaPixelId || store.defaultPixelId || '',
          tiktokPixelId: localSaved.tiktokPixelId || store.tiktokPixelId || '',
          googleSheetWebhook: localSaved.googleSheetWebhook || store.googleSheetWebhook || '',
          diagnosticLogs: Array.isArray(localSaved.diagnosticLogs) ? localSaved.diagnosticLogs : []
        }
      : fallback;

    if (this.useSupabase() && supabase && isUuid(store.id)) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        return { config: baseMerged };
      }
      const { data, error } = await supabase
        .from('store_api_configs')
        .select('*')
        .eq('store_id', store.id)
        .maybeSingle();

      if (error) {
        const msg = (error.message || '').toLowerCase();
        const missingTable =
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table');
        return { config: baseMerged, needsSqlMigration: missingTable };
      }

      if (data) {
        const dbCfg = (data.config || {}) as Partial<StoreApiConfig>;
        const merged: StoreApiConfig = {
          ...baseMerged,
          ...dbCfg,
          storeId: store.id,
          metaPixelId: dbCfg.metaPixelId || store.defaultPixelId || baseMerged.metaPixelId,
          tiktokPixelId: dbCfg.tiktokPixelId || store.tiktokPixelId || baseMerged.tiktokPixelId,
          googleSheetWebhook: dbCfg.googleSheetWebhook || store.googleSheetWebhook || baseMerged.googleSheetWebhook,
          diagnosticLogs: Array.isArray(data.diagnostic_logs) ? data.diagnostic_logs : baseMerged.diagnosticLogs,
          updatedAt: data.updated_at
        };
        this.saveLocalApiConfig(merged);
        return { config: merged };
      }
    }

    return { config: baseMerged };
  }

  async saveStoreApiConfig(
    config: StoreApiConfig
  ): Promise<{ success: boolean; error?: string; needsSqlMigration?: boolean }> {
    const cleanConfig: StoreApiConfig = {
      ...config,
      diagnosticLogs: (config.diagnosticLogs || []).slice(0, 30),
      updatedAt: new Date().toISOString()
    };
    this.saveLocalApiConfig(cleanConfig);

    // Sync server runtime cache so storefront CAPI / TikTok / auto-WhatsApp work server-side
    try {
      await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanConfig)
      });
    } catch {
      // non-fatal if running without server
    }

    if (this.useSupabase() && supabase && isUuid(cleanConfig.storeId)) {
      const { diagnosticLogs, ...configWithoutLogs } = cleanConfig;
      const { error } = await supabase.from('store_api_configs').upsert(
        {
          store_id: cleanConfig.storeId,
          config: configWithoutLogs,
          diagnostic_logs: diagnosticLogs,
          updated_at: cleanConfig.updatedAt
        },
        { onConflict: 'store_id' }
      );

      // Sync public tracking IDs & webhook to stores table cleanly
      await supabase
        .from('stores')
        .update({
          default_pixel_id: cleanConfig.metaPixelId || '',
          google_sheet_webhook: cleanConfig.googleSheetWebhook || ''
        })
        .eq('id', cleanConfig.storeId);

      // Best-effort sync of optional tiktok_pixel_id column if migrated
      await supabase
        .from('stores')
        .update({ tiktok_pixel_id: cleanConfig.tiktokPixelId || '' })
        .eq('id', cleanConfig.storeId);

      if (error) {
        const msg = (error.message || '').toLowerCase();
        const missingTable =
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table');
        if (missingTable) {
          return { success: true, needsSqlMigration: true };
        }
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  }

  async appendApiDiagnosticLog(store: Store, log: ApiDiagnosticLog): Promise<StoreApiConfig> {
    const { config } = await this.getStoreApiConfig(store);
    const nextConfig: StoreApiConfig = {
      ...config,
      diagnosticLogs: [log, ...(config.diagnosticLogs || [])].slice(0, 30)
    };
    await this.saveStoreApiConfig(nextConfig);
    return nextConfig;
  }

  // --- ABANDONED ORDERS CAPTURE & RECOVERY ---
  private getLocalAbandonedOrders(): AbandonedOrder[] {
    try {
      const raw = localStorage.getItem(ABANDONED_ORDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveLocalAbandonedOrders(list: AbandonedOrder[]): void {
    try {
      localStorage.setItem(ABANDONED_ORDERS_KEY, JSON.stringify(list.slice(0, 400)));
    } catch {
      // ignore localStorage errors
    }
  }

  private mapSupabaseAbandonedRow(r: any): AbandonedOrder {
    const validStatus: AbandonedOrderStatus =
      r.status === 'contacted' || r.status === 'recovered' || r.status === 'dismissed'
        ? r.status
        : 'new';
    return {
      id: String(r.id || r.session_id || ''),
      sessionId: String(r.session_id || r.id || ''),
      storeId: String(r.store_id || ''),
      landingPageId: r.landing_page_id ? String(r.landing_page_id) : undefined,
      landingPageTitle: r.landing_page_title ? String(r.landing_page_title) : undefined,
      offerId: r.offer_id ? String(r.offer_id) : undefined,
      bundleLabel: r.bundle_label ? String(r.bundle_label) : undefined,
      variantLabel: r.variant_label ? String(r.variant_label) : undefined,
      customerName: r.customer_name ? String(r.customer_name) : undefined,
      customerPhone: String(r.customer_phone || ''),
      wilayaId: r.wilaya_id ? String(r.wilaya_id) : undefined,
      wilayaName: r.wilaya_name ? String(r.wilaya_name) : undefined,
      commune: r.commune ? String(r.commune) : undefined,
      deliveryType: r.delivery_type === 'stop' ? 'stop' : 'home',
      subtotal: Number(r.subtotal) || 0,
      shippingFee: Number(r.shipping_fee) || 0,
      total: Number(r.total) || 0,
      status: validStatus,
      recoveredOrderNumber: r.recovered_order_number ? String(r.recovered_order_number) : undefined,
      contactedAt: r.contacted_at ? String(r.contacted_at) : undefined,
      notes: r.notes ? String(r.notes) : undefined,
      createdAt: String(r.created_at || new Date().toISOString()),
      updatedAt: String(r.updated_at || r.created_at || new Date().toISOString())
    };
  }

  async captureAbandonedOrder(
    params: {
      storeId: string;
      sessionId: string;
      customerPhone: string;
      customerName?: string;
      landingPageId?: string;
      landingPageTitle?: string;
      offerId?: string;
      bundleLabel?: string;
      variantLabel?: string;
      wilayaId?: string;
      wilayaName?: string;
      commune?: string;
      deliveryType?: DeliveryType;
      subtotal?: number;
      shippingFee?: number;
      total?: number;
      honeypot?: string;
    },
    webhookUrl?: string
  ): Promise<{ ok: boolean }> {
    const phoneCheck = validateAlgerianPhone(params.customerPhone);
    const cleanSession = String(params.sessionId || '').trim();
    if (!params.storeId || !cleanSession || !phoneCheck.valid) {
      return { ok: false };
    }
    if (String(params.honeypot || '').trim().length > 0) {
      return { ok: false };
    }

    const now = new Date().toISOString();
    const deliveryType: DeliveryType = params.deliveryType === 'stop' ? 'stop' : 'home';
    const subtotal = Math.max(0, Number(params.subtotal) || 0);
    const shippingFee = Math.max(0, Number(params.shippingFee) || 0);
    const total = Math.max(0, Number(params.total) || subtotal + shippingFee);

    // 1. Save/merge into localStorage immediately
    const allLocal = this.getLocalAbandonedOrders();
    const existingIdx = allLocal.findIndex(
      a => a.storeId === params.storeId && a.sessionId === cleanSession
    );
    const existing = existingIdx >= 0 ? allLocal[existingIdx] : undefined;
    if (existing?.status === 'recovered') {
      return { ok: true };
    }

    const nextRecord: AbandonedOrder = {
      id: existing?.id || cleanSession,
      sessionId: cleanSession,
      storeId: params.storeId,
      landingPageId: params.landingPageId || existing?.landingPageId,
      landingPageTitle: params.landingPageTitle || existing?.landingPageTitle,
      offerId: params.offerId || existing?.offerId,
      bundleLabel: params.bundleLabel || existing?.bundleLabel,
      variantLabel: params.variantLabel || existing?.variantLabel,
      customerName: params.customerName?.trim() || existing?.customerName,
      customerPhone: phoneCheck.normalized,
      wilayaId: params.wilayaId || existing?.wilayaId,
      wilayaName: params.wilayaName || existing?.wilayaName,
      commune: params.commune || existing?.commune,
      deliveryType,
      subtotal,
      shippingFee,
      total,
      status: existing?.status || 'new',
      recoveredOrderNumber: existing?.recoveredOrderNumber,
      contactedAt: existing?.contactedAt,
      notes: existing?.notes,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    if (existingIdx >= 0) {
      allLocal[existingIdx] = nextRecord;
    } else {
      allLocal.unshift(nextRecord);
    }
    this.saveLocalAbandonedOrders(allLocal);

    // 2. Post to backend /api/abandoned-orders/capture (persists to server cache + Supabase if service key present)
    const serverPayload = {
      action: 'upsert',
      storeId: params.storeId,
      sessionId: cleanSession,
      customerPhone: phoneCheck.normalized,
      customerName: params.customerName?.trim() || '',
      landingPageId: params.landingPageId || '',
      landingPageTitle: params.landingPageTitle || '',
      offerId: params.offerId || '',
      bundleLabel: params.bundleLabel || '',
      variantLabel: params.variantLabel || '',
      wilayaId: params.wilayaId || '',
      wilayaName: params.wilayaName || '',
      commune: params.commune || '',
      deliveryType,
      subtotal,
      shippingFee,
      total,
      honeypot: ''
    };

    void fetch('/api/abandoned-orders/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverPayload),
      keepalive: true
    }).catch(() => {});

    // 3. Direct Supabase anon-safe RPC fallback (works even if server has no service_role key)
    if (this.useSupabase() && supabase && isUuid(params.storeId)) {
      void supabase
        .rpc('upsert_abandoned_order', {
          p_store_id: params.storeId,
          p_session_id: cleanSession,
          p_customer_phone: phoneCheck.normalized,
          p_customer_name: params.customerName?.trim() || null,
          p_landing_page_id: isUuid(params.landingPageId) ? params.landingPageId : null,
          p_landing_page_title: params.landingPageTitle || null,
          p_offer_id: params.offerId || null,
          p_bundle_label: params.bundleLabel || null,
          p_variant_label: params.variantLabel || null,
          p_wilaya_id: params.wilayaId || null,
          p_wilaya_name: params.wilayaName || null,
          p_commune: params.commune || null,
          p_delivery_type: deliveryType,
          p_subtotal: subtotal,
          p_shipping_fee: shippingFee,
          p_total: total
        })
        .then(() => {}, () => {});
    }

    // 4. Optional separate worksheet sync in Google Sheet (auto-gated to Apps Script v4+)
    if (webhookUrl?.trim()) {
      const productDetails = [
        params.landingPageTitle,
        params.bundleLabel,
        params.variantLabel ? `(${params.variantLabel})` : ''
      ]
        .filter(Boolean)
        .join(' - ');
      void sendAbandonedOrderToGoogleSheet(webhookUrl, {
        sessionId: cleanSession,
        fullName: params.customerName?.trim() || '',
        phone: phoneCheck.normalized,
        wilaya: params.wilayaName || '',
        commune: params.commune || '',
        deliveryType,
        productDetails: productDetails || 'طلب غير مكتمل',
        totalPrice: total,
        statusLabel: ABANDONED_STAGE_LABELS[nextRecord.status]
      });
    }

    return { ok: true };
  }

  captureAbandonedOrderBeacon(params: {
    storeId: string;
    sessionId: string;
    customerPhone: string;
    customerName?: string;
    landingPageId?: string;
    landingPageTitle?: string;
    offerId?: string;
    bundleLabel?: string;
    variantLabel?: string;
    wilayaId?: string;
    wilayaName?: string;
    commune?: string;
    deliveryType?: DeliveryType;
    subtotal?: number;
    shippingFee?: number;
    total?: number;
  }): void {
    const phoneCheck = validateAlgerianPhone(params.customerPhone);
    const cleanSession = String(params.sessionId || '').trim();
    if (!params.storeId || !cleanSession || !phoneCheck.valid) return;

    const payload = JSON.stringify({
      action: 'upsert',
      storeId: params.storeId,
      sessionId: cleanSession,
      customerPhone: phoneCheck.normalized,
      customerName: params.customerName?.trim() || '',
      landingPageId: params.landingPageId || '',
      landingPageTitle: params.landingPageTitle || '',
      offerId: params.offerId || '',
      bundleLabel: params.bundleLabel || '',
      variantLabel: params.variantLabel || '',
      wilayaId: params.wilayaId || '',
      wilayaName: params.wilayaName || '',
      commune: params.commune || '',
      deliveryType: params.deliveryType === 'stop' ? 'stop' : 'home',
      subtotal: Math.max(0, Number(params.subtotal) || 0),
      shippingFee: Math.max(0, Number(params.shippingFee) || 0),
      total: Math.max(0, Number(params.total) || 0)
    });

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
        navigator.sendBeacon('/api/abandoned-orders/capture', blob);
        return;
      }
      void fetch('/api/abandoned-orders/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    } catch {
      // ignore beacon errors
    }
  }

  async markAbandonedOrderRecovered(
    storeId: string,
    sessionId: string,
    orderNumber?: string,
    webhookUrl?: string
  ): Promise<void> {
    const cleanSession = String(sessionId || '').trim();
    if (!storeId || !cleanSession) return;
    const now = new Date().toISOString();

    const allLocal = this.getLocalAbandonedOrders();
    let changed = false;
    const nextLocal = allLocal.map(item => {
      if (item.storeId === storeId && item.sessionId === cleanSession) {
        changed = true;
        return {
          ...item,
          status: 'recovered' as AbandonedOrderStatus,
          recoveredOrderNumber: orderNumber || item.recoveredOrderNumber,
          updatedAt: now
        };
      }
      return item;
    });
    if (changed) {
      this.saveLocalAbandonedOrders(nextLocal);
    }

    void fetch('/api/abandoned-orders/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'recovered',
        storeId,
        sessionId: cleanSession,
        orderNumber: orderNumber || ''
      }),
      keepalive: true
    }).catch(() => {});

    if (this.useSupabase() && supabase && isUuid(storeId)) {
      void supabase
        .rpc('complete_abandoned_order', {
          p_store_id: storeId,
          p_session_id: cleanSession,
          p_order_number: orderNumber || null
        })
        .then(() => {}, () => {});
    }

    if (webhookUrl?.trim()) {
      void deleteAbandonedOrderInGoogleSheet(webhookUrl, cleanSession);
    }
  }

  async getAbandonedOrders(
    storeId: string
  ): Promise<{ items: AbandonedOrder[]; needsSqlMigration: boolean }> {
    if (!storeId) return { items: [], needsSqlMigration: false };

    let needsSqlMigration = false;
    const mergedBySession = new Map<string, AbandonedOrder>();
    const addOrMerge = (item: AbandonedOrder) => {
      const key = String(item.sessionId || item.id || '').trim();
      if (!key) return;
      const existing = mergedBySession.get(key);
      if (!existing) {
        mergedBySession.set(key, item);
        return;
      }
      const existingTs = new Date(existing.updatedAt || existing.createdAt).getTime() || 0;
      const incomingTs = new Date(item.updatedAt || item.createdAt).getTime() || 0;
      // Prefer UUID record id & newer timestamp
      const newer = incomingTs >= existingTs ? item : existing;
      const older = incomingTs >= existingTs ? existing : item;
      mergedBySession.set(key, {
        ...older,
        ...newer,
        id: isUuid(newer.id) ? newer.id : isUuid(older.id) ? older.id : newer.id,
        status:
          existing.status === 'recovered' || item.status === 'recovered'
            ? 'recovered'
            : newer.status,
        recoveredOrderNumber: newer.recoveredOrderNumber || older.recoveredOrderNumber
      });
    };

    // Check tombstones so deleted abandoned orders NEVER reappear from stale serverless RAM caches
    const deletedSet = this.getDeletedAbandonedSet(storeId);
    const isDeletedItem = (item: { id?: string; sessionId?: string }) =>
      Boolean(
        (item.sessionId && deletedSet.has(item.sessionId)) ||
          (item.id && deletedSet.has(item.id))
      );

    let accessToken = '';
    if (this.useSupabase() && supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        accessToken = sessionData?.session?.access_token || '';
      } catch {
        // ignore
      }
    }

    // 1. Direct Supabase query FIRST when signed in — Supabase is authoritative (prevents Vercel multi-instance cache ghosts!)
    if (this.useSupabase() && supabase && isUuid(storeId) && accessToken) {
      const { data, error } = await supabase
        .from('abandoned_orders')
        .select('*')
        .eq('store_id', storeId)
        .order('updated_at', { ascending: false })
        .limit(300);

      if (!error && Array.isArray(data)) {
        const authoritative = data
          .map(r => this.mapSupabaseAbandonedRow(r))
          .filter(item => !isDeletedItem(item))
          .sort(
            (a, b) =>
              (new Date(b.updatedAt || b.createdAt).getTime() || 0) -
              (new Date(a.updatedAt || a.createdAt).getTime() || 0)
          );
        // Keep local cache in sync with authoritative Supabase rows for this store
        const otherStoresLocal = this.getLocalAbandonedOrders().filter(a => a.storeId !== storeId);
        this.saveLocalAbandonedOrders([...authoritative, ...otherStoresLocal]);
        return { items: authoritative, needsSqlMigration: false };
      }

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table')
        ) {
          needsSqlMigration = true;
        }
      }
    }

    // 2. Fallback (demo/local mode or before SQL table is created): local + server cache filtered by tombstones
    this.getLocalAbandonedOrders()
      .filter(a => a.storeId === storeId && !isDeletedItem(a))
      .forEach(addOrMerge);

    try {
      const res = await fetch(
        `/api/abandoned-orders/list?storeId=${encodeURIComponent(storeId)}`,
        {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.needsSqlMigration) needsSqlMigration = true;
        if (Array.isArray(data?.items)) {
          data.items
            .filter((item: AbandonedOrder) => !isDeletedItem(item))
            .forEach((item: AbandonedOrder) => addOrMerge(item));
        }
      }
    } catch {
      // non-fatal
    }

    const items = Array.from(mergedBySession.values())
      .filter(item => !isDeletedItem(item))
      .sort(
        (a, b) =>
          (new Date(b.updatedAt || b.createdAt).getTime() || 0) -
          (new Date(a.updatedAt || a.createdAt).getTime() || 0)
      );
    return { items, needsSqlMigration };
  }

  private getDeletedAbandonedSet(storeId: string): Set<string> {
    try {
      const raw = localStorage.getItem(DELETED_ABANDONED_SESSIONS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      const list = Array.isArray(parsed?.[storeId]) ? parsed[storeId] : [];
      return new Set(list.filter(Boolean));
    } catch {
      return new Set<string>();
    }
  }

  private rememberDeletedAbandoned(storeId: string, keys: string[]): void {
    if (!storeId || keys.length === 0) return;
    try {
      const raw = localStorage.getItem(DELETED_ABANDONED_SESSIONS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      const existing = new Set<string>(Array.isArray(parsed?.[storeId]) ? parsed[storeId] : []);
      keys.forEach(k => {
        const clean = String(k || '').trim();
        if (clean) existing.add(clean);
      });
      parsed[storeId] = Array.from(existing).slice(-800);
      localStorage.setItem(DELETED_ABANDONED_SESSIONS_KEY, JSON.stringify(parsed));
    } catch {
      // ignore localStorage errors
    }
  }

  async updateAbandonedOrder(
    storeId: string,
    target: { id: string; sessionId: string },
    patch: {
      status?: AbandonedOrderStatus;
      recoveredOrderNumber?: string;
      contactedAt?: string;
      notes?: string;
    },
    webhookUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!storeId) return { success: false, error: 'معرّف المتجر غير صالح' };
    const now = new Date().toISOString();

    // Update local cache
    const allLocal = this.getLocalAbandonedOrders();
    const updatedLocal = allLocal.map(item => {
      if (
        item.storeId === storeId &&
        (item.id === target.id || item.sessionId === target.sessionId)
      ) {
        return {
          ...item,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.recoveredOrderNumber !== undefined
            ? { recoveredOrderNumber: patch.recoveredOrderNumber }
            : {}),
          ...(patch.contactedAt !== undefined ? { contactedAt: patch.contactedAt } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          updatedAt: now
        };
      }
      return item;
    });
    this.saveLocalAbandonedOrders(updatedLocal);

    let accessToken = '';
    if (this.useSupabase() && supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        accessToken = sessionData?.session?.access_token || '';
      } catch {
        // ignore
      }
    }

    try {
      await fetch('/api/abandoned-orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          storeId,
          id: target.id,
          sessionId: target.sessionId,
          ...patch
        })
      });
    } catch {
      // ignore
    }

    if (this.useSupabase() && supabase && isUuid(storeId) && accessToken) {
      const dbPatch: Record<string, any> = { updated_at: now };
      if (patch.status) dbPatch.status = patch.status;
      if (patch.recoveredOrderNumber !== undefined) {
        dbPatch.recovered_order_number = patch.recoveredOrderNumber || null;
      }
      if (patch.contactedAt !== undefined) {
        dbPatch.contacted_at = patch.contactedAt || null;
      }
      if (patch.notes !== undefined) {
        dbPatch.notes = patch.notes || null;
      }

      if (isUuid(target.id)) {
        await supabase
          .from('abandoned_orders')
          .update(dbPatch)
          .eq('store_id', storeId)
          .eq('id', target.id);
      } else if (target.sessionId) {
        await supabase
          .from('abandoned_orders')
          .update(dbPatch)
          .eq('store_id', storeId)
          .eq('session_id', target.sessionId);
      }
    }

    if (webhookUrl?.trim() && target.sessionId && patch.status) {
      if (patch.status === 'recovered') {
        void deleteAbandonedOrderInGoogleSheet(webhookUrl, target.sessionId);
      } else {
        void updateAbandonedStatusInGoogleSheet(
          webhookUrl,
          target.sessionId,
          ABANDONED_STAGE_LABELS[patch.status]
        );
      }
    }

    return { success: true };
  }

  async deleteAbandonedOrders(
    storeId: string,
    targets: Array<{ id: string; sessionId: string }>,
    webhookUrl?: string
  ): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    if (!storeId || targets.length === 0) return { success: true, deletedCount: 0 };

    const idSet = new Set(targets.map(t => t.id).filter(Boolean));
    const sessionSet = new Set(targets.map(t => t.sessionId).filter(Boolean));

    // Record local tombstones immediately so no background poll or stale serverless cache can resurrect them
    this.rememberDeletedAbandoned(storeId, [
      ...Array.from(idSet),
      ...Array.from(sessionSet)
    ]);

    const allLocal = this.getLocalAbandonedOrders();
    const remainingLocal = allLocal.filter(
      item =>
        !(
          item.storeId === storeId &&
          (idSet.has(item.id) || sessionSet.has(item.sessionId))
        )
    );
    this.saveLocalAbandonedOrders(remainingLocal);

    let accessToken = '';
    if (this.useSupabase() && supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        accessToken = sessionData?.session?.access_token || '';
      } catch {
        // ignore
      }
    }

    try {
      await fetch('/api/abandoned-orders/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          storeId,
          ids: Array.from(idSet),
          sessionIds: Array.from(sessionSet)
        })
      });
    } catch {
      // ignore
    }

    if (this.useSupabase() && supabase && isUuid(storeId) && accessToken) {
      const uuidIds = Array.from(idSet).filter(id => isUuid(id));
      const sessions = Array.from(sessionSet);
      if (uuidIds.length > 0) {
        await supabase
          .from('abandoned_orders')
          .delete()
          .eq('store_id', storeId)
          .in('id', uuidIds);
      }
      if (sessions.length > 0) {
        await supabase
          .from('abandoned_orders')
          .delete()
          .eq('store_id', storeId)
          .in('session_id', sessions);
      }
    }

    if (webhookUrl?.trim()) {
      targets.forEach(t => {
        if (t.sessionId) {
          void deleteAbandonedOrderInGoogleSheet(webhookUrl, t.sessionId);
        }
      });
    }

    return { success: true, deletedCount: targets.length };
  }

  async mergeAbandonedFromSheet(
    storeId: string,
    sheetRows: SheetAbandonedRow[],
    existingItems: AbandonedOrder[]
  ): Promise<number> {
    if (!storeId || sheetRows.length === 0) return 0;
    const existingSessions = new Set(existingItems.map(i => i.sessionId.toUpperCase()));
    let imported = 0;

    for (const row of sheetRows) {
      const cleanSession = String(row.sessionId || '').trim();
      if (!cleanSession || existingSessions.has(cleanSession.toUpperCase())) continue;
      const phoneCheck = validateAlgerianPhone(row.customerPhone);
      if (!phoneCheck.valid) continue;

      const matchedWilaya = ALGERIA_WILAYAS.find(
        w => w.nameAr === row.wilayaName || (row.wilayaName && row.wilayaName.includes(w.nameAr))
      );
      await this.captureAbandonedOrder({
        storeId,
        sessionId: cleanSession,
        customerPhone: phoneCheck.normalized,
        customerName: row.customerName || undefined,
        bundleLabel: row.productLabel || undefined,
        wilayaId: matchedWilaya?.id,
        wilayaName: row.wilayaName || matchedWilaya?.nameAr,
        commune: row.commune || undefined,
        deliveryType: row.deliveryType,
        total: row.total
      });
      if (row.status && row.status !== 'new') {
        await this.updateAbandonedOrder(storeId, { id: cleanSession, sessionId: cleanSession }, {
          status: row.status
        });
      }
      imported += 1;
    }

    return imported;
  }

  // ---- A/B test + page views ------------------------------------------------
  async trackLandingPageView(pageId: string): Promise<void> {
    try {
      if (this.useSupabase() && supabase && isUuid(pageId)) {
        await supabase.rpc('track_page_view', { p_page_id: pageId });
        return;
      }
      const key = 'dokani_page_views';
      const all = JSON.parse(localStorage.getItem(key) || '{}');
      all[pageId] = Number(all[pageId] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(all));
    } catch {
      /* analytics must never break the page */
    }
  }

  async getPageStats(
    storeId: string,
    pageIds: string[]
  ): Promise<Record<string, { views: number; orders: number }>> {
    const out: Record<string, { views: number; orders: number }> = {};
    pageIds.forEach(id => (out[id] = { views: 0, orders: 0 }));
    try {
      if (this.useSupabase() && supabase && isUuid(storeId)) {
        const [viewsRes, ordersRes] = await Promise.all([
          supabase.from('landing_page_views').select('page_id, views').in('page_id', pageIds),
          supabase
            .from('orders')
            .select('landing_page_id')
            .eq('store_id', storeId)
            .in('landing_page_id', pageIds)
            .limit(10000)
        ]);
        (viewsRes.data || []).forEach((r: any) => {
          if (out[r.page_id]) out[r.page_id].views += Number(r.views || 0);
        });
        (ordersRes.data || []).forEach((r: any) => {
          if (out[r.landing_page_id]) out[r.landing_page_id].orders += 1;
        });
        return out;
      }
      const views = JSON.parse(localStorage.getItem('dokani_page_views') || '{}');
      pageIds.forEach(id => (out[id].views = Number(views[id] || 0)));
      this.getLocalOrders(storeId).forEach(o => {
        if (o.landingPageId && out[o.landingPageId]) out[o.landingPageId].orders += 1;
      });
    } catch {
      /* return zeros */
    }
    return out;
  }

  // ---- AI copywriting (server-side Gemini) -----------------------------------
  async generateAiCopy(
    storeId: string,
    input: { productName: string; details?: string; dialect: 'fusha' | 'darija'; tone: string }
  ): Promise<{
    ok: boolean;
    error?: string;
    copy?: { title: string; highlightTitle: string; description: string; badgeText: string };
  }> {
    if (!(this.useSupabase() && supabase && isUuid(storeId))) {
      return { ok: false, error: 'مساعد الكتابة يعمل بعد تسجيل الدخول بحساب المالك (وليس في الوضع التجريبي).' };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return { ok: false, error: 'يرجى تسجيل الدخول أولاً.' };
    try {
      const res = await fetch('/api/ai/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ storeId, ...input })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) return { ok: true, copy: data.copy };
      return { ok: false, error: data?.message || 'تعذر توليد النص، حاول مجدداً.' };
    } catch {
      return { ok: false, error: 'تعذر الاتصال بالسيرفر.' };
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
