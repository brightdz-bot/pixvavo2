import { Plan } from '../types';

export const DEFAULT_PLATFORM_PLANS: Plan[] = [
  {
    id: 'plan_free',
    name: 'Starter Trial',
    nameAr: 'التجريبية / المجانية',
    taglineAr: 'للانطلاق السريع وتجربة المنصة لمدة 14 يوماً',
    priceDZD: 0,
    billingPeriod: 'شهرياً',
    trialDays: 14,
    maxProducts: 3,
    maxLandingPages: 3,
    maxMonthlyOrders: 50,
    maxTeamMembers: 1,
    allowOnlinePayment: false,
    commissionRate: 0,
    isPopular: false,
    features: [
      'حتى 3 صفحات هبوط منشورة',
      'حتى 50 طلباً شهرياً',
      'حساب مالك المتجر فقط (1 مستخدم)',
      'الدفع عند الاستلام مع 58 ولاية و1541 بلدية',
      'تتبع الطلبات للزبائن وتنبيهات واتساب'
    ]
  },
  {
    id: 'plan_pro',
    name: 'Pro',
    nameAr: 'الاحترافية',
    taglineAr: 'للمتاجر النشطة وحملات الإعلانات اليومية',
    priceDZD: 2900,
    billingPeriod: 'شهرياً',
    trialDays: 14,
    maxProducts: 25,
    maxLandingPages: 25,
    maxMonthlyOrders: 1000,
    maxTeamMembers: 3,
    allowOnlinePayment: true,
    commissionRate: 0,
    isPopular: true,
    features: [
      'حتى 25 صفحة هبوط احترافية',
      'حتى 1,000 طلب شهرياً بدون عمولة',
      'فريق عمل حتى 3 موظفين (تأكيد طلبات + منتجات)',
      'تفعيل الدفع الإلكتروني (البطاقة الذهبية CIB وChargily وبريدي موب)',
      'الربط المباشر مع شركات التوصيل وبكسل Meta وTikTok'
    ]
  },
  {
    id: 'plan_business',
    name: 'Business',
    nameAr: 'الأعمال والنمو',
    taglineAr: 'للفرق الكبيرة وحجم الطلبات المرتفع بدون قيود',
    priceDZD: 6900,
    billingPeriod: 'شهرياً',
    trialDays: 14,
    maxProducts: 9999,
    maxLandingPages: 9999,
    maxMonthlyOrders: 999999,
    maxTeamMembers: 10,
    allowOnlinePayment: true,
    commissionRate: 0,
    isPopular: false,
    features: [
      'صفحات هبوط غير محدودة',
      'طلبات شهرية غير محدودة بدون أي عمولة',
      'فريق عمل حتى 10 موظفين بصلاحيات مخصصة',
      'جميع وسائل الدفع الإلكتروني والربط البرمجي الكامل',
      'أولوية الدعم الفني وربط النطاق الخاص المخصص'
    ]
  }
];

export function resolvePlanById(planId?: string | null, plans: Plan[] = DEFAULT_PLATFORM_PLANS): Plan {
  const clean = String(planId || '').trim();
  return plans.find(p => p.id === clean) || plans.find(p => p.id === 'plan_pro') || plans[0];
}

export function isUnlimitedLimit(limit?: number): boolean {
  return typeof limit === 'number' && limit >= 9000;
}

export function formatLimitLabel(limit?: number): string {
  if (!limit || limit <= 0) return '0';
  if (isUnlimitedLimit(limit)) return 'غير محدود';
  return String(limit);
}

export function getDaysRemaining(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return null;
  const diff = ts - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}
