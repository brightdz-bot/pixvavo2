import { LandingPage } from '../types';
import { LANDING_THEME_PRESETS } from './wilayas';
import { DEFAULT_ASSETS } from './defaultAssets';

export const LEVITATING_LAMP_SLUG = 'levitating-lamp';

export function createLevitatingLampLandingPage(
  storeId: string,
  options?: { id?: string; slug?: string; whatsappNumber?: string }
): LandingPage {
  const now = new Date().toISOString();
  return {
    id: options?.id !== undefined ? options.id : 'lp_levitating_lamp',
    storeId,
    slug: options?.slug || LEVITATING_LAMP_SLUG,
    title: 'المصباح المغناطيسي الطائر الفاخر',
    highlightTitle: 'بقاعدة خشب الجوز الطبيعي وإضاءة دافئة',
    description:
      'قطعة ديكور استثنائية تخطف الأنظار في مكتبك أو غرفة معيشتك! مصباح زجاجي يطفو في الهواء ويدور بهدوء 360 درجة بفضل تقنية الرفع المغناطيسي، مع قاعدة من خشب الجوز الطبيعي وزر تشغيل باللمس وإضاءة دافئة موفرة للطاقة.',
    category: 'الإضاءة والديكور الفاخر',
    stock: 25,
    badgeText: 'إصدار فاخر',
    mainImage: DEFAULT_ASSETS.levitatingLampMain,
    galleryImages: [
      DEFAULT_ASSETS.levitatingLampMain,
      DEFAULT_ASSETS.levitatingLampDesk,
      DEFAULT_ASSETS.levitatingLampNight,
      DEFAULT_ASSETS.levitatingLampDetail
    ],
    offers: [
      {
        id: 'lamp1',
        title: 'قطعة واحدة (العرض الأساسي)',
        subtitle: 'مصباح مغناطيسي طائر + قاعدة خشب الجوز + محول الطاقة',
        quantity: 1,
        price: 29000,
        costPrice: 16500,
        isDefault: true
      },
      {
        id: 'lamp2',
        title: 'عرض القطعتين (توفير 4,000 دج)',
        subtitle: 'مناسب لغرفة المعيشة والمكتب أو كهدية فاخرة',
        quantity: 2,
        price: 54000,
        costPrice: 32000,
        comparePrice: 58000,
        badge: 'الأكثر توفيراً',
        isDefault: false
      },
      {
        id: 'lamp3',
        title: 'عرض 3 قطع (باقة الهدايا والمكاتب)',
        subtitle: 'أكبر خصم لتجهيز المكاتب والهدايا المميزة',
        quantity: 3,
        price: 78000,
        costPrice: 47000,
        comparePrice: 87000,
        badge: 'توفير 9,000 دج',
        isDefault: false
      }
    ],
    theme: { ...LANDING_THEME_PRESETS[0] },
    integrations: {
      pixelId: '',
      whatsappNumber: options?.whatsappNumber ?? '',
      googleSheetWebhook: ''
    },
    faqs: [],
    isPublished: true,
    createdAt: now,
    updatedAt: now
  };
}
