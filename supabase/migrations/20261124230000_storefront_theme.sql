-- Storefront appearance: dark (default) or light, chosen by the merchant in Settings.
-- Also grants column-level access: public.stores uses per-column privileges, so new
-- columns must be granted explicitly or saving fails with "permission denied for table stores".
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS storefront_theme TEXT NOT NULL DEFAULT 'dark'
    CHECK (storefront_theme IN ('dark', 'light'));

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS custom_domain TEXT;

GRANT UPDATE (storefront_theme, custom_domain) ON public.stores TO authenticated;
GRANT INSERT (custom_domain) ON public.stores TO authenticated;
