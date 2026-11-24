-- Landing page view counters (used for A/B test stats).
CREATE TABLE IF NOT EXISTS public.landing_page_views (
    page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    PRIMARY KEY (page_id, day)
);

ALTER TABLE public.landing_page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_page_views_owner_select ON public.landing_page_views;
CREATE POLICY landing_page_views_owner_select ON public.landing_page_views
    FOR SELECT TO authenticated USING (public.owns_store(store_id) OR public.is_admin());

REVOKE ALL ON public.landing_page_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.landing_page_views TO authenticated;

-- Visitors call this once per session per page; it only touches published pages.
CREATE OR REPLACE FUNCTION public.track_page_view(p_page_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
BEGIN
    SELECT store_id INTO v_store FROM public.landing_pages
    WHERE id = p_page_id AND is_published = true;
    IF v_store IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO public.landing_page_views (page_id, store_id, day, views)
    VALUES (p_page_id, v_store, CURRENT_DATE, 1)
    ON CONFLICT (page_id, day) DO UPDATE SET views = public.landing_page_views.views + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.track_page_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_page_view(UUID) TO anon, authenticated;
