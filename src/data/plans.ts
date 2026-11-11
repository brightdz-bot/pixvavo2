import { Plan } from '../types';

export const SAAS_PLANS: Plan[] = [
  {
    id: 'plan_trial',
    name: 'Free Trial',
    nameAr: 'الخطة التجريبية',
    priceDZD: 0,
    billingPeriod: '14 يوم مجاناً',
    features: [
      'حتى 15 منتج',
      'نطاق فرعي متجر.dokani.dz',
      'إدارة الطلبات والزبائن',
      'دفع عند الاستلام (COD)',
      'تحديد أسعار التوصيل لـ 58 ولاية',
      'دعم عبر البريد الإلكتروني'
    ],
    maxProducts: 15,
    commissionRate: 0,
  },
  {
    id: 'plan_starter',
    name: 'Starter',
    nameAr: 'خطة الانطلاق',
    priceDZD: 2900,
    billingPeriod: 'شهرياً',
    features: [
      'حتى 100 منتج مع صور عالية الدقة',
      'نطاق فرعي مخصص مع شهادة SSL',
      'تتبع الطلبات وحالات الشحن',
      'طباعة بوليصات الشحن وفواتير الزبائن',
      'إحصائيات المبيعات خلال 7 و 30 يوماً',
      'تنبيهات فورية عند انخفاض المخزون'
    ],
    isPopular: false,
    maxProducts: 100,
    commissionRate: 0,
  },
  {
    id: 'plan_pro',
    name: 'Professional',
    nameAr: 'خطة المحترفين',
    priceDZD: 5900,
    billingPeriod: 'شهرياً',
    features: [
      'منتجات غير محدودة ومتغيرات الألوان والمقاسات',
      'دعم النطاق الخاص بك (مثل: store.com أو .dz)',
      'تخصيص كامل لألوان وهوية المتجر',
      'تحليلات الأرباح والتكاليف المتقدمة',
      'ربط تلقائي مع شركات الشحن الجزائرية (ياليدين، زيروكس)',
      'دعم فني عبر واتساب ذو أولوية 24/7'
    ],
    isPopular: true,
    maxProducts: 9999,
    commissionRate: 0,
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    nameAr: 'كبار التجار والشركات',
    priceDZD: 12000,
    billingPeriod: 'شهرياً',
    features: [
      'كل مزايا خطة المحترفين',
      'حسابات متعددة للموظفين والمخازن',
      'ربط واجهات برمجية API مخصصة',
      'إدارة متقدمة لمرتجعات التوصيل',
      'تصاميم حصرية مخصصة لمتجرك',
      'مدير حساب جزائري مخصص'
    ],
    isPopular: false,
    maxProducts: 99999,
    commissionRate: 0,
  }
];
