-- ==============================================================================
-- DOKANI ALGERIA (دكاني) — SUPABASE MULTI-TENANT SCHEMA (reviewed, hardened)
-- Paste into Supabase > SQL Editor > Run. Runs as ONE transaction: if anything fails, nothing is applied.
-- ==============================================================================
BEGIN;

-- ==============================================================================
-- 1. TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    price_dzd NUMERIC NOT NULL DEFAULT 0 CHECK (price_dzd >= 0),
    billing_period TEXT NOT NULL,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_popular BOOLEAN NOT NULL DEFAULT false,
    max_products INTEGER NOT NULL DEFAULT 15,
    commission_rate NUMERIC NOT NULL DEFAULT 0 CHECK (commission_rate >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single source of truth for default delivery fees (matches src/data/wilayas.ts)
CREATE TABLE IF NOT EXISTS public.wilayas (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    default_fee NUMERIC NOT NULL CHECK (default_fee >= 0)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL CHECK (char_length(name) <= 100),
    phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 20),
    role TEXT NOT NULL DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
    store_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE, -- one store per merchant
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    subdomain TEXT NOT NULL UNIQUE
        CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
               AND subdomain NOT IN ('www','admin','api','app','mail','dashboard','support','static','dokani')),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    logo_url TEXT,
    brand_color TEXT NOT NULL DEFAULT '#059669' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
    free_shipping_threshold NUMERIC NOT NULL DEFAULT 10000 CHECK (free_shipping_threshold >= 0),
    plan_id TEXT NOT NULL DEFAULT 'plan_trial' REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
    phone TEXT,
    custom_wilaya_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS fk_profiles_store,
    ADD CONSTRAINT fk_profiles_store FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

-- NOTE: cost_price is NOT here. RLS cannot hide a single column from other users,
-- so the purchase cost lives in its own owner-only table (product_costs).
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
    price NUMERIC NOT NULL CHECK (price >= 0),
    compare_price NUMERIC CHECK (compare_price IS NULL OR compare_price >= 0),
    category TEXT NOT NULL DEFAULT 'عام',
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    sku TEXT,
    image_url TEXT NOT NULL DEFAULT '',
    additional_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_costs (
    product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    cost_price NUMERIC NOT NULL CHECK (cost_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    wilaya_id TEXT NOT NULL REFERENCES public.wilayas(id),
    wilaya_name TEXT NOT NULL,
    address TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    shipping_fee NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
    total NUMERIC NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'shipping', 'delivered', 'cancelled')),
    status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_method TEXT NOT NULL DEFAULT 'cod',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store_active ON public.products(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_store ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON public.orders(store_id, status);

-- ==============================================================================
-- 2. HELPER FUNCTIONS (all SECURITY DEFINER functions pin search_path)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.owns_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_profiles ON public.profiles;
CREATE TRIGGER trg_touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_stores ON public.stores;
CREATE TRIGGER trg_touch_stores BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_products ON public.products;
CREATE TRIGGER trg_touch_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_orders ON public.orders;
CREATE TRIGGER trg_touch_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Server-side product limit per plan (the UI limit alone can be bypassed through the API)
CREATE OR REPLACE FUNCTION public.enforce_product_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_max INTEGER;
    v_count INTEGER;
BEGIN
    SELECT p.max_products INTO v_max
    FROM public.stores s JOIN public.plans p ON p.id = s.plan_id
    WHERE s.id = NEW.store_id;

    SELECT count(*) INTO v_count FROM public.products WHERE store_id = NEW.store_id;

    IF v_max IS NOT NULL AND v_count >= v_max THEN
        RAISE EXCEPTION 'وصلت للحد الأقصى لعدد المنتجات في خطتك (%). رقّ خطتك لإضافة المزيد', v_max;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_limit ON public.products;
CREATE TRIGGER trg_product_limit BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_product_limit();

-- Link the new store back to its owner's profile
CREATE OR REPLACE FUNCTION public.link_store_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET store_id = NEW.id WHERE id = NEW.owner_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_store ON public.stores;
CREATE TRIGGER trg_link_store AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.link_store_to_profile();

-- Signup: ALWAYS a merchant. The role is never read from client-controlled metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        left(COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''), split_part(NEW.email, '@', 1)), 100),
        'merchant'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. ROW LEVEL SECURITY
-- ==============================================================================
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wilayas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders        ENABLE ROW LEVEL SECURITY;

-- profiles: read own (or admin). Rows are created only by the signup trigger. Users may edit name/phone only (column grants below).
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- plans / wilayas: public read, no client writes
DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT USING (true);
DROP POLICY IF EXISTS wilayas_select ON public.wilayas;
CREATE POLICY wilayas_select ON public.wilayas FOR SELECT USING (true);

-- stores: public sees active/trial stores; owner sees own; admin sees all
DROP POLICY IF EXISTS stores_select ON public.stores;
CREATE POLICY stores_select ON public.stores FOR SELECT
    USING (status IN ('active', 'trial') OR owner_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS stores_insert ON public.stores;
CREATE POLICY stores_insert ON public.stores FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS stores_update ON public.stores;
CREATE POLICY stores_update ON public.stores FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- products
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT
    USING (
        (is_active = true AND EXISTS (
            SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.status IN ('active', 'trial')
        ))
        OR public.owns_store(store_id)
        OR public.is_admin()
    );
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products FOR INSERT WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products FOR UPDATE USING (public.owns_store(store_id)) WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete ON public.products FOR DELETE USING (public.owns_store(store_id));

-- product_costs: visible ONLY to the owner of the product's store
DROP POLICY IF EXISTS product_costs_all ON public.product_costs;
CREATE POLICY product_costs_all ON public.product_costs FOR ALL
    USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_costs.product_id AND public.owns_store(p.store_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_costs.product_id AND public.owns_store(p.store_id)));

-- orders: owner/admin can READ. Every write goes through place_order / update_order_status
-- so stock and totals can never be bypassed or forged from the browser.
DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT USING (public.owns_store(store_id) OR public.is_admin());

-- ==============================================================================
-- 4. BUSINESS FUNCTIONS
-- ==============================================================================

-- 4.1 PLACE ORDER: server-authoritative prices, stock, shipping. Callable by anyone (anon).
CREATE OR REPLACE FUNCTION public.place_order(
    p_store_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_wilaya_id TEXT,
    p_wilaya_name TEXT,          -- ignored: the name is read from public.wilayas (kept for client compatibility)
    p_address TEXT,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_store RECORD;
    v_wilaya RECORD;
    v_item JSONB;
    v_product RECORD;
    v_qty INTEGER;
    v_variant TEXT;
    v_subtotal NUMERIC := 0;
    v_shipping NUMERIC := 0;
    v_total NUMERIC;
    v_phone TEXT;
    v_order_number TEXT;
    v_order_id UUID;
    v_verified JSONB := '[]'::jsonb;
    i INTEGER;
BEGIN
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'المتجر غير موجود'; END IF;
    IF v_store.status = 'suspended' THEN RAISE EXCEPTION 'هذا المتجر غير متاح لتلقي الطلبات حالياً'; END IF;

    IF p_customer_name IS NULL OR char_length(trim(p_customer_name)) NOT BETWEEN 2 AND 100 THEN
        RAISE EXCEPTION 'يرجى إدخال اسم الزبون بشكل صحيح';
    END IF;

    v_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[\s\-\.]', '', 'g');
    IF v_phone !~ '^(\+213|00213|0)[0-9]{8,9}$' THEN
        RAISE EXCEPTION 'يرجى إدخال رقم هاتف جزائري صحيح';
    END IF;

    IF p_address IS NULL OR char_length(trim(p_address)) NOT BETWEEN 5 AND 250 THEN
        RAISE EXCEPTION 'يرجى إدخال عنوان التوصيل بشكل صحيح';
    END IF;
    IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
        RAISE EXCEPTION 'الملاحظات طويلة جداً';
    END IF;

    SELECT * INTO v_wilaya FROM public.wilayas WHERE id = p_wilaya_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الولاية غير صحيحة'; END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'السلة فارغة، يرجى اختيار منتج واحد على الأقل';
    END IF;
    IF jsonb_array_length(p_items) > 50 THEN
        RAISE EXCEPTION 'عدد المنتجات في السلة كبير جداً';
    END IF;

    FOR i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
        v_item := p_items -> i;
        v_qty := COALESCE((v_item ->> 'quantity')::INTEGER, 1);
        v_variant := left(COALESCE(v_item ->> 'variantText', ''), 200);

        IF v_qty <= 0 OR v_qty > 100 THEN RAISE EXCEPTION 'الكمية المطلوبة غير صحيحة'; END IF;

        -- Lock the row so two simultaneous orders cannot oversell the last items
        SELECT * INTO v_product
        FROM public.products
        WHERE id = (v_item ->> 'productId')::UUID AND store_id = p_store_id
        FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'المنتج غير موجود في هذا المتجر'; END IF;
        IF NOT v_product.is_active THEN RAISE EXCEPTION 'المنتج "%" غير متاح للبيع حالياً', v_product.title; END IF;
        IF v_product.stock < v_qty THEN
            RAISE EXCEPTION 'عذراً، الكمية المتوفرة من "%" هي % قطع فقط', v_product.title, v_product.stock;
        END IF;

        UPDATE public.products SET stock = stock - v_qty WHERE id = v_product.id;

        v_subtotal := v_subtotal + (v_product.price * v_qty);
        v_verified := v_verified || jsonb_build_object(
            'productId', v_product.id,
            'title', v_product.title,
            'price', v_product.price,
            'quantity', v_qty,
            'variantText', v_variant,
            'imageUrl', v_product.image_url
        );
    END LOOP;

    IF v_store.custom_wilaya_fees ? p_wilaya_id THEN
        v_shipping := (v_store.custom_wilaya_fees ->> p_wilaya_id)::NUMERIC;
    ELSE
        v_shipping := v_wilaya.default_fee;
    END IF;
    IF v_store.free_shipping_threshold > 0 AND v_subtotal >= v_store.free_shipping_threshold THEN
        v_shipping := 0;
    END IF;
    v_total := v_subtotal + v_shipping;

    -- Unpredictable order number (8 hex chars): cannot be enumerated and never runs out
    LOOP
        v_order_number := 'DZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number);
    END LOOP;

    INSERT INTO public.orders (
        order_number, store_id, customer_name, customer_phone, wilaya_id, wilaya_name, address,
        items, subtotal, shipping_fee, total, status, status_history, payment_method, notes
    ) VALUES (
        v_order_number, p_store_id, trim(p_customer_name), v_phone, p_wilaya_id, v_wilaya.name_ar, trim(p_address),
        v_verified, v_subtotal, v_shipping, v_total, 'new',
        jsonb_build_array(jsonb_build_object(
            'status', 'new', 'timestamp', now(), 'note', 'تم تسجيل الطلب عبر المتجر والدفع عند الاستلام'
        )),
        'cod', p_notes
    ) RETURNING id INTO v_order_id;

    RETURN jsonb_build_object(
        'id', v_order_id,
        'orderNumber', v_order_number,
        'storeId', p_store_id,
        'customerName', trim(p_customer_name),
        'wilayaName', v_wilaya.name_ar,
        'subtotal', v_subtotal,
        'shippingFee', v_shipping,
        'total', v_total,
        'status', 'new'
    );
END;
$$;

-- 4.2 TRACK ORDER: public, reveals no phone and no address
CREATE OR REPLACE FUNCTION public.track_order(p_order_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = ''
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT order_number, split_part(customer_name, ' ', 1) AS first_name, wilaya_name, total, status, status_history, created_at
    INTO v_order
    FROM public.orders
    WHERE order_number = upper(trim(p_order_number));

    IF NOT FOUND THEN RETURN NULL; END IF;

    RETURN jsonb_build_object(
        'orderNumber', v_order.order_number,
        'customerFirstName', v_order.first_name,
        'wilayaName', v_order.wilaya_name,
        'total', v_order.total,
        'status', v_order.status,
        'statusHistory', v_order.status_history,
        'createdAt', v_order.created_at
    );
END;
$$;

-- 4.3 UPDATE ORDER STATUS (restocks on cancel)
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_order RECORD;
    v_item JSONB;
    v_history JSONB;
    v_label TEXT;
    i INTEGER;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

    IF NOT (public.owns_store(v_order.store_id) OR public.is_admin()) THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل هذا الطلب';
    END IF;
    IF p_new_status NOT IN ('new', 'confirmed', 'shipping', 'delivered', 'cancelled') THEN
        RAISE EXCEPTION 'حالة الطلب غير صحيحة';
    END IF;
    IF p_note IS NOT NULL AND char_length(p_note) > 300 THEN
        RAISE EXCEPTION 'الملاحظة طويلة جداً';
    END IF;

    IF v_order.status <> 'cancelled' AND p_new_status = 'cancelled' THEN
        FOR i IN 0 .. jsonb_array_length(v_order.items) - 1 LOOP
            v_item := v_order.items -> i;
            UPDATE public.products SET stock = stock + (v_item ->> 'quantity')::INTEGER
            WHERE id = (v_item ->> 'productId')::UUID;
        END LOOP;
    ELSIF v_order.status = 'cancelled' AND p_new_status <> 'cancelled' THEN
        FOR i IN 0 .. jsonb_array_length(v_order.items) - 1 LOOP
            v_item := v_order.items -> i;
            UPDATE public.products SET stock = GREATEST(0, stock - (v_item ->> 'quantity')::INTEGER)
            WHERE id = (v_item ->> 'productId')::UUID;
        END LOOP;
    END IF;

    v_label := CASE p_new_status
        WHEN 'new' THEN 'جديد' WHEN 'confirmed' THEN 'مؤكد' WHEN 'shipping' THEN 'قيد التوصيل'
        WHEN 'delivered' THEN 'تم التسليم' ELSE 'ملغي' END;

    v_history := v_order.status_history || jsonb_build_object(
        'status', p_new_status, 'timestamp', now(), 'note', COALESCE(p_note, 'تغيير الحالة إلى ' || v_label)
    );

    UPDATE public.orders SET status = p_new_status, status_history = v_history WHERE id = p_order_id;

    RETURN jsonb_build_object('id', p_order_id, 'status', p_new_status, 'statusHistory', v_history);
END;
$$;

-- 4.4 ADMIN: change a store's status or plan (merchants cannot do this themselves)
CREATE OR REPLACE FUNCTION public.admin_set_store(p_store_id UUID, p_status TEXT DEFAULT NULL, p_plan_id TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'suspended', 'trial') THEN
        RAISE EXCEPTION 'حالة المتجر غير صحيحة';
    END IF;
    UPDATE public.stores
    SET status = COALESCE(p_status, status), plan_id = COALESCE(p_plan_id, plan_id)
    WHERE id = p_store_id;
END;
$$;

-- ==============================================================================
-- 5. PRIVILEGES (the Data API does not expose new tables by default, so grant explicitly)
-- ==============================================================================
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Visitors (anon): read-only storefront data
GRANT SELECT ON public.plans, public.wilayas, public.products TO anon;
GRANT SELECT ON public.stores TO anon;

-- Signed-in users (merchants and admins)
GRANT SELECT ON public.plans, public.wilayas, public.profiles, public.stores,
                public.products, public.product_costs, public.orders TO authenticated;
GRANT UPDATE (name, phone, updated_at) ON public.profiles TO authenticated;
GRANT INSERT (id, owner_id, name, subdomain, description, logo_url, brand_color,
              free_shipping_threshold, phone, custom_wilaya_fees)
    ON public.stores TO authenticated;
GRANT UPDATE (name, description, logo_url, brand_color, free_shipping_threshold,
              phone, custom_wilaya_fees, updated_at)
    ON public.stores TO authenticated;
GRANT INSERT (id, store_id, title, description, price, compare_price, category, stock, sku,
              image_url, additional_images, variants, is_active)
    ON public.products TO authenticated;
GRANT UPDATE (title, description, price, compare_price, category, stock, sku,
              image_url, additional_images, variants, is_active, updated_at)
    ON public.products TO authenticated;
GRANT DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_costs TO authenticated;

-- Functions
GRANT EXECUTE ON FUNCTION public.is_admin(), public.owns_store(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_store(UUID, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 6. SEED DATA
-- ==============================================================================
INSERT INTO public.wilayas (id, name_ar, default_fee) VALUES
    ('01', 'أدرار', 1200),
    ('02', 'الشلف', 600),
    ('03', 'الأغواط', 900),
    ('04', 'أم البواقي', 700),
    ('05', 'باتنة', 700),
    ('06', 'بجاية', 600),
    ('07', 'بسكرة', 800),
    ('08', 'بشار', 1200),
    ('09', 'البليدة', 500),
    ('10', 'البويرة', 600),
    ('11', 'تمنراست', 1200),
    ('12', 'تبسة', 700),
    ('13', 'تلمسان', 700),
    ('14', 'تيارت', 700),
    ('15', 'تيزي وزو', 600),
    ('16', 'الجزائر العاصمة', 400),
    ('17', 'الجلفة', 900),
    ('18', 'جيجل', 600),
    ('19', 'سطيف', 600),
    ('20', 'سعيدة', 700),
    ('21', 'سكيكدة', 600),
    ('22', 'سيدي بلعباس', 700),
    ('23', 'عنابة', 700),
    ('24', 'قالمة', 700),
    ('25', 'قسنطينة', 600),
    ('26', 'المدية', 600),
    ('27', 'مستغانم', 650),
    ('28', 'المسيلة', 700),
    ('29', 'معسكر', 700),
    ('30', 'ورقلة', 900),
    ('31', 'وهران', 600),
    ('32', 'البيض', 900),
    ('33', 'إليزي', 1200),
    ('34', 'برج بوعريريج', 600),
    ('35', 'بومرداس', 500),
    ('36', 'الطارف', 700),
    ('37', 'تندوف', 1200),
    ('38', 'تيسمسيلت', 700),
    ('39', 'الوادي', 900),
    ('40', 'خنشلة', 700),
    ('41', 'سوق أهراس', 700),
    ('42', 'تيبازة', 500),
    ('43', 'ميلة', 600),
    ('44', 'عين الدفلى', 600),
    ('45', 'النعامة', 900),
    ('46', 'عين تموشنت', 700),
    ('47', 'غرداية', 900),
    ('48', 'غليزان', 700),
    ('49', 'تيميمون', 1200),
    ('50', 'برج باجي مختار', 1200),
    ('51', 'أولاد جلال', 900),
    ('52', 'بني عباس', 1200),
    ('53', 'عين صالح', 1200),
    ('54', 'عين قزام', 1200),
    ('55', 'تقرت', 900),
    ('56', 'جانت', 1200),
    ('57', 'المغير', 900),
    ('58', 'المنيعة', 1200)
ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar, default_fee = EXCLUDED.default_fee;

INSERT INTO public.plans (id, name, name_ar, price_dzd, billing_period, features, is_popular, max_products, commission_rate)
VALUES
('plan_trial', 'Free Trial', 'الخطة التجريبية', 0, '14 يوم مجاناً',
 '["حتى 15 منتج", "نطاق فرعي متجر.dokani.dz", "إدارة الطلبات والزبائن", "دفع عند الاستلام (COD)", "تحديد أسعار التوصيل لـ 58 ولاية", "دعم عبر البريد الإلكتروني"]'::jsonb,
 false, 15, 0),
('plan_starter', 'Starter', 'خطة الانطلاق', 2900, 'شهرياً',
 '["حتى 100 منتج مع صور عالية الدقة", "نطاق فرعي مخصص مع شهادة SSL", "تتبع الطلبات وحالات الشحن", "طباعة بوليصات الشحن وفواتير الزبائن", "إحصائيات المبيعات خلال 7 و 30 يوماً", "تنبيهات فورية عند انخفاض المخزون"]'::jsonb,
 false, 100, 0),
('plan_pro', 'Professional', 'خطة المحترفين', 5900, 'شهرياً',
 '["منتجات غير محدودة ومتغيرات الألوان والمقاسات", "دعم النطاق الخاص بك (مثل: store.com أو .dz)", "تخصيص كامل لألوان وهوية المتجر", "تحليلات الأرباح والتكاليف المتقدمة", "ربط تلقائي مع شركات الشحن الجزائرية (ياليدين، زيروكس)", "دعم فني عبر واتساب ذو أولوية 24/7"]'::jsonb,
 true, 9999, 0),
('plan_enterprise', 'Enterprise', 'كبار التجار والشركات', 12000, 'شهرياً',
 '["كل مزايا خطة المحترفين", "حسابات متعددة للموظفين والمخازن", "ربط واجهات برمجية API مخصصة", "إدارة متقدمة لمرتجعات التوصيل", "تصاميم حصرية مخصصة لمتجرك", "مدير حساب جزائري مخصص"]'::jsonb,
 false, 99999, 0)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, price_dzd = EXCLUDED.price_dzd,
    billing_period = EXCLUDED.billing_period, features = EXCLUDED.features,
    is_popular = EXCLUDED.is_popular, max_products = EXCLUDED.max_products,
    commission_rate = EXCLUDED.commission_rate;

COMMIT;

-- ==============================================================================
-- OPTIONAL (run separately, after you sign up with your own email):
--   Make yourself the platform admin:
--     UPDATE public.profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL_HERE';
--   Live order updates for the merchant dashboard:
--     ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
-- ==============================================================================