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
  statusHistory: StatusHistoryEntry[];
  paymentMethod: 'cod'; // Cash on Delivery (الدفع عند الاستلام)
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
}

export interface LandingPageIntegrations {
  pixelId?: string;
  whatsappNumber?: string;
  googleSheetWebhook?: string;
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
  description?: string;
  announcementText?: string;
  logoUrl?: string;
  brandColor: string; // Hex e.g. #754b2d
  freeShippingThreshold: number; // DZD (0 = disabled)
  planId: string;
  status: 'active' | 'suspended' | 'trial';
  phone?: string;
  defaultWhatsapp?: string;
  defaultPixelId?: string;
  googleSheetWebhook?: string;
  customWilayaFees?: Record<string, number>;
  customWilayaRates?: Record<string, WilayaRate>;
  createdAt: string;
  updatedAt: string;
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
