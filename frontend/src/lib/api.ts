import type {
  User,
  Store,
  MenuCategory,
  PickupSlot,
  Cart,
  CartItem,
  Order,
  LoyaltyAccount,
  LoyaltyTransaction,
  LoyaltyTier,
  Reward,
  Voucher,
  AppNotification,
  Wallet,
  WalletTransaction,
  Promo,
  SplashContent,
  AppConfig,
  ReferralInfo,
  PaymentIntent,
  AuthTokens,
  PaginatedResponse,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://app.loyaltysystem.uk/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fnb_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fnb_refresh_token");
}

function setTokens(tokens: AuthTokens): void {
  localStorage.setItem("fnb_token", tokens.token);
  localStorage.setItem("fnb_refresh_token", tokens.refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem("fnb_token");
  localStorage.removeItem("fnb_refresh_token");
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const data = await res.json();
      setTokens({ token: data.token, refreshToken: data.refreshToken });
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = getToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
      }
      res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(res.status, error.detail ?? error.message ?? "Request failed", error);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export const auth = {
  sendOTP: (phone: string) =>
    request<{ session_id: string; retry_after_seconds: number; expires_in_seconds: number }>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  verifyOTP: (phone: string, code: string, sessionId?: string) =>
    request<AuthTokens>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code, ...(sessionId ? { session_id: sessionId } : {}) }),
    }),

  register: (name: string, email: string, phone: string, password: string) =>
    request<AuthTokens>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, phone, password }),
    }),

  loginPassword: (email: string, password: string) =>
    request<AuthTokens>("/auth/login-password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  refreshToken: (refreshToken: string) =>
    request<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),
};

export const users = {
  getMe: () => request<User>("/users/me"),

  updateMe: (data: Partial<Pick<User, "name" | "email" | "avatar">>) =>
    request<User>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const stores = {
  listStores: (params?: { page?: number; pageSize?: number; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return request<PaginatedResponse<Store>>(`/stores${qs ? `?${qs}` : ""}`);
  },

  getStore: (id: string) => request<Store>(`/stores/${id}`),

  getStoreMenu: (id: string) =>
    request<MenuCategory[]>(`/stores/${id}/menu`),

  getPickupSlots: (id: string, date?: string) => {
    const query = date ? `?date=${date}` : "";
    return request<PickupSlot[]>(`/stores/${id}/pickup-slots${query}`);
  },
};

export const cart = {
  getCart: () => request<Cart>("/cart"),

  addToCart: (storeId: string, menuItemId: string, quantity: number, selectedOptions?: Record<string, string[]>, specialInstructions?: string) =>
    request<Cart>("/cart/items", {
      method: "POST",
      body: JSON.stringify({ storeId, menuItemId, quantity, selectedOptions, specialInstructions }),
    }),

  updateCartItem: (itemId: string, quantity: number) =>
    request<Cart>(`/cart/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),

  removeCartItem: (itemId: string) =>
    request<Cart>(`/cart/items/${itemId}`, { method: "DELETE" }),

  clearCart: () => request<Cart>("/cart", { method: "DELETE" }),
};

export const orders = {
  createOrder: (data: {
    storeId: string;
    orderMode: string;
    tableNumber?: string;
    pickupSlotId?: string;
    deliveryAddress?: string;
    voucherCode?: string;
    loyaltyPoints?: number;
    paymentMethod: string;
  }) =>
    request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listOrders: (params?: { page?: number; pageSize?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.status) query.set("status", params.status);
    const qs = query.toString();
    return request<PaginatedResponse<Order>>(`/orders${qs ? `?${qs}` : ""}`);
  },

  getOrder: (id: string) => request<Order>(`/orders/${id}`),

  cancelOrder: (id: string) =>
    request<Order>(`/orders/${id}/cancel`, { method: "POST" }),
};

export const loyalty = {
  getBalance: () => request<LoyaltyAccount>("/loyalty/balance"),

  getHistory: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return request<PaginatedResponse<LoyaltyTransaction>>(`/loyalty/history${qs ? `?${qs}` : ""}`);
  },

  getTiers: () => request<LoyaltyTier[]>("/loyalty/tiers"),
};

export const rewards = {
  listRewards: () => request<Reward[]>("/rewards"),

  redeemReward: (rewardId: string) =>
    request<Reward>(`/rewards/${rewardId}/redeem`, { method: "POST" }),
};

export const vouchers = {
  validateVoucher: (code: string) =>
    request<Voucher>("/vouchers/validate", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  applyVoucher: (code: string, orderId: string) =>
    request<Voucher>("/vouchers/apply", {
      method: "POST",
      body: JSON.stringify({ code, orderId }),
    }),
};

export const favorites = {
  listFavorites: () => request<Store[]>("/favorites"),

  addFavorite: (storeId: string) =>
    request<void>("/favorites", {
      method: "POST",
      body: JSON.stringify({ storeId }),
    }),

  removeFavorite: (storeId: string) =>
    request<void>(`/favorites/${storeId}`, { method: "DELETE" }),
};

export const notifications = {
  listNotifications: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return request<PaginatedResponse<AppNotification>>(`/notifications${qs ? `?${qs}` : ""}`);
  },

  markRead: (id: string) =>
    request<void>(`/notifications/${id}/read`, { method: "POST" }),

  markAllRead: () =>
    request<void>("/notifications/read-all", { method: "POST" }),
};

export const wallet = {
  getWallet: () => request<Wallet>("/wallet"),

  topUp: (amount: number, _paymentMethod?: string) =>
    request<Wallet>("/wallet/topup", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  getTransactions: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return request<PaginatedResponse<WalletTransaction>>(`/wallet/transactions${qs ? `?${qs}` : ""}`);
  },
};

export const promos = {
  listPromos: () => request<Promo[]>("/promos"),
};

export const referral = {
  getCode: () => request<ReferralInfo>("/referral/code"),

  applyCode: (code: string) =>
    request<void>("/referral/apply", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};

export const config = {
  getConfig: () => request<AppConfig>("/config"),
};

export const splash = {
  getSplash: () => request<SplashContent[]>("/splash"),
};

export const payments = {
  createIntent: (data: { orderId: string | number; method?: string; provider?: string; idempotencyKey?: string }) =>
    request<PaymentIntent>("/payments/create-intent", {
      method: "POST",
      body: JSON.stringify({
        order_id: Number(data.orderId),
        method: data.method ?? "wallet",
        provider: data.provider,
        idempotency_key: data.idempotencyKey,
      }),
    }),

  confirmPayment: (paymentIntentId: string | number, providerReference?: string) =>
    request<PaymentIntent>("/payments/confirm", {
      method: "POST",
      body: JSON.stringify({ paymentIntentId, providerReference }),
    }),
};

export { setTokens, clearTokens };
