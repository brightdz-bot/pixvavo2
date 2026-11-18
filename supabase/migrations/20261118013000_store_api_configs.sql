-- ==============================================================================
-- Owner-Only Store API Configurations (Couriers, Meta CAPI, TikTok, WhatsApp API)
-- Safe to run multiple times (idempotent).
-- ==============================================================================
BEGIN;

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS courier_provider TEXT,
    ADD COLUMN IF NOT EXISTS courier_label_url TEXT;

CREATE TABLE IF NOT EXISTS public.store_api_configs (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    diagnostic_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_touch_store_api_configs ON public.store_api_configs;
CREATE TRIGGER trg_touch_store_api_configs
    BEFORE UPDATE ON public.store_api_configs
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.store_api_configs ENABLE ROW LEVEL SECURITY;

-- Strict Owner-Only RLS: never expose API tokens to anon storefront
DROP POLICY IF EXISTS store_api_configs_owner_select ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_select ON public.store_api_configs
    FOR SELECT TO authenticated USING (public.owns_store(store_id));

DROP POLICY IF EXISTS store_api_configs_owner_insert ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_insert ON public.store_api_configs
    FOR INSERT TO authenticated WITH CHECK (public.owns_store(store_id));

DROP POLICY IF EXISTS store_api_configs_owner_update ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_update ON public.store_api_configs
    FOR UPDATE TO authenticated USING (public.owns_store(store_id)) WITH CHECK (public.owns_store(store_id));

DROP POLICY IF EXISTS store_api_configs_owner_delete ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_delete ON public.store_api_configs
    FOR DELETE TO authenticated USING (public.owns_store(store_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_api_configs TO authenticated;

COMMIT;
