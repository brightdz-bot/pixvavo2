-- Storefront appearance: dark (default) or light, chosen by the merchant in Settings.
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS storefront_theme TEXT NOT NULL DEFAULT 'dark'
    CHECK (storefront_theme IN ('dark', 'light'));
