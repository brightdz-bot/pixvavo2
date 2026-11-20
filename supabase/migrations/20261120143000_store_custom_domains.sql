-- ==============================================================================
-- Multi-Store Independent Custom Domains (Self-Healing & Idempotent)
-- Allows each store in public.stores to bind its own independent custom domain
-- (e.g. myshop.com) so multiple stores run from one platform deployment.
-- ==============================================================================
BEGIN;

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- Normalize any existing values cleanly (lowercase, no protocol/www/path)
UPDATE public.stores
SET custom_domain = NULLIF(
    regexp_replace(
        regexp_replace(
            lower(trim(COALESCE(custom_domain, ''))),
            '^https?://',
            ''
        ),
        '^www\.',
        ''
    ),
    ''
)
WHERE custom_domain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_custom_domain_unique
    ON public.stores (lower(custom_domain))
    WHERE custom_domain IS NOT NULL AND trim(custom_domain) <> '';

COMMIT;
