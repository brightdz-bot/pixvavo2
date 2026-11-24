-- Merchant-selectable storefront fonts (ids from src/data/fonts.ts).
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS storefront_heading_font TEXT NOT NULL DEFAULT 'reem-kufi',
    ADD COLUMN IF NOT EXISTS storefront_body_font TEXT NOT NULL DEFAULT 'plex-arabic';

GRANT UPDATE (storefront_heading_font, storefront_body_font) ON public.stores TO authenticated;
