-- ==============================================================================
-- Owner-Only Order Deletion + Google Sheet Missing Order Import RPCs
-- Self-healing & safe to run multiple times (idempotent).
-- Prevents ERROR 42703: column "store_id" does not exist on legacy tables.
-- ==============================================================================
BEGIN;

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

-- Ensure orders table and all required columns exist before creating policies/RPCs
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    store_id UUID,
    landing_page_id UUID,
    bundle_label TEXT,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    wilaya_id TEXT NOT NULL DEFAULT '16',
    wilaya_name TEXT NOT NULL DEFAULT 'الجزائر العاصمة',
    commune TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'home',
    address TEXT NOT NULL DEFAULT '',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    shipping_fee NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    tracking_code TEXT,
    courier_provider TEXT,
    courier_label_url TEXT,
    status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_method TEXT NOT NULL DEFAULT 'cod',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'stores'
    ) THEN
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

CREATE OR REPLACE FUNCTION public.delete_orders(
    p_store_id UUID,
    p_order_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_deleted INTEGER := 0;
BEGIN
    IF NOT (public.owns_store(p_store_id) OR public.is_admin()) THEN
        RAISE EXCEPTION 'غير مصرح لك بحذف طلبات هذا المتجر';
    END IF;

    DELETE FROM public.orders
    WHERE store_id = p_store_id
      AND id = ANY(p_order_ids);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_order_from_sheet(
    p_store_id UUID,
    p_order_number TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_wilaya_id TEXT,
    p_wilaya_name TEXT,
    p_commune TEXT DEFAULT NULL,
    p_delivery_type TEXT DEFAULT 'home',
    p_address TEXT DEFAULT '',
    p_bundle_label TEXT DEFAULT 'طلب من Google Sheet',
    p_subtotal NUMERIC DEFAULT 0,
    p_shipping_fee NUMERIC DEFAULT 0,
    p_total NUMERIC DEFAULT 0,
    p_status TEXT DEFAULT 'new',
    p_tracking_code TEXT DEFAULT NULL,
    p_landing_page_id UUID DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_order_num TEXT;
    v_wilaya_id TEXT;
    v_status TEXT;
    v_delivery TEXT;
    v_id UUID;
BEGIN
    IF NOT (public.owns_store(p_store_id) OR public.is_admin()) THEN
        RAISE EXCEPTION 'غير مصرح لك باستيراد طلبات لهذا المتجر';
    END IF;

    v_order_num := upper(trim(regexp_replace(COALESCE(p_order_number, ''), '^#', '')));
    IF v_order_num = '' THEN
        RAISE EXCEPTION 'رقم الطلب غير صالح';
    END IF;

    SELECT id INTO v_id
    FROM public.orders
    WHERE upper(trim(order_number)) = v_order_num
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('id', v_id, 'orderNumber', v_order_num, 'existing', true);
    END IF;

    v_wilaya_id := '16';
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'wilayas'
    ) THEN
        IF EXISTS (SELECT 1 FROM public.wilayas WHERE id = p_wilaya_id) THEN
            v_wilaya_id := p_wilaya_id;
        END IF;
    ELSIF NULLIF(trim(COALESCE(p_wilaya_id, '')), '') IS NOT NULL THEN
        v_wilaya_id := left(trim(p_wilaya_id), 10);
    END IF;

    v_status := CASE
        WHEN p_status IN ('new', 'confirmed', 'shipping', 'delivered', 'cancelled') THEN p_status
        ELSE 'new'
    END;
    v_delivery := CASE WHEN p_delivery_type = 'stop' THEN 'stop' ELSE 'home' END;

    INSERT INTO public.orders (
        order_number, store_id, landing_page_id, bundle_label,
        customer_name, customer_phone, wilaya_id, wilaya_name, commune,
        delivery_type, address, items, subtotal, shipping_fee, total,
        status, tracking_code, status_history, payment_method, notes, created_at
    ) VALUES (
        v_order_num,
        p_store_id,
        p_landing_page_id,
        left(COALESCE(NULLIF(trim(p_bundle_label), ''), 'طلب من Google Sheet'), 200),
        left(COALESCE(NULLIF(trim(p_customer_name), ''), 'زبون Google Sheet'), 100),
        left(COALESCE(NULLIF(trim(p_customer_phone), ''), '0000000000'), 30),
        v_wilaya_id,
        left(COALESCE(NULLIF(trim(p_wilaya_name), ''), 'الجزائر العاصمة'), 100),
        NULLIF(left(trim(COALESCE(p_commune, '')), 120), ''),
        v_delivery,
        left(COALESCE(NULLIF(trim(p_address), ''), COALESCE(p_wilaya_name, 'الجزائر العاصمة')), 250),
        jsonb_build_array(jsonb_build_object(
            'productId', COALESCE(p_landing_page_id::text, 'sheet_import'),
            'title', left(COALESCE(NULLIF(trim(p_bundle_label), ''), 'طلب من Google Sheet'), 200),
            'price', GREATEST(0, COALESCE(p_subtotal, p_total, 0)),
            'quantity', 1,
            'variantText', left(COALESCE(NULLIF(trim(p_bundle_label), ''), 'طلب من Google Sheet'), 200)
        )),
        GREATEST(0, COALESCE(p_subtotal, 0)),
        GREATEST(0, COALESCE(p_shipping_fee, 0)),
        GREATEST(0, COALESCE(p_total, COALESCE(p_subtotal, 0) + COALESCE(p_shipping_fee, 0))),
        v_status,
        NULLIF(left(trim(COALESCE(p_tracking_code, '')), 120), ''),
        jsonb_build_array(jsonb_build_object(
            'status', v_status,
            'timestamp', COALESCE(p_created_at, now()),
            'note', 'تم استيراد الطلب تلقائياً من Google Sheet'
        )),
        'cod',
        'مستورد من Google Sheet',
        COALESCE(p_created_at, now())
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'orderNumber', v_order_num);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_orders(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_order_from_sheet(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated;

COMMIT;
