-- ==============================================================================
-- Abandoned Orders Capture & Recovery (Self-Healing & Idempotent)
-- Captures partial COD checkouts as soon as a valid Algerian phone is entered,
-- auto-marks recovered on checkout completion, and gives store owners full
-- read/update/delete access via RLS & SECURITY DEFINER RPCs.
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

ALTER TABLE public.abandoned_orders
    ADD COLUMN IF NOT EXISTS landing_page_id UUID,
    ADD COLUMN IF NOT EXISTS landing_page_title TEXT,
    ADD COLUMN IF NOT EXISTS offer_id TEXT,
    ADD COLUMN IF NOT EXISTS bundle_label TEXT,
    ADD COLUMN IF NOT EXISTS variant_label TEXT,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS wilaya_id TEXT,
    ADD COLUMN IF NOT EXISTS wilaya_name TEXT,
    ADD COLUMN IF NOT EXISTS commune TEXT,
    ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'home',
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
    ADD COLUMN IF NOT EXISTS recovered_order_number TEXT,
    ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

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

-- Public storefront upsert RPC (safe for anonymous shoppers — cannot read other records)
CREATE OR REPLACE FUNCTION public.upsert_abandoned_order(
    p_store_id UUID,
    p_session_id TEXT,
    p_customer_phone TEXT,
    p_customer_name TEXT DEFAULT NULL,
    p_landing_page_id UUID DEFAULT NULL,
    p_landing_page_title TEXT DEFAULT NULL,
    p_offer_id TEXT DEFAULT NULL,
    p_bundle_label TEXT DEFAULT NULL,
    p_variant_label TEXT DEFAULT NULL,
    p_wilaya_id TEXT DEFAULT NULL,
    p_wilaya_name TEXT DEFAULT NULL,
    p_commune TEXT DEFAULT NULL,
    p_delivery_type TEXT DEFAULT 'home',
    p_subtotal NUMERIC DEFAULT 0,
    p_shipping_fee NUMERIC DEFAULT 0,
    p_total NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_phone TEXT;
    v_session TEXT;
    v_id UUID;
BEGIN
    v_session := left(trim(COALESCE(p_session_id, '')), 80);
    v_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    IF left(v_phone, 5) = '00213' AND length(v_phone) >= 13 THEN
        v_phone := '0' || substr(v_phone, 6);
    ELSIF left(v_phone, 3) = '213' AND length(v_phone) >= 11 THEN
        v_phone := '0' || substr(v_phone, 4);
    ELSIF length(v_phone) = 9 AND left(v_phone, 1) IN ('5', '6', '7') THEN
        v_phone := '0' || v_phone;
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
        v_session,
        p_store_id,
        p_landing_page_id,
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
        'new',
        now(),
        now()
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

-- Public storefront completion RPC (marks session recovered when shopper submits real order)
CREATE OR REPLACE FUNCTION public.complete_abandoned_order(
    p_store_id UUID,
    p_session_id TEXT,
    p_order_number TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    UPDATE public.abandoned_orders
    SET status = 'recovered',
        recovered_order_number = COALESCE(NULLIF(trim(COALESCE(p_order_number, '')), ''), recovered_order_number),
        updated_at = now()
    WHERE store_id = p_store_id
      AND session_id = trim(COALESCE(p_session_id, ''));
    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_abandoned_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_abandoned_order(UUID, TEXT, TEXT) TO anon, authenticated;

COMMIT;
