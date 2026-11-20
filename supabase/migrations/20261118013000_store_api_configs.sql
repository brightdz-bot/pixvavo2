-- ==============================================================================
-- Owner-Only Store API Configurations (Couriers, Meta CAPI, TikTok, WhatsApp API)
-- Self-healing & safe to run multiple times (idempotent).
-- ==============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.owns_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$;

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS store_id UUID,
    ADD COLUMN IF NOT EXISTS courier_provider TEXT,
    ADD COLUMN IF NOT EXISTS courier_label_url TEXT;

CREATE TABLE IF NOT EXISTS public.store_api_configs (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    diagnostic_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_api_configs
    ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS diagnostic_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_touch_store_api_configs ON public.store_api_configs;
CREATE TRIGGER trg_touch_store_api_configs
    BEFORE UPDATE ON public.store_api_configs
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.store_api_configs ENABLE ROW LEVEL SECURITY;

-- Strict Owner-Only RLS: never expose API tokens to anon storefront
DROP POLICY IF EXISTS store_api_configs_owner_select ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_select ON public.store_api_configs
    FOR SELECT TO authenticated USING (public.owns_store(public.store_api_configs.store_id));

DROP POLICY IF EXISTS store_api_configs_owner_insert ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_insert ON public.store_api_configs
    FOR INSERT TO authenticated WITH CHECK (public.owns_store(public.store_api_configs.store_id));

DROP POLICY IF EXISTS store_api_configs_owner_update ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_update ON public.store_api_configs
    FOR UPDATE TO authenticated USING (public.owns_store(public.store_api_configs.store_id)) WITH CHECK (public.owns_store(public.store_api_configs.store_id));

DROP POLICY IF EXISTS store_api_configs_owner_delete ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_delete ON public.store_api_configs
    FOR DELETE TO authenticated USING (public.owns_store(public.store_api_configs.store_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_api_configs TO authenticated;

COMMIT;
