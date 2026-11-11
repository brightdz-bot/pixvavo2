export type OrderStatus = 'new' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled';

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
  customerName: string;
  customerPhone: string;
  wilayaId: string;
  wilayaName: string;
  address: string;
  items: OrderItem[];
  subtotal: number; // DZD
  shippingFee: number; // DZD
  total: number; // DZD
  status: OrderStatus;
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

export interface Wilaya {
  id: string;
  code: string; // "16" for Alger, etc.
  nameAr: string;
  nameFr: string;
  standardDeliveryFee: number; // DZD
  deliveryDays: string;
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  subdomain: string;
  description?: string;
  logoUrl?: string;
  brandColor: string; // Hex e.g. #059669
  freeShippingThreshold: number; // DZD
  planId: string;
  status: 'active' | 'suspended' | 'trial';
  phone?: string;
  customWilayaFees?: Record<string, number>;
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
  commissionRate: number; // e.g. 0% or 1.5%
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
