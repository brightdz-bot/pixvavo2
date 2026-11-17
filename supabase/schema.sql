-- ==============================================================================
-- BRIGHT DZ / PRIVATE STORE & LANDING PAGE BUILDER — SUPABASE SCHEMA
-- Paste into Supabase > SQL Editor > Run. Runs as ONE transaction.
-- ==============================================================================
BEGIN;

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

CREATE TABLE IF NOT EXISTS public.wilayas (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    default_fee NUMERIC NOT NULL CHECK (default_fee >= 0),
    home_fee NUMERIC NOT NULL DEFAULT 600 CHECK (home_fee >= 0),
    stop_fee NUMERIC NOT NULL DEFAULT 400 CHECK (stop_fee >= 0)
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
    owner_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    subdomain TEXT NOT NULL UNIQUE
        CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
               AND subdomain NOT IN ('www','admin','api','app','mail','dashboard','support','static','dokani')),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    announcement_text TEXT NOT NULL DEFAULT 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
    logo_url TEXT,
    brand_color TEXT NOT NULL DEFAULT '#754b2d' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
    free_shipping_threshold NUMERIC NOT NULL DEFAULT 0 CHECK (free_shipping_threshold >= 0),
    plan_id TEXT NOT NULL DEFAULT 'plan_pro' REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
    phone TEXT,
    default_whatsapp TEXT,
    default_pixel_id TEXT,
    google_sheet_webhook TEXT,
    custom_wilaya_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
    custom_wilaya_rates JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS fk_profiles_store,
    ADD CONSTRAINT fk_profiles_store FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.landing_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$'),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    highlight_title TEXT,
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
    category TEXT NOT NULL DEFAULT 'عام',
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    badge_text TEXT,
    main_image TEXT NOT NULL DEFAULT '',
    gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    offers JSONB NOT NULL DEFAULT '[]'::jsonb,
    theme JSONB NOT NULL DEFAULT '{}'::jsonb,
    integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
    bundle_label TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    wilaya_id TEXT NOT NULL REFERENCES public.wilayas(id),
    wilaya_name TEXT NOT NULL,
    commune TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'home' CHECK (delivery_type IN ('home', 'stop')),
    address TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    shipping_fee NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
    total NUMERIC NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'shipping', 'delivered', 'cancelled')),
    tracking_code TEXT,
    status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_method TEXT NOT NULL DEFAULT 'cod',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_store ON public.landing_pages(store_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_published ON public.landing_pages(store_id, is_published);
CREATE INDEX IF NOT EXISTS idx_products_store ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON public.orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_landing_page ON public.orders(landing_page_id);

-- ==============================================================================
-- 2. HELPER FUNCTIONS
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
DROP TRIGGER IF EXISTS trg_touch_landing_pages ON public.landing_pages;
CREATE TRIGGER trg_touch_landing_pages BEFORE UPDATE ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_products ON public.products;
CREATE TRIGGER trg_touch_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_orders ON public.orders;
CREATE TRIGGER trg_touch_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT USING (true);
DROP POLICY IF EXISTS wilayas_select ON public.wilayas;
CREATE POLICY wilayas_select ON public.wilayas FOR SELECT USING (true);

DROP POLICY IF EXISTS stores_public_select ON public.stores;
CREATE POLICY stores_public_select ON public.stores
    FOR SELECT TO anon USING (status IN ('active', 'trial'));
DROP POLICY IF EXISTS stores_owner_admin_select ON public.stores;
CREATE POLICY stores_owner_admin_select ON public.stores
    FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_admin() OR status IN ('active', 'trial'));
DROP POLICY IF EXISTS stores_insert ON public.stores;
CREATE POLICY stores_insert ON public.stores FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS stores_update ON public.stores;
CREATE POLICY stores_update ON public.stores FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS landing_pages_public_select ON public.landing_pages;
CREATE POLICY landing_pages_public_select ON public.landing_pages
    FOR SELECT TO anon
    USING (is_published = true AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = landing_pages.store_id AND s.status IN ('active', 'trial')));
DROP POLICY IF EXISTS landing_pages_auth_select ON public.landing_pages;
CREATE POLICY landing_pages_auth_select ON public.landing_pages
    FOR SELECT TO authenticated
    USING (public.owns_store(store_id) OR public.is_admin() OR (is_published = true AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = landing_pages.store_id AND s.status IN ('active', 'trial'))));
DROP POLICY IF EXISTS landing_pages_insert ON public.landing_pages;
CREATE POLICY landing_pages_insert ON public.landing_pages FOR INSERT TO authenticated WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS landing_pages_update ON public.landing_pages;
CREATE POLICY landing_pages_update ON public.landing_pages FOR UPDATE TO authenticated USING (public.owns_store(store_id)) WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS landing_pages_delete ON public.landing_pages;
CREATE POLICY landing_pages_delete ON public.landing_pages FOR DELETE TO authenticated USING (public.owns_store(store_id));

DROP POLICY IF EXISTS products_public_select ON public.products;
CREATE POLICY products_public_select ON public.products
    FOR SELECT TO anon USING (is_active = true AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.status IN ('active', 'trial')));
DROP POLICY IF EXISTS products_owner_admin_select ON public.products;
CREATE POLICY products_owner_admin_select ON public.products
    FOR SELECT TO authenticated USING (public.owns_store(store_id) OR public.is_admin());
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated USING (public.owns_store(store_id)) WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated USING (public.owns_store(store_id));

DROP POLICY IF EXISTS product_costs_all ON public.product_costs;
CREATE POLICY product_costs_all ON public.product_costs FOR ALL
    USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_costs.product_id AND public.owns_store(p.store_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_costs.product_id AND public.owns_store(p.store_id)));

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT USING (public.owns_store(store_id) OR public.is_admin());

-- ==============================================================================
-- 4. BUSINESS FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.place_order(
    p_store_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_wilaya_id TEXT,
    p_wilaya_name TEXT,
    p_address TEXT,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_notes TEXT DEFAULT NULL,
    p_landing_page_id UUID DEFAULT NULL,
    p_offer_id TEXT DEFAULT NULL,
    p_commune TEXT DEFAULT NULL,
    p_delivery_type TEXT DEFAULT 'home'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_store RECORD;
    v_wilaya RECORD;
    v_page RECORD;
    v_offer JSONB;
    v_found_offer BOOLEAN := false;
    v_item JSONB;
    v_product RECORD;
    v_qty INTEGER;
    v_variant TEXT;
    v_subtotal NUMERIC := 0;
    v_shipping NUMERIC := 0;
    v_total NUMERIC;
    v_phone TEXT;
    v_delivery TEXT;
    v_commune TEXT;
    v_bundle_label TEXT;
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

    v_delivery := CASE WHEN p_delivery_type = 'stop' THEN 'stop' ELSE 'home' END;
    v_commune := NULLIF(left(trim(COALESCE(p_commune, '')), 100), '');

    IF p_address IS NULL OR char_length(trim(p_address)) NOT BETWEEN 2 AND 250 THEN
        RAISE EXCEPTION 'يرجى إدخال العنوان أو البلدية بشكل صحيح';
    END IF;
    IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
        RAISE EXCEPTION 'الملاحظات طويلة جداً';
    END IF;

    SELECT * INTO v_wilaya FROM public.wilayas WHERE id = p_wilaya_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'الولاية غير صحيحة'; END IF;

    IF p_landing_page_id IS NOT NULL THEN
        SELECT * INTO v_page
        FROM public.landing_pages
        WHERE id = p_landing_page_id AND store_id = p_store_id
        FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'صفحة المنتج غير موجودة في هذا المتجر'; END IF;
        IF NOT v_page.is_published THEN RAISE EXCEPTION 'هذا العرض غير متاح حالياً'; END IF;

        IF jsonb_typeof(v_page.offers) = 'array' AND jsonb_array_length(v_page.offers) > 0 THEN
            FOR i IN 0 .. jsonb_array_length(v_page.offers) - 1 LOOP
                v_offer := v_page.offers -> i;
                IF p_offer_id IS NULL OR (v_offer ->> 'id') = p_offer_id THEN
                    v_found_offer := true;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF NOT v_found_offer THEN
            RAISE EXCEPTION 'الباقة المختارة غير موجودة';
        END IF;

        v_qty := GREATEST(1, COALESCE((v_offer ->> 'quantity')::INTEGER, 1));
        IF v_page.stock < v_qty THEN
            RAISE EXCEPTION 'عذراً، الكمية المتوفرة من "%" هي % قطع فقط', v_page.title, v_page.stock;
        END IF;

        UPDATE public.landing_pages SET stock = stock - v_qty WHERE id = v_page.id;

        v_subtotal := GREATEST(0, COALESCE((v_offer ->> 'price')::NUMERIC, 0));
        v_bundle_label := COALESCE(v_offer ->> 'title', v_page.title) || ' (الكمية: ' || v_qty || ')';
        v_verified := jsonb_build_array(jsonb_build_object(
            'productId', v_page.id,
            'title', v_page.title,
            'price', v_subtotal,
            'quantity', 1,
            'bundleQuantity', v_qty,
            'variantText', v_bundle_label,
            'imageUrl', v_page.main_image
        ));
    ELSE
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
    END IF;

    IF v_store.custom_wilaya_rates ? p_wilaya_id
       AND (v_store.custom_wilaya_rates -> p_wilaya_id) ? v_delivery THEN
        v_shipping := ((v_store.custom_wilaya_rates -> p_wilaya_id) ->> v_delivery)::NUMERIC;
    ELSIF v_delivery = 'home' AND v_store.custom_wilaya_fees ? p_wilaya_id THEN
        v_shipping := (v_store.custom_wilaya_fees ->> p_wilaya_id)::NUMERIC;
    ELSE
        v_shipping := CASE WHEN v_delivery = 'stop' THEN v_wilaya.stop_fee ELSE v_wilaya.home_fee END;
    END IF;

    IF v_store.free_shipping_threshold > 0 AND v_subtotal >= v_store.free_shipping_threshold THEN
        v_shipping := 0;
    END IF;
    v_total := v_subtotal + v_shipping;

    LOOP
        v_order_number := 'DZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number);
    END LOOP;

    INSERT INTO public.orders (
        order_number, store_id, landing_page_id, bundle_label, customer_name, customer_phone,
        wilaya_id, wilaya_name, commune, delivery_type, address,
        items, subtotal, shipping_fee, total, status, status_history, payment_method, notes
    ) VALUES (
        v_order_number, p_store_id, p_landing_page_id, v_bundle_label, trim(p_customer_name), v_phone,
        p_wilaya_id, v_wilaya.name_ar, v_commune, v_delivery, trim(p_address),
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
        'landingPageId', p_landing_page_id,
        'bundleLabel', v_bundle_label,
        'customerName', trim(p_customer_name),
        'wilayaName', v_wilaya.name_ar,
        'commune', v_commune,
        'deliveryType', v_delivery,
        'subtotal', v_subtotal,
        'shippingFee', v_shipping,
        'total', v_total,
        'status', 'new'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.track_order(p_order_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = ''
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT order_number, split_part(customer_name, ' ', 1) AS first_name,
           wilaya_name, commune, delivery_type, bundle_label,
           COALESCE((items -> 0 ->> 'title'), '') AS item_title,
           total, status, tracking_code, status_history, created_at
    INTO v_order
    FROM public.orders
    WHERE order_number = upper(trim(p_order_number));

    IF NOT FOUND THEN RETURN NULL; END IF;

    RETURN jsonb_build_object(
        'orderNumber', v_order.order_number,
        'customerFirstName', v_order.first_name,
        'wilayaName', v_order.wilaya_name,
        'commune', v_order.commune,
        'deliveryType', v_order.delivery_type,
        'bundleLabel', COALESCE(v_order.bundle_label, v_order.item_title),
        'total', v_order.total,
        'status', v_order.status,
        'trackingCode', v_order.tracking_code,
        'statusHistory', v_order.status_history,
        'createdAt', v_order.created_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_status(
    p_order_id UUID,
    p_new_status TEXT,
    p_note TEXT DEFAULT NULL,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_order RECORD;
    v_item JSONB;
    v_history JSONB;
    v_label TEXT;
    v_qty INTEGER;
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
            v_qty := COALESCE((v_item ->> 'bundleQuantity')::INTEGER, (v_item ->> 'quantity')::INTEGER, 1);
            IF v_order.landing_page_id IS NOT NULL THEN
                UPDATE public.landing_pages SET stock = stock + v_qty WHERE id = v_order.landing_page_id;
            ELSE
                UPDATE public.products SET stock = stock + v_qty WHERE id = (v_item ->> 'productId')::UUID;
            END IF;
        END LOOP;
    ELSIF v_order.status = 'cancelled' AND p_new_status <> 'cancelled' THEN
        FOR i IN 0 .. jsonb_array_length(v_order.items) - 1 LOOP
            v_item := v_order.items -> i;
            v_qty := COALESCE((v_item ->> 'bundleQuantity')::INTEGER, (v_item ->> 'quantity')::INTEGER, 1);
            IF v_order.landing_page_id IS NOT NULL THEN
                UPDATE public.landing_pages SET stock = GREATEST(0, stock - v_qty) WHERE id = v_order.landing_page_id;
            ELSE
                UPDATE public.products SET stock = GREATEST(0, stock - v_qty) WHERE id = (v_item ->> 'productId')::UUID;
            END IF;
        END LOOP;
    END IF;

    v_label := CASE p_new_status
        WHEN 'new' THEN 'قيد التأكيد'
        WHEN 'confirmed' THEN 'التأكيد'
        WHEN 'shipping' THEN 'في شركة التوصيل'
        WHEN 'delivered' THEN 'التسليم'
        ELSE 'ملغي' END;

    v_history := v_order.status_history || jsonb_build_object(
        'status', p_new_status, 'timestamp', now(), 'note', COALESCE(p_note, 'تغيير الحالة إلى ' || v_label)
    );

    UPDATE public.orders
    SET status = p_new_status,
        status_history = v_history,
        tracking_code = COALESCE(NULLIF(trim(COALESCE(p_tracking_code, '')), ''), tracking_code)
    WHERE id = p_order_id;

    RETURN jsonb_build_object('id', p_order_id, 'status', p_new_status, 'statusHistory', v_history);
END;
$$;

-- ==============================================================================
-- 5. PRIVILEGES
-- ==============================================================================
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.plans, public.wilayas, public.products, public.landing_pages, public.stores TO anon;

GRANT SELECT ON public.plans, public.wilayas, public.profiles, public.stores,
                public.landing_pages, public.products, public.product_costs, public.orders TO authenticated;
GRANT UPDATE (name, phone, updated_at) ON public.profiles TO authenticated;
GRANT INSERT (id, owner_id, name, subdomain, description, announcement_text, logo_url, brand_color,
              free_shipping_threshold, phone, default_whatsapp, default_pixel_id, google_sheet_webhook,
              custom_wilaya_fees, custom_wilaya_rates)
    ON public.stores TO authenticated;
GRANT UPDATE (name, description, announcement_text, logo_url, brand_color, free_shipping_threshold,
              phone, default_whatsapp, default_pixel_id, google_sheet_webhook,
              custom_wilaya_fees, custom_wilaya_rates, updated_at)
    ON public.stores TO authenticated;
GRANT INSERT (id, store_id, slug, title, highlight_title, description, category, stock, badge_text,
              main_image, gallery_images, offers, theme, integrations, is_published, updated_at)
    ON public.landing_pages TO authenticated;
GRANT UPDATE (slug, title, highlight_title, description, category, stock, badge_text,
              main_image, gallery_images, offers, theme, integrations, is_published, updated_at)
    ON public.landing_pages TO authenticated;
GRANT DELETE ON public.landing_pages TO authenticated;
GRANT INSERT (id, store_id, title, description, price, compare_price, category, stock, sku,
              image_url, additional_images, variants, is_active)
    ON public.products TO authenticated;
GRANT UPDATE (title, description, price, compare_price, category, stock, sku,
              image_url, additional_images, variants, is_active, updated_at)
    ON public.products TO authenticated;
GRANT DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_costs TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin(), public.owns_store(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 6. SEED DATA
-- ==============================================================================
INSERT INTO public.wilayas (id, name_ar, default_fee, home_fee, stop_fee) VALUES
    ('01', 'أدرار', 1400, 1400, 750),
    ('02', 'الشلف', 600, 600, 400),
    ('03', 'الأغواط', 900, 900, 500),
    ('04', 'أم البواقي', 900, 900, 500),
    ('05', 'باتنة', 800, 800, 400),
    ('06', 'بجاية', 700, 700, 400),
    ('07', 'بسكرة', 700, 700, 400),
    ('08', 'بشار', 1300, 1300, 550),
    ('09', 'البليدة', 600, 600, 400),
    ('10', 'البويرة', 600, 600, 400),
    ('11', 'تمنراست', 1700, 1700, 1050),
    ('12', 'تبسة', 700, 700, 450),
    ('13', 'تلمسان', 700, 700, 400),
    ('14', 'تيارت', 700, 700, 400),
    ('15', 'تيزي وزو', 600, 600, 400),
    ('16', 'الجزائر العاصمة', 600, 600, 400),
    ('17', 'الجلفة', 600, 600, 400),
    ('18', 'جيجل', 600, 600, 400),
    ('19', 'سطيف', 600, 600, 400),
    ('20', 'سعيدة', 700, 700, 450),
    ('21', 'سكيكدة', 600, 600, 400),
    ('22', 'سيدي بلعباس', 600, 600, 400),
    ('23', 'عنابة', 600, 600, 400),
    ('24', 'قالمة', 600, 600, 400),
    ('25', 'قسنطينة', 600, 600, 400),
    ('26', 'المدية', 600, 600, 400),
    ('27', 'مستغانم', 700, 700, 450),
    ('28', 'المسيلة', 600, 600, 400),
    ('29', 'معسكر', 700, 700, 450),
    ('30', 'ورقلة', 1000, 1000, 600),
    ('31', 'وهران', 700, 700, 450),
    ('32', 'البيض', 900, 900, 600),
    ('33', 'إليزي', 1700, 1700, 1050),
    ('34', 'برج بوعريريج', 600, 600, 400),
    ('35', 'بومرداس', 600, 600, 400),
    ('36', 'الطارف', 600, 600, 400),
    ('37', 'تندوف', 1300, 1300, 750),
    ('38', 'تيسمسيلت', 600, 600, 450),
    ('39', 'الوادي', 1000, 1000, 600),
    ('40', 'خنشلة', 600, 600, 400),
    ('41', 'سوق أهراس', 600, 600, 400),
    ('42', 'تيبازة', 600, 600, 400),
    ('43', 'ميلة', 600, 600, 400),
    ('44', 'عين الدفلى', 700, 700, 450),
    ('45', 'النعامة', 900, 900, 600),
    ('46', 'عين تموشنت', 700, 700, 400),
    ('47', 'غرداية', 1000, 1000, 600),
    ('48', 'غليزان', 700, 700, 450),
    ('49', 'تيميمون', 1300, 1300, 800),
    ('50', 'برج باجي مختار', 1300, 1300, 1200),
    ('51', 'أولاد جلال', 800, 800, 450),
    ('52', 'بني عباس', 1300, 1300, 1200),
    ('53', 'عين صالح', 1300, 1300, 1050),
    ('54', 'عين قزام', 1300, 1300, 1050),
    ('55', 'تقرت', 1000, 1000, 600),
    ('56', 'جانت', 1300, 1300, 1200),
    ('57', 'المغير', 1000, 1000, 600),
    ('58', 'المنيعة', 1000, 1000, 600)
ON CONFLICT (id) DO UPDATE SET
    name_ar = EXCLUDED.name_ar,
    default_fee = EXCLUDED.default_fee,
    home_fee = EXCLUDED.home_fee,
    stop_fee = EXCLUDED.stop_fee;

INSERT INTO public.plans (id, name, name_ar, price_dzd, billing_period, features, is_popular, max_products, commission_rate)
VALUES
('plan_pro', 'Private Store', 'متجر خاص', 0, 'دائم', '["صفحات هبوط غير محدودة", "أسعار التوصيل للمنزل ومكتب الشحن"]'::jsonb, true, 9999, 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;