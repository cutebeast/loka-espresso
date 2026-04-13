export interface User {
  id: string;
  phone: string;
  email?: string;
  name: string;
  avatar?: string;
  loyaltyTier?: string;
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  description?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  logo?: string;
  coverImage?: string;
  openingTime?: string;
  closingTime?: string;
  isActive: boolean;
  rating?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category: string;
  isAvailable: boolean;
  preparationTime?: number;
  dietary?: string[];
  options?: MenuItemOption[];
}

export interface MenuItemOption {
  id: string;
  name: string;
  choices?: MenuItemOptionChoice[];
}

export interface MenuItemOptionChoice {
  id: string;
  name: string;
  price: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface CartItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  selectedOptions?: MenuItemOptionChoice[];
  specialInstructions?: string;
  totalPrice: number;
}

export interface Cart {
  storeId: string;
  items: CartItem[];
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  total: number;
}

export interface PickupSlot {
  id: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "cancelled";

export type OrderMode = "dine_in" | "pickup" | "delivery";

export interface Order {
  id: string;
  storeId: string;
  store?: Store;
  items: CartItem[];
  status: OrderStatus;
  orderMode: OrderMode;
  tableNumber?: string;
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  discount: number;
  total: number;
  loyaltyPointsEarned: number;
  loyaltyPointsUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyAccount {
  points: number;
  tier: string;
  lifetimePoints: number;
  nextTier?: string;
  nextTierPoints?: number;
}

export interface LoyaltyTransaction {
  id: string;
  type: "earn" | "redeem";
  points: number;
  description: string;
  createdAt: string;
}

export interface LoyaltyTier {
  id: string;
  name: string;
  minPoints: number;
  benefits: string[];
  color?: string;
  icon?: string;
}

export interface Reward {
  id: string;
  name: string;
  description?: string;
  image?: string;
  pointsCost: number;
  isAvailable: boolean;
  expiresAt?: string;
}

export interface Voucher {
  id: string;
  code: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  expiresAt?: string;
  isValid: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface Wallet {
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: "top_up" | "payment" | "refund";
  amount: number;
  description: string;
  createdAt: string;
}

export interface Promo {
  id: string;
  title: string;
  description?: string;
  image?: string;
  code?: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface SplashContent {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  actionUrl?: string;
  sortOrder: number;
}

export interface AppConfig {
  supportPhone?: string;
  supportEmail?: string;
  minOrderAmount?: number;
  deliveryFee?: number;
  serviceFeePercent?: number;
  loyaltyEnabled?: boolean;
  walletEnabled?: boolean;
  referralBonusPoints?: number;
}

export interface ReferralInfo {
  code: string;
  referredCount: number;
  earnedPoints: number;
}

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  provider: string;
  amount: number;
  currency: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
