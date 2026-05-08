const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getAuthHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const json = await res.json();
    // Unwrap API envelope { success, data, message }
    if (json && typeof json === "object" && "data" in json) {
      return json.data as T;
    }
    return json as T;
  }
  return undefined as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export async function adminLogin(email: string, password: string) {
  const data = await api.post<{ tokens?: { access_token?: string }; profile?: { email?: string } }>("/admin/auth/login", { email, password });
  const token = data.tokens?.access_token;
  if (token) {
    localStorage.setItem("token", token);
    if (data.profile?.email) localStorage.setItem("adminEmail", data.profile.email);
  }
  return data;
}

export function adminLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("adminEmail");
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/* ------------------------------------------------------------------ */
/*  Reservations                                                      */
/* ------------------------------------------------------------------ */

export interface Reservation {
  id: number;
  store_name: string;
  customer_name: string;
  party_size: number;
  date: string;
  time: string;
  status: "requested" | "confirmed" | "seated" | "no_show" | "cancelled" | "completed";
}

export function getReservations(params?: { status?: string; date?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.date) qs.set("date", params.date);
  return api.get<Reservation[]>(`/admin/reservations?${qs.toString()}`);
}

export function createReservation(body: Omit<Reservation, "id">) {
  return api.post<Reservation>("/admin/reservations", body);
}

export function updateReservationStatus(id: number, status: Reservation["status"]) {
  return api.patch<Reservation>(`/admin/reservations/${id}/status`, { status });
}

/* ------------------------------------------------------------------ */
/*  Loyalty Tiers                                                     */
/* ------------------------------------------------------------------ */

export interface LoyaltyTier {
  id: number;
  name: string;
  color: string;
  min_points: number;
  multiplier: number;
}

export function getLoyaltyTiers() {
  return api.get<LoyaltyTier[]>("/admin/loyalty/tiers");
}

export function createLoyaltyTier(body: Omit<LoyaltyTier, "id">) {
  return api.post<LoyaltyTier>("/admin/loyalty/tiers", body);
}

/* ------------------------------------------------------------------ */
/*  Loyalty Accounts                                                  */
/* ------------------------------------------------------------------ */

export interface LoyaltyAccount {
  id: number;
  customer_name: string;
  tier: string;
  points_balance: number;
  lifetime_points: number;
  last_activity: string;
}

export function getLoyaltyAccounts() {
  return api.get<LoyaltyAccount[]>("/admin/loyalty/accounts");
}

/* ------------------------------------------------------------------ */
/*  Loyalty Ledger                                                    */
/* ------------------------------------------------------------------ */

export interface LoyaltyLedgerEntry {
  id: number;
  account_id: number;
  customer_name: string;
  event_type: string;
  points_delta: number;
  running_balance: number;
  created_at: string;
}

export function getLoyaltyLedger(params?: { event_type?: string; account_id?: number }) {
  const qs = new URLSearchParams();
  if (params?.event_type) qs.set("event_type", params.event_type);
  if (params?.account_id) qs.set("account_id", String(params.account_id));
  return api.get<LoyaltyLedgerEntry[]>(`/admin/loyalty/ledger?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  Wallets                                                           */
/* ------------------------------------------------------------------ */

export interface Wallet {
  id: number;
  customer_name: string;
  balance: number;
  total_credited: number;
  total_debited: number;
  status: "active" | "frozen";
}

export function getWallets() {
  return api.get<Wallet[]>("/admin/wallets");
}

export interface WalletLedgerEntry {
  id: number;
  wallet_id: number;
  customer_name: string;
  type: string;
  amount: number;
  balance_after: number;
  created_at: string;
}

export function getWalletLedger(params?: { wallet_id?: number }) {
  const qs = new URLSearchParams();
  if (params?.wallet_id) qs.set("wallet_id", String(params.wallet_id));
  return api.get<WalletLedgerEntry[]>(`/admin/wallets/ledger?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  Vouchers                                                          */
/* ------------------------------------------------------------------ */

export interface Voucher {
  id: number;
  code: string;
  title: string;
  type: string;
  discount_value: number;
  valid_from: string;
  valid_until: string;
  max_uses: number;
  used_count: number;
  status: "active" | "inactive";
}

export function getVouchers() {
  return api.get<Voucher[]>("/admin/vouchers");
}

export function createVoucher(body: Omit<Voucher, "id">) {
  return api.post<Voucher>("/admin/vouchers", body);
}

export function updateVoucherStatus(id: number, status: Voucher["status"]) {
  return api.patch<Voucher>(`/admin/vouchers/${id}/status`, { status });
}

/* ------------------------------------------------------------------ */
/*  Rewards                                                           */
/* ------------------------------------------------------------------ */

export interface Reward {
  id: number;
  name: string;
  image_url?: string;
  points_cost: number;
  type: string;
  description?: string;
}

export function getRewards() {
  return api.get<Reward[]>("/admin/rewards");
}

export function createReward(body: Omit<Reward, "id">) {
  return api.post<Reward>("/admin/rewards", body);
}

/* ------------------------------------------------------------------ */
/*  Audit Log                                                         */
/* ------------------------------------------------------------------ */

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: string;
  resource_type: string;
  resource_id: string;
  user_email: string;
  severity: "low" | "medium" | "high" | "critical";
  ip_address: string;
}

export function getAuditLog(params?: {
  action?: string;
  resource_type?: string;
  severity?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.action) qs.set("action", params.action);
  if (params?.resource_type) qs.set("resource_type", params.resource_type);
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  return api.get<AuditLogEntry[]>(`/admin/audit-log?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                     */
/* ------------------------------------------------------------------ */

export interface Notification {
  id: number;
  customer_name: string;
  type: string;
  priority: string;
  title: string;
  status: "read" | "unread";
  sent_at: string;
}

export function getNotifications() {
  return api.get<Notification[]>("/admin/notifications");
}

export function sendNotification(body: {
  customer_id?: number;
  type: string;
  priority: string;
  title: string;
  message?: string;
}) {
  return api.post<Notification>("/admin/notifications", body);
}

/* ------------------------------------------------------------------ */
/*  Inventory Movements                                               */
/* ------------------------------------------------------------------ */

export interface InventoryMovement {
  id: number;
  item_name: string;
  movement_type: "in" | "out" | "adjustment" | "waste";
  quantity: number;
  unit_cost: number;
  created_at: string;
  performed_by: string;
}

export function getInventoryMovements(params?: {
  movement_type?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.movement_type) qs.set("movement_type", params.movement_type);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  return api.get<InventoryMovement[]>(`/admin/inventory/movements?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  Purchase Orders                                                   */
/* ------------------------------------------------------------------ */

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_name: string;
  status: "draft" | "pending" | "approved" | "received" | "cancelled";
  total: number;
  order_date: string;
  expected_delivery: string;
}

export interface PurchaseOrderLineItem {
  item_id: number;
  quantity: number;
  unit_cost: number;
}

export function getPurchaseOrders(params?: { status?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  return api.get<PurchaseOrder[]>(`/admin/inventory/purchase-orders?${qs.toString()}`);
}

export function createPurchaseOrder(body: {
  supplier_id: number;
  store_id: number;
  expected_delivery: string;
  items: PurchaseOrderLineItem[];
}) {
  return api.post<PurchaseOrder>("/admin/inventory/purchase-orders", body);
}

export function receivePurchaseOrder(id: number) {
  return api.patch<PurchaseOrder>(`/admin/inventory/purchase-orders/${id}/receive`, {});
}

export function cancelPurchaseOrder(id: number) {
  return api.patch<PurchaseOrder>(`/admin/inventory/purchase-orders/${id}/cancel`, {});
}

/* ------------------------------------------------------------------ */
/*  Customer Consents                                                 */
/* ------------------------------------------------------------------ */

export interface CustomerConsent {
  id: number;
  customer_name: string;
  consent_type: string;
  status: "granted" | "withdrawn";
  granted_at: string;
  withdrawn_at?: string;
  ip_address: string;
}

export function getCustomerConsents(params?: { consent_type?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.consent_type) qs.set("consent_type", params.consent_type);
  if (params?.status) qs.set("status", params.status);
  return api.get<CustomerConsent[]>(`/admin/customers/consents?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  Customer Devices                                                  */
/* ------------------------------------------------------------------ */

export interface CustomerDevice {
  id: number;
  customer_name: string;
  device_type: string;
  provider: string;
  os_version: string;
  last_active_at: string;
  is_active: boolean;
}

export function getCustomerDevices(params?: { device_type?: string; is_active?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.device_type) qs.set("device_type", params.device_type);
  if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
  return api.get<CustomerDevice[]>(`/admin/customers/devices?${qs.toString()}`);
}

/* ------------------------------------------------------------------ */
/*  Staff Time Events                                                 */
/* ------------------------------------------------------------------ */

export interface StaffTimeEvent {
  id: number;
  staff_name: string;
  store_name: string;
  event_type: "clock_in" | "clock_out" | "start_break" | "end_break";
  timestamp: string;
  location?: string;
  verified_by?: string;
}

export function getStaffTimeEvents(params?: { event_type?: string; date?: string }) {
  const qs = new URLSearchParams();
  if (params?.event_type) qs.set("event_type", params.event_type);
  if (params?.date) qs.set("date", params.date);
  return api.get<StaffTimeEvent[]>(`/admin/staff/time-events?${qs.toString()}`);
}

export function verifyTimeEvent(id: number) {
  return api.patch<StaffTimeEvent>(`/admin/staff/time-events/${id}/verify`, {});
}

/* ------------------------------------------------------------------ */
/*  Tip Allocations                                                   */
/* ------------------------------------------------------------------ */

export interface TipAllocation {
  id: number;
  order_number: string;
  store_name: string;
  total_tip: number;
  method: string;
  distributed_by: string;
  created_at: string;
}

export function getTipAllocations() {
  return api.get<TipAllocation[]>("/admin/staff/tips");
}

/* ------------------------------------------------------------------ */
/*  Content Blocks                                                    */
/* ------------------------------------------------------------------ */

export interface ContentBlock {
  id: number;
  block_key: string;
  block_type: "text" | "image" | "banner" | "promo";
  title: string;
  content?: string;
  image_url?: string;
  display_order: number;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
  store_name?: string;
}

export function getContentBlocks() {
  return api.get<ContentBlock[]>("/admin/content/blocks");
}

export function createContentBlock(body: Omit<ContentBlock, "id">) {
  return api.post<ContentBlock>("/admin/content/blocks", body);
}

export function updateContentBlock(id: number, body: Partial<Omit<ContentBlock, "id">>) {
  return api.patch<ContentBlock>(`/admin/content/blocks/${id}`, body);
}

export function deleteContentBlock(id: number) {
  return api.del<void>(`/admin/content/blocks/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Splash Screens                                                    */
/* ------------------------------------------------------------------ */

export interface SplashScreen {
  id: number;
  screen_key: string;
  title: string;
  subtitle?: string;
  image_url?: string;
  cta_text?: string;
  cta_url?: string;
  display_order: number;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
  store_name?: string;
}

export function getSplashScreens() {
  return api.get<SplashScreen[]>("/admin/content/splash-screens");
}

export function createSplashScreen(body: Omit<SplashScreen, "id">) {
  return api.post<SplashScreen>("/admin/content/splash-screens", body);
}

export function updateSplashScreen(id: number, body: Partial<Omit<SplashScreen, "id">>) {
  return api.patch<SplashScreen>(`/admin/content/splash-screens/${id}`, body);
}

export function deleteSplashScreen(id: number) {
  return api.del<void>(`/admin/content/splash-screens/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Marketing Campaigns                                               */
/* ------------------------------------------------------------------ */

export interface MarketingCampaign {
  id: number;
  campaign_name: string;
  channel: "push_notification" | "email" | "sms" | "in_app" | "whatsapp";
  status: "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled";
  audience_segment?: string;
  content?: string;
  scheduled_at?: string;
  sent_count: number;
  open_rate?: number;
}

export function getMarketingCampaigns() {
  return api.get<MarketingCampaign[]>("/admin/marketing/campaigns");
}

export function createMarketingCampaign(body: Omit<MarketingCampaign, "id">) {
  return api.post<MarketingCampaign>("/admin/marketing/campaigns", body);
}

export function updateMarketingCampaign(id: number, body: Partial<Omit<MarketingCampaign, "id">>) {
  return api.patch<MarketingCampaign>(`/admin/marketing/campaigns/${id}`, body);
}

export function sendCampaign(id: number) {
  return api.patch<MarketingCampaign>(`/admin/marketing/campaigns/${id}/send`, {});
}

/* ------------------------------------------------------------------ */
/*  Referral Events                                                   */
/* ------------------------------------------------------------------ */

export interface ReferralEvent {
  id: number;
  referrer_name: string;
  referred_name: string;
  referral_code: string;
  reward?: string;
  status: "pending" | "fulfilled" | "cancelled";
  created_at: string;
}

export function getReferralEvents() {
  return api.get<ReferralEvent[]>("/admin/referrals");
}

export function fulfillReferral(id: number) {
  return api.patch<ReferralEvent>(`/admin/referrals/${id}/fulfill`, {});
}

/* ------------------------------------------------------------------ */
/*  Surveys                                                           */
/* ------------------------------------------------------------------ */

export interface SurveyQuestion {
  id?: number;
  question_text: string;
  question_type: "text" | "single_choice" | "multiple_choice" | "rating";
  options?: string[];
  required: boolean;
  display_order: number;
}

export interface Survey {
  id: number;
  survey_key: string;
  title: string;
  description?: string;
  survey_type: string;
  is_active: boolean;
  starts_at?: string;
  ends_at?: string;
  questions?: SurveyQuestion[];
  response_count?: number;
}

export interface SurveyResponse {
  id: number;
  customer_name: string;
  submitted_at: string;
  answers: { question_id: number; answer: string }[];
}

export function getSurveys() {
  return api.get<Survey[]>("/admin/surveys");
}

export function createSurvey(body: Omit<Survey, "id">) {
  return api.post<Survey>("/admin/surveys", body);
}

export function updateSurvey(id: number, body: Partial<Omit<Survey, "id">>) {
  return api.patch<Survey>(`/admin/surveys/${id}`, body);
}

export function deleteSurvey(id: number) {
  return api.del<void>(`/admin/surveys/${id}`);
}

export function getSurveyResponses(surveyId: number) {
  return api.get<SurveyResponse[]>(`/admin/surveys/${surveyId}/responses`);
}
