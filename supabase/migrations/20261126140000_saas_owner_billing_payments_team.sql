-- ==============================================================================
-- PHASE 1 SAAS EXPANSION: PLATFORM OWNER, SUBSCRIPTIONS, ONLINE PAYMENTS & TEAM
-- Safe, idempotent migration — run in Supabase > SQL Editor
-- ==============================================================================
BEGIN;

-- 1. Extend plans table with concrete SaaS limits
ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS tagline_ar TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 14,
    ADD COLUMN IF NOT EXISTS max_landing_pages INTEGER NOT NULL DEFAULT 25,
    ADD COLUMN IF NOT EXISTS max_monthly_orders INTEGER NOT NULL DEFAULT 1000,
    ADD COLUMN IF NOT EXISTS max_team_members INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS allow_online_payment BOOLEAN NOT NULL DEFAULT true;

INSERT INTO public.plans (
    id, name, name_ar, tagline_ar, price_dzd, billing_period, trial_days,
    features, is_popular, max_products, max_landing_pages, max_monthly_orders,
    max_team_members, allow_online_payment, commission_rate
) VALUES
    (
        'plan_free', 'Starter Trial', 'التجريبية / المجانية',
        'للانطلاق السريع وتجربة المنصة لمدة 14 يوماً',
        0, 'شهرياً', 14,
        '["حتى 3 صفحات هبوط منشورة","حتى 50 طلباً شهرياً","حساب مالك المتجر فقط","الدفع عند الاستلام لكل الولايات"]'::jsonb,
        false, 3, 3, 50, 1, false, 0
    ),
    (
        'plan_pro', 'Pro', 'الاحترافية',
        'للمتاجر النشطة وحملات الإعلانات اليومية',
        2900, 'شهرياً', 14,
        '["حتى 25 صفحة هبوط احترافية","حتى 1,000 طلب شهرياً","فريق عمل حتى 3 موظفين","تفعيل الدفع الإلكتروني Chargily وبريدي موب"]'::jsonb,
        true, 25, 25, 1000, 3, true, 0
    ),
    (
        'plan_business', 'Business', 'الأعمال والنمو',
        'للفرق الكبيرة وحجم الطلبات المرتفع بدون قيود',
        6900, 'شهرياً', 14,
        '["صفحات هبوط غير محدودة","طلبات شهرية غير محدودة","فريق عمل حتى 10 موظفين","جميع وسائل الدفع الإلكتروني والنطاق المخصص"]'::jsonb,
        false, 9999, 9999, 999999, 10, true, 0
    )
ON CONFLICT (id) DO UPDATE SET
    name_ar = EXCLUDED.name_ar,
    tagline_ar = EXCLUDED.tagline_ar,
    price_dzd = EXCLUDED.price_dzd,
    trial_days = EXCLUDED.trial_days,
    max_landing_pages = EXCLUDED.max_landing_pages,
    max_monthly_orders = EXCLUDED.max_monthly_orders,
    max_team_members = EXCLUDED.max_team_members,
    allow_online_payment = EXCLUDED.allow_online_payment;

-- 2. Extend stores with trial/subscription expiry and suspension reason
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- 3. Extend orders for Chargily & BaridiMob payments
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'failed')),
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;

-- 4. Merchant subscription upgrade requests (BaridiMob receipts / Chargily)
CREATE TABLE IF NOT EXISTS public.subscription_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.plans(id),
    amount_dzd NUMERIC NOT NULL DEFAULT 0 CHECK (amount_dzd >= 0),
    payment_method TEXT NOT NULL DEFAULT 'baridimob' CHECK (payment_method IN ('baridimob', 'chargily', 'manual')),
    receipt_image_url TEXT,
    transaction_ref TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_requests_store ON public.subscription_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON public.subscription_requests(status);

-- 5. Store team members & role-based access control
CREATE TABLE IF NOT EXISTS public.store_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'order_confirmer' CHECK (role IN ('order_confirmer', 'catalog_manager')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, email)
);

CREATE INDEX IF NOT EXISTS idx_team_members_store ON public.store_team_members(store_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.store_team_members(lower(email));

-- 6. Platform-level settings (owner billing RIP & metadata)
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_requests_select ON public.subscription_requests;
CREATE POLICY sub_requests_select ON public.subscription_requests
    FOR SELECT TO authenticated
    USING (public.owns_store(store_id) OR public.is_admin());

DROP POLICY IF EXISTS sub_requests_insert ON public.subscription_requests;
CREATE POLICY sub_requests_insert ON public.subscription_requests
    FOR INSERT TO authenticated
    WITH CHECK (public.owns_store(store_id));

DROP POLICY IF EXISTS team_members_select ON public.store_team_members;
CREATE POLICY team_members_select ON public.store_team_members
    FOR SELECT TO authenticated
    USING (public.owns_store(store_id) OR public.is_admin());

DROP POLICY IF EXISTS team_members_manage ON public.store_team_members;
CREATE POLICY team_members_manage ON public.store_team_members
    FOR ALL TO authenticated
    USING (public.owns_store(store_id) OR public.is_admin())
    WITH CHECK (public.owns_store(store_id) OR public.is_admin());

DROP POLICY IF EXISTS platform_settings_admin ON public.platform_settings;
CREATE POLICY platform_settings_admin ON public.platform_settings
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

COMMIT;
