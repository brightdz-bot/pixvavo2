export type OrderStatus = 'new' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled';

export type DeliveryType = 'home' | 'stop';

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  price: number; // DZD
  quantity: number;
  variantText?: string;
  imageUrl?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  storeId: string;
  landingPageId?: string;
  bundleLabel?: string;
  customerName: string;
  customerPhone: string;
  wilayaId: string;
  wilayaName: string;
  commune?: string;
  deliveryType?: DeliveryType;
  address: string;
  items: OrderItem[];
  subtotal: number; // DZD
  shippingFee: number; // DZD
  total: number; // DZD
  status: OrderStatus;
  trackingCode?: string;
  courierProvider?: string;
  courierLabelUrl?: string;
  statusHistory: StatusHistoryEntry[];
  paymentMethod: 'cod'; // Cash on Delivery (الدفع عند الاستلام)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AbandonedOrderStatus = 'new' | 'contacted' | 'recovered' | 'dismissed';

export interface AbandonedOrder {
  id: string;
  sessionId: string;
  storeId: string;
  landingPageId?: string;
  landingPageTitle?: string;
  offerId?: string;
  bundleLabel?: string;
  variantLabel?: string;
  customerName?: string;
  customerPhone: string;
  wilayaId?: string;
  wilayaName?: string;
  commune?: string;
  deliveryType: DeliveryType;
  subtotal: number;
  shippingFee: number;
  total: number;
  status: AbandonedOrderStatus;
  recoveredOrderNumber?: string;
  contactedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  name: string; // e.g. المقاس أو اللون
  options: string[]; // e.g. ["S", "M", "L", "XL"] أو ["أسود", "أبيض"]
}

export interface Product {
  id: string;
  storeId: string;
  title: string;
  description: string;
  price: number; // DZD
  comparePrice?: number; // DZD
  costPrice?: number; // DZD for profit calculation
  category: string;
  stock: number;
  sku?: string;
  imageUrl: string;
  additionalImages?: string[];
  variants?: ProductVariant[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LandingPageOffer {
  id: string;
  title: string;
  subtitle: string;
  quantity: number;
  price: number; // DZD
  costPrice?: number; // DZD (سعر تكلفة الباقة الإجمالي)
  comparePrice?: number; // DZD
  badge?: string;
  isDefault?: boolean;
}

export interface LandingPageTheme {
  presetId: string;
  name: string;
  primaryColor: string;
  primaryHoverColor: string;
  bgColor: string;
  surfaceColor: string;
  softTintColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  isDark?: boolean;
  headingFont?: string;
  bodyFont?: string;
}

export interface LandingPageReview {
  id: string;
  author: string;
  wilaya?: string;
  rating: number; // 1..5
  comment: string;
  createdAt?: string;
}

export interface PromoCoupon {
  id: string;
  code: string;
  type: 'fixed' | 'percent';
  value: number;
  minOrder?: number;
  isActive: boolean;
  createdAt?: string;
}

export interface LandingPageOrderBump {
  enabled: boolean;
  title: string;
  subtitle?: string;
  price: number; // DZD
  comparePrice?: number; // DZD
  costPrice?: number; // DZD
  imageUrl?: string;
}

export interface LandingPageUpsell {
  enabled: boolean;
  title: string;
  subtitle?: string;
  price: number; // DZD
  comparePrice?: number; // DZD
  costPrice?: number; // DZD
  imageUrl?: string;
  targetLandingPageId?: string;
}

export interface LandingPageFaq {
  id: string;
  question: string;
  answer: string;
}

export interface LandingPageIntegrations {
  pixelId?: string;
  tiktokPixelId?: string;
  whatsappNumber?: string;
  googleSheetWebhook?: string;
  variants?: ProductVariant[];
  reviews?: LandingPageReview[];
  orderBump?: LandingPageOrderBump;
  postPurchaseUpsell?: LandingPageUpsell;
  faqs?: LandingPageFaq[];
  detailImages?: string[];
  urgency?: {
    showStock?: boolean;
    stockThreshold?: number;
    countdownEndsAt?: string;
    countdownText?: string;
  };
  ab?: {
    variantSlug?: string;
    splitToB?: number;
  };
}

export interface LandingPage {
  id: string;
  storeId: string;
  slug: string;
  title: string;
  highlightTitle?: string;
  description: string;
  category: string;
  stock: number;
  badgeText?: string;
  mainImage: string;
  galleryImages: string[];
  offers: LandingPageOffer[];
  variants?: ProductVariant[];
  reviews?: LandingPageReview[];
  orderBump?: LandingPageOrderBump;
  postPurchaseUpsell?: LandingPageUpsell;
  faqs?: LandingPageFaq[];
  detailImages?: string[];
  theme: LandingPageTheme;
  integrations: LandingPageIntegrations;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WilayaRate {
  home: number;
  stop: number;
}

export interface Wilaya {
  id: string;
  code: string; // "16" for Alger, etc.
  nameAr: string;
  nameFr: string;
  standardDeliveryFee: number; // Home fee default
  homeFee: number; // DZD Home delivery
  stopFee: number; // DZD Stop Desk
  deliveryDays: string;
  communes: string[];
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  description?: string;
  announcementText?: string;
  logoUrl?: string;
  faviconUrl?: string;
  brandColor: string; // Hex e.g. #754b2d
  storefrontTheme?: 'dark' | 'light';
  storefrontHeadingFont?: string;
  storefrontBodyFont?: string;
  freeShippingThreshold: number; // DZD (0 = disabled)
  planId: string;
  status: 'active' | 'suspended' | 'trial';
  phone?: string;
  defaultWhatsapp?: string;
  defaultPixelId?: string;
  tiktokPixelId?: string;
  googleSheetWebhook?: string;
  customWilayaFees?: Record<string, number>;
  customWilayaRates?: Record<string, WilayaRate>;
  createdAt: string;
  updatedAt: string;
}

export type CourierProvider = 'none' | 'ecotrack' | 'yalidine' | 'zrexpress' | 'guepex' | 'maystro' | 'procolis';

export type WhatsAppApiProvider = 'none' | 'meta_cloud' | 'evolution' | 'webhook';

export interface ApiDiagnosticLog {
  id: string;
  service: 'courier' | 'meta_capi' | 'tiktok' | 'google_sheet' | 'whatsapp';
  action: string;
  status: 'success' | 'error';
  message: string;
  latencyMs?: number;
  orderNumber?: string;
  timestamp: string;
}

export interface BlacklistEntry {
  phone: string;
  reason?: string;
  addedAt: string;
}

export interface StoreApiConfig {
  storeId: string;
  courierProvider: CourierProvider;
  courierApiId: string;
  courierApiToken: string;
  courierFromWilayaId: string;
  courierFromWilayaName: string;
  courierSenderName: string;
  courierBaseUrl: string;
  courierAutoSendOnConfirm: boolean;
  metaPixelId: string;
  metaCapiEnabled: boolean;
  metaCapiToken: string;
  metaTestEventCode: string;
  tiktokPixelId: string;
  tiktokEventsEnabled: boolean;
  tiktokEventsToken: string;
  tiktokTestEventCode: string;
  whatsappProvider: WhatsAppApiProvider;
  whatsappApiUrl: string;
  whatsappInstance: string;
  whatsappPhoneNumberId: string;
  whatsappApiToken: string;
  whatsappTemplateName: string;
  whatsappAutoSendOnOrder: boolean;
  whatsappAutoSendOnShipping: boolean;
  googleSheetWebhook: string;
  adSpendTotal?: number;
  adSpendByPage?: Record<string, number>;
  antiFraudEnabled?: boolean;
  duplicateWindowHours?: number;
  dailyMaxOrdersPerPhone?: number;
  autoFlagReturnsThreshold?: number;
  blacklistedPhones?: BlacklistEntry[];
  promoCodesEnabled?: boolean;
  promoCoupons?: PromoCoupon[];
  whatsappConfirmTemplate?: string;
  whatsappShippingTemplate?: string;
  whatsappAbandonedTemplate?: string;
  faviconUrl?: string;
  diagnosticLogs: ApiDiagnosticLog[];
  updatedAt?: string;
}

export interface Plan {
  id: string;
  name: string;
  nameAr: string;
  priceDZD: number; // Monthly price in DZD
  billingPeriod: string;
  features: string[];
  isPopular?: boolean;
  maxProducts: number;
  commissionRate: number;
}

export type UserRole = 'visitor' | 'merchant' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  storeId?: string;
}
