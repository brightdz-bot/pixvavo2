-- Isolate authenticated merchant access from public storefront access.
-- Public visitors (anon) can read published stores and active products.
-- Authenticated merchants can read only their own store/products; platform admins can read all.
-- This migration is safe to re-run.

BEGIN;

DROP POLICY IF EXISTS stores_select ON public.stores;
DROP POLICY IF EXISTS stores_public_select ON public.stores;
DROP POLICY IF EXISTS stores_owner_admin_select ON public.stores;

CREATE POLICY stores_public_select ON public.stores
    FOR SELECT TO anon
    USING (status IN ('active', 'trial'));

CREATE POLICY stores_owner_admin_select ON public.stores
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_public_select ON public.products;
DROP POLICY IF EXISTS products_owner_admin_select ON public.products;

CREATE POLICY products_public_select ON public.products
    FOR SELECT TO anon
    USING (
        is_active = true
        AND EXISTS (
            SELECT 1
            FROM public.stores s
            WHERE s.id = products.store_id
              AND s.status IN ('active', 'trial')
        )
    );

CREATE POLICY products_owner_admin_select ON public.products
    FOR SELECT TO authenticated
    USING (public.owns_store(store_id) OR public.is_admin());

COMMIT;
