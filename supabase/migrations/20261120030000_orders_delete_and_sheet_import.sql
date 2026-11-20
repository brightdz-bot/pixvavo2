-- ==============================================================================
-- Owner-Only Order Deletion + Google Sheet Missing Order Import RPCs
-- Safe to run multiple times (idempotent).
-- Note: Also handled server-side when SUPABASE_SERVICE_ROLE_KEY is configured.
-- ==============================================================================
BEGIN;

DROP POLICY IF EXISTS orders_owner_delete ON public.orders;
CREATE POLICY orders_owner_delete ON public.orders
    FOR DELETE TO authenticated
    USING (public.owns_store(store_id) OR public.is_admin());

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

    v_wilaya_id := CASE
        WHEN EXISTS (SELECT 1 FROM public.wilayas WHERE id = p_wilaya_id) THEN p_wilaya_id
        ELSE '16'
    END;
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
    ON CONFLICT (order_number) DO NOTHING
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('id', v_id, 'orderNumber', v_order_num);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_orders(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_order_from_sheet(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated;

COMMIT;
