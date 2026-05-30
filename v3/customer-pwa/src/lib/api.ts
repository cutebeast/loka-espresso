/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';

export const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Inject auth token and locale into every request
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const rawLocale = typeof window !== 'undefined' ? localStorage.getItem('loka-locale') : null;
  if (rawLocale) {
    try {
      const parsed = JSON.parse(rawLocale);
      const locale = parsed?.state?.locale || parsed?.locale;
      if (locale && typeof locale === 'string') {
        config.headers['Accept-Language'] = locale;
      }
    } catch {
      config.headers['Accept-Language'] = rawLocale;
    }
  }
  return config;
});

// Store-scoped helper: extracts store_id from UI state for menu/category calls
// The getter is set by the app shell once the store is initialized.
// URL mapping: old v1 endpoints → v3 endpoints
function mapUrl(url: string, _method?: string): string {
  if (!url) return url;
  
  // Strip query params for matching, re-attach later
  let queryPart = '';
  const qIdx = url.indexOf('?');
  if (qIdx >= 0) {
    queryPart = url.substring(qIdx);
    url = url.substring(0, qIdx);
  }

  // Apply pagination param fix early so all paths benefit
  if (queryPart && queryPart.includes('page_size=')) {
    queryPart = queryPart.replace('page_size=', 'per_page=');
  }

  // ---- Exact path matches ----
  // Keys are mapped (v3) URLs so that double-resolution is safe.
  // v1 origins → v3 destinations:
  //   /auth/session   → /auth/login
  //   /users/me       → /me
  //   /wallet         → /wallet/me
  //   /checkout       → /orders
  //   etc.
  // When the response interceptor re-resolves the already-mapped URL,
  // it finds the identity entry and returns the same URL.
  const v1ToV3: Record<string, string> = {
    '/auth/session': '/auth/login',
    '/users/me': '/me',
    '/users/me/avatar': '/me/avatar',
    '/users/me/addresses': '/me/addresses',
    '/users/me/notifications': '/notifications/me',
    '/users/me/notifications/preferences': '/notifications/preferences/me',
    '/users/me/payment-methods': '/payments/methods',
    '/content/stores': '/stores',
    '/content/location': '/stores',
    '/rewards': '/rewards/catalog',
    '/wallet': '/wallet/me',
    '/wallet/balance': '/wallet/me',
    '/me/wallet': '/wallet/me',
    '/wallet/transactions': '/wallet/ledger/me',
    '/loyalty/balance': '/loyalty/me',
    '/loyalty/history': '/loyalty/ledger/me',
    '/referral/stats': '/referrals/me',
    '/referral/code': '/referrals/me',
    '/referral/apply': '/referrals',
    '/notifications': '/notifications/me',
    '/payments/create-intent': '/payments/intent',
    '/payments/confirm': '/payments/intent',
    '/checkout': '/orders',
    '/tables/scan': '/stores/tables/scan',
    '/config': '/config/bootstrap',
    '/vouchers/validate': '/vouchers/validate',
  };
  const exactMap: Record<string, string> = {
    '/auth/login': '/auth/login',
    '/auth/logout': '/auth/logout',
    '/auth/refresh': '/auth/refresh',
    '/me': '/me',
    '/me/avatar': '/me/avatar',
    '/me/addresses': '/me/addresses',
    '/notifications/me': '/notifications/me',
    '/notifications/preferences/me': '/notifications/preferences/me',
    '/payments/methods': '/payments/methods',
    '/payments/intent': '/payments/intent',
    '/stores': '/stores',
    '/stores/tables/scan': '/stores/tables/scan',
    '/promos/banners': '/promos/banners',
    '/rewards/catalog': '/rewards/catalog',
    '/wallet/me': '/wallet/me',
    '/wallet/ledger/me': '/wallet/ledger/me',
    '/wallet/topup': '/wallet/topup',
    '/loyalty/me': '/loyalty/me',
    '/loyalty/ledger/me': '/loyalty/ledger/me',
    '/referrals/me': '/referrals/me',
    '/referrals': '/referrals',
    '/cart': '/cart',
    '/cart/items': '/cart/items',
    '/orders': '/orders',
    '/feedback': '/feedback',
    '/config/bootstrap': '/config/bootstrap',
    '/vouchers/apply': '/vouchers/apply',
    '/reservations': '/reservations',
  };
  if (v1ToV3[url]) return v1ToV3[url] as string;
  if (exactMap[url]) { return queryPart ? url + queryPart : url; }

  // /users/me/addresses/{id} → /me/addresses/{id}
  if (url.startsWith('/users/me/addresses/')) {
    const suffix = url.split('/').slice(3).join('/');
    url = '/me/addresses/' + suffix;
    return queryPart ? url + queryPart : url;
  }

  // ---- Menu items/categories → no store_id needed (menu is global) ----
  if (url === '/menu/items' || url === '/menu/categories') {
    return queryPart ? url + queryPart : url;
  }
  // Sub-paths like /menu/items/{id} → keep as-is (backend has /menu/items/{item_id})
  if (url.startsWith('/menu/items/')) {
    return queryPart ? url + queryPart : url;
  }

  // ---- Prefix matches ----
  // /content/information → keep as-is (new public endpoint exists)
  if (url.startsWith('/content/information')) {
    // url stays as /content/information/...
    return queryPart ? url + queryPart : url;
  }
  // /content/legal → keep as-is (new public endpoint exists)
  if (url.startsWith('/content/legal/')) {
    // url stays as /content/legal/{page_key}
    return queryPart ? url + queryPart : url;
  }

  // /orders/{id}/reorder → keep as-is (new endpoint exists)
  if (url.match(/^\/orders\/\d+\/reorder/)) {
    return url + queryPart;
  }
  // /orders/{id}/cancel → keep as-is (new endpoint exists)
  if (url.match(/^\/orders\/\d+\/cancel/)) {
    return url + queryPart;
  }
  // /promos/banners/{id}/status → keep as-is (new endpoint exists)
  if (url.match(/^\/promos\/banners\/\d+\/status/)) {
    return url + queryPart;
  }
  // /notifications/{id}/read → PATCH /notifications/me/{id}/read
  if (url.match(/^\/notifications\/\d+\/read/)) {
    const id = url.split('/')[2];
    url = `/notifications/me/${id}/read`;
    return queryPart ? url + queryPart : url;
  }
  if (url.match(/^\/surveys\/\d+\/submit/)) {
    const id = url.split('/')[2];
    url = `/surveys/${id}/responses` + queryPart;
    return url;
  }
  // /payments/{id}/confirm → POST /payments/{id}/confirm
  if (url.match(/^\/payments\/\d+\/confirm/)) {
    return url + queryPart; // keep as-is
  }
  // /payments/{id}/cancel → POST /payments/{id}/cancel
  if (url.match(/^\/payments\/\d+\/cancel/)) {
    return url + queryPart; // keep as-is
  }
  // /orders/* webhook passthrough
  if (url.startsWith('/orders/') && (url.includes('/pos-webhook') || url.includes('/delivery-webhook'))) {
    return url + queryPart;
  }

  return url + queryPart;
}

// Legacy params rewriter for known patterns
function rewriteParams(_url: string, params?: Record<string, any>): Record<string, any> {
  if (!params) return params || {};
  const result = { ...params };
  
  // Map legacy param names
  if ('page_size' in result) {
    result.per_page = result.page_size;
    delete result.page_size;
  }
  if ('available_only' in result) {
    result.is_available = result.available_only;
    delete result.available_only;
  }
  if ('featured' in result) {
    result.is_featured = result.featured;
    delete result.featured;
  }
  
  return result;
}

// Response mapping helpers
function unwrapV3(data: any): any {
  // Unwrap standard v3 APIResponse wrapper: { success, message, data }
  if (data && typeof data === 'object' && 'data' in data && ('success' in data || 'status' in data || 'message' in data)) {
    return unwrapV3(data.data);
  }
  // Unwrap paginated response: { items, total, page, per_page, total_pages }
  if (data && typeof data === 'object' && 'items' in data && 'total' in data && !Array.isArray(data)) {
    return data;
  }
  return data;
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function convertOperatingHours(hours: any[] | undefined): Record<string,string> {
  const result: Record<string,string> = {};
  if (!Array.isArray(hours)) return result;
  for (const h of hours) {
    const day = DAY_NAMES[h.day_of_week] ?? String(h.day_of_week);
    if (h.is_closed) {
      result[day] = 'Closed';
      continue;
    }
    if (h.is_24_hours) {
      result[day] = 'Open 24 Hours';
      continue;
    }
    const open = (h.open_time || '').substring(0,5);
    const close = (h.close_time || '').substring(0,5);
    result[day] = open && close ? `${open} - ${close}` : 'Closed';
  }
  return result;
}

function mapV3Response(url: string, data: any): any {

  const unwrappedRaw = unwrapV3(data);

  if (!unwrappedRaw) {
    if (['/stores','/orders','/rewards/catalog','/rewards/me','/vouchers/me',
         '/notifications/me','/wallet/ledger','/loyalty/ledger','/referrals/me',
         '/surveys','/reservations','/cart','/cart/items','/content/blocks'].some(p => url.includes(p))) {
      return [];
    }
    return null;
  }

  const paginatedObj = (!Array.isArray(unwrappedRaw) && typeof unwrappedRaw === 'object' && 'items' in unwrappedRaw && 'total' in unwrappedRaw)
    ? unwrappedRaw
    : null;
  const unwrapped = paginatedObj ? paginatedObj.items : unwrappedRaw;

  // ============================================
  // STORES — map field names
  // ============================================
  if (url.includes('/stores')) {
    const mapStore = (s: any) => ({
      ...s,
      name: s.store_name || s.name,
      address: s.address_line_1 ? `${s.address_line_1}, ${s.city || ''}` : s.address,
      phone: s.phone_number || s.phone,
      image_url: s.logo_url || s.image_url,
      lat: s.latitude ?? s.lat,
      lng: s.longitude ?? s.lng,
      opening_hours: convertOperatingHours(s.operating_hours || s.opening_hours),
      operating_hours: s.operating_hours || s.opening_hours,
      delivery_fee: s.base_delivery_fee ?? s.delivery_fee,
      min_order: s.minimum_order_amount ?? s.min_order,
      pickup_lead_minutes: s.pickup_lead_minutes,
      delivery_radius_km: s.delivery_radius_km,
      pos_integration_enabled: s.pos_integration_type !== 'none' && s.pos_integration_type !== null,
      delivery_integration_enabled: s.delivery_integration_type !== 'none' && s.delivery_integration_type !== null,
    });
    if (Array.isArray(unwrapped)) return unwrapped.map(mapStore);
    return mapStore(unwrapped);
  }

  // ============================================
  // MENU /menu/stores/{id} → flat items array
  // ============================================
  if (url.includes('/menu/stores/')) {
    const categories = unwrapped.categories || [];
    const items = unwrapped.items || [];
    
    // Map menu items to PWA shape
    const mappedItems = items.map((item: any) => ({
      ...item,
      name: item.item_name || item.name,
      category_id: item.category_id,
      base_price: item.base_price ?? item.price ?? 0,
      description: item.description || '',
      image_url: item.image_url || null,
      is_available: item.is_available ?? item.is_active ?? true,
      is_featured: item.is_featured ?? false,
      display_order: item.display_order ?? 0,
      dietary_tags: item.dietary_tags || [],
      allergens: (item.allergens || []).map((a: any) => ({
        display_name: a.display_name || a.name || a.allergen_name || '',
        severity: a.severity || 'medium',
        icon: a.icon_url || a.icon || null,
      })),
      customization_count: item.modifier_groups?.length || 0,
      customization_options: (item.modifier_groups || []).flatMap((mg: any) => 
        (mg.options || []).map((opt: any) => ({
          id: opt.id,
          name: opt.option_name || opt.name,
          option_type: mg.selection_type || mg.group_type || 'single',
          price_adjustment: opt.price_adjustment ?? 0,
          is_active: opt.is_active ?? true,
          is_popular: opt.is_default ?? false,
        }))
      ),
    }));

    // Map categories to PWA shape
    const mappedCategories = categories.map((cat: any) => ({
      ...cat,
      name: cat.category_name || cat.name,
      is_active: cat.is_available ?? cat.is_active ?? true,
      display_order: cat.display_order ?? 0,
    }));

    // Return both as combined object (some pages expect items, some expect categories)
    return { items: mappedItems, categories: mappedCategories };
  }

  // ============================================
  // /me — unwrap profile from nested shape
  // ============================================
  if (url === '/me' || url.startsWith('/me')) {
    if (url.includes('/addresses')) {
      // Address list - keep as-is or transform
      return Array.isArray(unwrapped) ? unwrapped : [];
    }
    if (url.includes('/consents') || url.includes('/devices')) {
      return Array.isArray(unwrapped) ? unwrapped : [];
    }
    
    // Profile: v3 /me returns { profile: {...}, addresses, devices, consents }
    const profile = unwrapped.profile || unwrapped;
    return {
      ...profile,
      name: profile.display_name || profile.name || '',
      email: profile.email_address || profile.email || '',
      phone: profile.phone_number || profile.phone || '',
      avatar_url: profile.avatar_url || profile.profile_image_url,
      user_type: 'customer',
      date_of_birth: profile.date_of_birth,
      created_at: profile.created_at,
      referral_code: profile.referral_code || profile.code,
      // Preserve addresses if needed downstream
      addresses: unwrapped.addresses || profile.addresses || [],
      default_address: unwrapped.default_address,
    };
  }

  // ============================================
  // ORDERS — map field names
  // ============================================
  if (url.includes('/orders')) {
    const mapOrder = (o: any) => {
      const items = o.items || o.order_items || o.line_items || [];
      const mappedItems = items.map((li: any) => ({
        id: li.id,
        menu_item_id: li.menu_item_id,
        name: li.item_snapshot?.item_name || li.item_snapshot?.name || li.item_name || li.name || '',
        price: li.line_total ?? li.unit_price ?? li.price ?? 0,
        unit_price: li.unit_price ?? li.price ?? 0,
        quantity: li.quantity ?? 1,
        customizations: li.selected_modifiers || li.customizations || li.modifiers || {},
        image_url: li.item_snapshot?.image_url || li.image_url || null,
      }));
      const mapped = {
        ...o,
        order_number: o.order_number || `ORD-${o.id}`,
        order_type: o.order_type === 'takeaway' ? 'pickup' : o.order_type,
        total: o.total_amount ?? o.total ?? 0,
        subtotal: o.items_subtotal ?? o.subtotal ?? 0,
        discount: o.discount_amount ?? o.discount ?? 0,
        notes: o.customer_notes ?? o.notes,
        table_id: o.dining_table_id ?? o.table_id,
        points_earned: o.loyalty_points_earned ?? o.points_earned ?? 0,
        items: mappedItems,
        status_timeline: o.status_log || o.status_timeline || o.timeline || [],
        timeline: o.status_log || o.timeline || o.status_timeline || [],
      };
      const flatFulfillment: any = {};
      if (mapped.fulfillment && typeof mapped.fulfillment === 'object') {
        const f = mapped.fulfillment;
        flatFulfillment.pickup_time = f.estimated_ready_at || f.scheduled_time;
        flatFulfillment.delivery_address = f.delivery_address_snapshot ? (typeof f.delivery_address_snapshot === 'string' ? f.delivery_address_snapshot : f.delivery_address_snapshot.formatted_address || f.delivery_address_snapshot.address_line_1) : '';
        flatFulfillment.delivery_courier_name = f.driver_name || f.courier_name;
        flatFulfillment.delivery_courier_phone = f.driver_phone || f.courier_phone;
        flatFulfillment.delivery_tracking_url = f.tracking_url;
        flatFulfillment.delivery_eta_minutes = f.eta_minutes;
        flatFulfillment.recipient_name = f.recipient_name;
        flatFulfillment.recipient_phone = f.recipient_phone;
      }
      return { ...mapped, ...flatFulfillment };
    };
    if (Array.isArray(unwrapped)) return unwrapped.map(mapOrder);
    return mapOrder(unwrapped);
  }

  // ============================================
  // WALLET
  // ============================================
  if (url.includes('/wallet')) {
    if (url.includes('/ledger') && Array.isArray(unwrapped)) {
      return unwrapped.map((t: any) => ({
        ...t,
        amount: t.amount ?? t.debit_amount ?? t.credit_amount ?? 0,
        type: t.entry_type ?? t.transaction_type ?? t.type ?? 'unknown',
        description: t.note || t.description || t.notes || '',
        created_at: t.created_at,
        reference_id: t.reference_id,
      }));
    }
    // Wallet balance
    return {
      ...unwrapped,
      balance: unwrapped.balance ?? unwrapped.current_balance ?? 0,
      currency: unwrapped.currency_code || unwrapped.currency || 'MYR',
      rewards: unwrapped.rewards ?? unwrapped.data?.rewards ?? [],
      vouchers: unwrapped.vouchers ?? unwrapped.data?.vouchers ?? [],
    };
  }

  // ============================================
  // LOYALTY
  // ============================================
  if (url.includes('/loyalty')) {
    if (url.includes('/ledger') && Array.isArray(unwrapped)) {
      return unwrapped.map((e: any) => ({
        ...e,
        points: e.points_delta ?? e.points ?? 0,
        type: e.event_type ?? e.type ?? 'unknown',
        description: e.description || '',
        created_at: e.created_at,
      }));
    }
    return {
      ...unwrapped,
      points: unwrapped.current_points ?? unwrapped.points_balance ?? unwrapped.points ?? 0,
      points_balance: unwrapped.points_balance ?? unwrapped.points ?? 0,
      tier: unwrapped.tier_name ?? unwrapped.tier ?? 'Bronze',
      tier_name: unwrapped.tier_name ?? unwrapped.tier ?? 'Bronze',
      lifetime_points: unwrapped.lifetime_points ?? 0,
    };
  }

  // ============================================
  // CONTENT — PromoBanner / InfoCard / ProductCard / EventCard / SystemPage / SplashScreen
  // ============================================
  if (url.includes('/content/') || url.includes('/promos/banners') || url.includes('/splash')) {
    const mapContent = (b: any) => {
      if (!b) return b;
      return {
        ...b,
        title: b.title || b.block_name || b.screen_name || '',
        short_description: b.short_description || b.subtitle || null,
        long_description: b.long_description || b.body_text || null,
        image_url: b.image_url || null,
        gallery_urls: b.image_gallery_urls || [],
        action_url: b.action_url || b.cta_url || null,
        action_type: b.action_type || b.cta_action || null,
        action_label: b.action_label || b.cta_text || null,
        start_date: b.start_date || b.active_from || null,
        end_date: b.end_date || b.active_until || null,
        content_type: b.content_type || 'information',
        sections: b.sections || [],
        icon: b.icon || null,
        terms: b.terms_and_conditions ? (Array.isArray(b.terms_and_conditions) ? b.terms_and_conditions : [b.terms_and_conditions]) : [],
        how_to_redeem: b.how_to_redeem || null,
        description: b.long_description || b.short_description || b.description || '',
        voucher_id: b.voucher_id || b.voucher_definition_id || null,
        survey_id: b.survey_id || b.survey_definition_id || null,
        page_key: b.page_key || null,
        slug: b.slug || null,
      };
    };
    if (Array.isArray(unwrapped)) return unwrapped.map(mapContent);
    return mapContent(unwrapped);
  }

  // ============================================
  // REWARDS
  // ============================================
  if (url.includes('/rewards')) {
    if (url.includes('/catalog')) {
      return unwrapped.map((r: any) => ({
        ...r,
        name: r.reward_name || r.name || '',
        short_description: r.short_description || r.description || null,
        description: r.long_description || r.description || '',
        points_cost: r.points_required ?? r.points_cost ?? 0,
        base_price: r.points_required ?? r.points_cost ?? 0,
        reward_type: r.reward_type || 'discount',
        image_url: r.image_url || null,
        is_active: r.is_active ?? true,
        validity_days: r.validity_days,
        terms: r.terms_and_conditions ? (Array.isArray(r.terms_and_conditions) ? r.terms_and_conditions : [r.terms_and_conditions]) : [],
        discount_value: r.discount_value || r.discount_amount || 0,
        discount_max_amount: r.discount_max_amount || r.max_discount || 0,
        minimum_order_value: r.minimum_order_value || r.min_spend || 0,
        how_to_redeem: r.how_to_redeem || null,
      }));
    }
    // /rewards/me (customer's redeemed rewards)
    return unwrapped.map((r: any) => ({
      ...r,
      reward_id: r.reward_catalog_id || r.reward_definition_id || r.reward_id,
      reward_name: r.reward_name || r.name || '',
      redemption_code: r.redemption_code || r.code || '',
      status: r.status || 'available',
      expires_at: r.expires_at || r.expiry_date,
      reward_image_url: r.reward_image_url || r.image_url,
      points_spent: r.points_spent ?? r.points_used ?? 0,
      redeemed_at: r.redeemed_at || r.created_at,
      used_at: r.used_at,
    }));
  }

  // ============================================
  // VOUCHERS
  // ============================================
  if (url.includes('/vouchers')) {
    if (url.includes('/validate')) return unwrapped;
    return unwrapped.map((v: any) => ({
      ...v,
      voucher_id: v.voucher_definition_id || v.voucher_id,
      code: v.voucher_code || v.code || '',
      voucher_title: v.voucher_title || v.definition_name || v.title || v.code,
      discount_type: v.discount_type || 'percentage',
      discount_value: v.discount_value ?? v.discount_percent ?? 0,
      status: v.status || 'available',
      expires_at: v.expires_at || v.expiry_date,
      min_spend: v.minimum_spend ?? v.min_spend,
      max_discount: v.maximum_discount ?? v.max_discount,
      voucher_image_url: v.voucher_image_url || v.image_url,
      source: v.source || 'unknown',
      issued_at: v.created_at || v.issued_at,
      used_at: v.used_at,
    }));
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================
  if (url.includes('/notifications')) {
    if (url.includes('/preferences')) return unwrapped;
    return unwrapped.map((n: any) => ({
      ...n,
      type: n.message_type || n.type || 'general',
      title: n.title || n.subject || '',
      body: n.body || n.message || '',
      is_read: n.is_read ?? (n.read_at != null),
      created_at: n.created_at || n.sent_at,
    }));
  }

  // ============================================
  // REFERRALS
  // ============================================
  if (url.includes('/referrals')) {
    if (Array.isArray(unwrapped)) {
      // Referral events list
      return unwrapped.map((r: any) => ({
        ...r,
        referred_name: r.invitee_name || r.referred_name,
        status: r.status || 'completed',
        points_earned: r.points_awarded ?? r.points_earned ?? 0,
        created_at: r.created_at,
      }));
    }
    // Referral stats object
    return {
      referral_code: unwrapped.referral_code || unwrapped.code || '',
      total_referrals: unwrapped.total_referrals ?? unwrapped.referral_count ?? 0,
      total_rewards: unwrapped.total_rewards ?? unwrapped.referral_earnings_total ?? 0,
      code: unwrapped.referral_code || unwrapped.code || '',
      referrals: unwrapped.total_referrals ?? unwrapped.referral_count ?? 0,
      points_earned: unwrapped.total_rewards ?? unwrapped.referral_earnings_total ?? 0,
      paid_rewards: unwrapped.total_rewards ?? unwrapped.referral_earnings_total ?? 0,
      invited_users: (unwrapped.invited_users || unwrapped.invitees || []).map((u: any) => ({
        name: u.display_name || u.name,
        status: u.status || 'joined',
        joined_at: u.joined_at || u.created_at,
      })),
    };
  }

  // ============================================
  // SURVEYS — handle both list and single survey
  // ============================================
  if (url.includes('/surveys')) {
    // Single survey by ID (not a list)
    if (url.match(/\/surveys\/\d+(\/responses)?$/) && !Array.isArray(unwrapped) && typeof unwrapped === 'object' && !unwrapped.items) {
      return {
        ...unwrapped,
        title: unwrapped.survey_name || unwrapped.title || unwrapped.survey_key || '',
        survey_key: unwrapped.survey_key || unwrapped.slug || `survey-${unwrapped.id}`,
        description: unwrapped.description || '',
        survey_type: unwrapped.survey_type || 'feedback',
        is_active: unwrapped.is_active ?? true,
        starts_at: unwrapped.starts_at || unwrapped.start_date,
        ends_at: unwrapped.ends_at || unwrapped.end_date,
        questions: unwrapped.questions || [],
      };
    }
    // Survey list
    if (Array.isArray(unwrapped)) {
      return unwrapped.map((s: any) => ({
        ...s,
        title: s.survey_name || s.title || s.survey_key || '',
        survey_key: s.survey_key || s.slug || `survey-${s.id}`,
        description: s.description || '',
        survey_type: s.survey_type || 'feedback',
        is_active: s.is_active ?? true,
        starts_at: s.starts_at || s.start_date,
        ends_at: s.ends_at || s.end_date,
        questions: s.questions || [],
      }));
    }
    return unwrapped;
  }

  // ============================================
  // RESERVATIONS
  // ============================================
  if (url.includes('/reservations')) {
    return unwrapped.map((r: any) => ({
      ...r,
      store_name: r.store_name || r.store?.store_name,
      customer_name: r.customer_name || r.display_name,
      notes: r.special_requests || r.notes || '',
      reservation_date: r.reservation_date || r.date,
      reservation_time: r.reservation_time || r.time_slot,
      table_number: r.table_number || r.table?.table_number,
    }));
  }

  // ============================================
  // CART
  // ============================================
  if (url.includes('/cart')) {
    if (url.includes('/items')) {
      // Cart items list
      return unwrapped.map((ci: any) => ({
        id: ci.id,
        menu_item_id: ci.menu_item_id,
        name: ci.item_snapshot?.item_name || ci.item_snapshot?.name || ci.item_name || ci.name || '',
        price: ci.unit_price ?? ci.price ?? 0,
        base_price: ci.unit_price ?? ci.price ?? 0,
        quantity: ci.quantity ?? 1,
        customizations: ci.selected_modifiers || ci.modifiers || ci.customizations || {},
        customization_option_ids: ci.modifier_option_ids || ci.customization_option_ids || [],
        customization_count: ci.modifier_option_ids?.length || ci.customization_count || 0,
        image_url: ci.item_snapshot?.image_url || ci.image_url || null,
      }));
    }
    // Cart container
    return {
      ...unwrapped,
      items: (unwrapped.items || unwrapped.line_items || []).map((ci: any) => ({
        id: ci.id,
        menu_item_id: ci.menu_item_id,
        name: ci.item_snapshot?.item_name || ci.item_snapshot?.name || ci.item_name || ci.name || '',
        price: ci.unit_price ?? ci.price ?? 0,
        base_price: ci.unit_price ?? ci.price ?? 0,
        quantity: ci.quantity ?? 1,
        customizations: ci.selected_modifiers || ci.modifiers || ci.customizations || {},
        customization_option_ids: ci.modifier_option_ids || ci.customization_option_ids || [],
        customization_count: ci.modifier_option_ids?.length || ci.customization_count || 0,
        image_url: ci.item_snapshot?.image_url || ci.image_url || null,
      })),
      total_items: unwrapped.total_items ?? (unwrapped.items?.length || 0),
      total_amount: unwrapped.total_amount ?? unwrapped.subtotal ?? 0,
    };
  }

  // ============================================
  // PAYMENTS
  // ============================================
  if (url.includes('/payments')) {
    return {
      ...unwrapped,
      client_secret: unwrapped.client_secret,
      redirect_url: unwrapped.redirect_url,
      status: unwrapped.status,
    };
  }

  // ============================================
  // AUTH RESPONSES — keep as-is
  // ============================================
  if (url.includes('/auth')) {
    return unwrapped;
  }

  return unwrapped;
}

let _refreshPromise: Promise<{ access_token?: string; refresh_token?: string }> | null = null;

api.interceptors.response.use(
  (res) => {
    const mappedUrl = mapUrl(res.config.url || '', res.config.method?.toUpperCase());
    res.data = mapV3Response(mappedUrl, res.data);
    return res;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;
      let tokens: { access_token?: string; refresh_token?: string } | undefined;
      let currentPromise: Promise<any>;
      try {
        if (!_refreshPromise) {
          currentPromise = axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: typeof window !== 'undefined' ? (localStorage.getItem('refreshToken') || '') : '',
          }).then((res) => {
            const data = res.data;
            const t = (data?.data?.tokens) || data?.tokens || data;
            if (t?.access_token) {
              if (typeof window !== 'undefined') {
                localStorage.setItem('token', t.access_token);
                if (t.refresh_token) {
                  localStorage.setItem('refreshToken', t.refresh_token);
                }
              }
            }
            return t;
          });
          _refreshPromise = currentPromise;
        } else {
          currentPromise = _refreshPromise;
        }
        tokens = await currentPromise;
        _refreshPromise = null;
        if (tokens?.access_token) {
          return api(originalRequest);
        }
      } catch (refreshError: any) {
        if (_refreshPromise && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        _refreshPromise = null;
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

// Override request methods to apply URL mapping and param rewriting
const originalRequest = api.request.bind(api);
api.request = function(config: any) {
  if (config.url) {
    config.url = mapUrl(config.url, config.method?.toUpperCase());
  }
  if (config.params) {
    config.params = rewriteParams(config.url, config.params);
  }
  // Method override: PUT /notifications/me/{id}/read → PATCH
  if (config.url && /\/notifications\/me\/\d+\/read/.test(config.url) && config.method?.toUpperCase() === 'PUT') {
    config.method = 'PATCH';
  }
  return originalRequest(config);
};

export default api;

// Types
export interface Store {
  id: number;
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  opening_hours?: Record<string, string>;
  operating_hours?: any[];
  is_active?: boolean;
  image_url?: string;
  lat?: number;
  lng?: number;
  pickup_lead_minutes?: number;
  delivery_radius_km?: number;
  first_order_minutes_after_open?: number;
  last_order_minutes_before_close?: number;
  delivery_fee?: number;
  min_order?: number;
  pos_integration_enabled?: boolean;
  delivery_integration_enabled?: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug?: string;
  is_active?: boolean;
  display_order?: number;
}

export interface PromoBanner {
  id: number;
  title: string;
  short_description: string | null;
  long_description: string | null;
  image_url: string | null;
  action_type: 'detail' | 'survey' | null;
  terms: string[] | null;
  how_to_redeem: string | null;
  start_date: string | null;
  end_date: string | null;
  voucher_id?: number | null;
  survey_id?: number | null;
}

export interface InformationCard {
  id: number;
  title: string;
  slug?: string | null;
  short_description: string | null;
  long_description?: string | null;
  sections?: { title?: string; body?: string; list?: string[]; visible?: boolean }[] | null;
  content_type?: string | null;
  icon?: string | null;
  image_url?: string | null;
  gallery_urls?: string[] | null;
  action_url?: string | null;
  action_type?: string | null;
  action_label?: string | null;
}

export interface CustomizationOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
  is_active: boolean;
  is_popular: boolean;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured?: boolean;
  display_order?: number;
  calories?: number | null;
  minimum_tier_id?: number | null;
  minimum_tier_name?: string | null;
  dietary_tags?: string[];
  allergens?: Array<{ display_name: string; severity: string; icon?: string }>;
  customization_count?: number;
  customization_options?: CustomizationOption[];
}

export interface Reward {
  id: number;
  name: string;
  short_description: string | null;
  description: string;
  long_description?: string | null;
  points_cost: number;
  reward_type: string;
  image_url?: string;
  is_active: boolean;
  validity_days?: number;
  terms?: string[] | null;
  how_to_redeem?: string | null;
}

export interface UserReward {
  id: number;
  reward_id: number;
  reward_name: string;
  redemption_code: string;
  status: 'available' | 'used' | 'expired' | 'active';
  expires_at: string;
  reward_image_url?: string;
  reward_snapshot?: string;
  points_spent?: number;
  redeemed_at?: string;
  used_at?: string;
}

export interface UserVoucher {
  id: number;
  voucher_id: number;
  code: string;
  discount_type: string;
  discount_value: number;
  status: 'available' | 'used' | 'expired' | 'active';
  expires_at: string;
  min_spend?: number;
  max_discount?: number;
  voucher_title?: string;
  voucher_image_url?: string;
  source?: 'survey' | 'promo' | 'gift' | string;
  issued_at?: string;
  used_at?: string;
}

export interface OrderItem {
  id?: number;
  menu_item_id?: number;
  name: string;
  price: number;
  unit_price?: number;
  quantity: number;
  customizations?: Record<string, unknown>;
  image_url?: string;
}

export interface Order {
  id: number;
  order_number: string;
  order_type: 'pickup' | 'delivery' | 'dine_in';
  status: string;
  total: number;
  subtotal?: number;
  discount?: number;
  voucher_discount?: number;
  reward_discount?: number;
  delivery_fee?: number;
  items: OrderItem[];
  created_at: string;
  updated_at?: string;
  store_id?: number;
  store_name?: string;
  store_address?: string;
  table_id?: number;
  pickup_time?: string;
  delivery_address?: Record<string, unknown> | string;
  notes?: string;
  recipient_name?: string;
  recipient_phone?: string;
  payment_method?: string;
  payment_status?: string;
  loyalty_points_earned?: number;
  points_earned?: number;
  voucher_code?: string;
  reward_redemption_code?: string;
  delivery_status?: string;
  delivery_external_id?: string;
  delivery_tracking_url?: string;
  delivery_eta_minutes?: number;
  delivery_courier_name?: string;
  delivery_courier_phone?: string;
  pos_synced_at?: string;
  pos_synced_by?: number;
  delivery_dispatched_at?: string;
  delivery_dispatched_by?: number;
  staff_notes?: string;
  status_timeline?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
  timeline?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
  loyalty_discount?: number;
}

export interface CartItem {
  id?: number;
  menu_item_id: number;
  name: string;
  price: number;
  base_price?: number;
  quantity: number;
  store_id?: number;
  customizations?: Record<string, unknown>;
  customization_option_ids?: number[];
  customization_count?: number;
  image_url?: string;
}

export interface DeliveryAddress {
  address: string;
  lat?: number;
  lng?: number;
}

export interface Table {
  id: number;
  store_id: number;
  table_number: string;
  capacity: number;
}

export interface PaymentMethod {
  id: number;
  type: 'wallet' | 'card' | 'cash';
  last4?: string;
  brand?: string;
}

export interface WalletData {
  balance: number;
  currency: string;
  loyalty_points: number;
  tier: string;
  total_points_earned?: number;
}

export interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
  reference_id?: string;
}

export interface LoyaltyHistoryEntry {
  id: number;
  points: number;
  type: string;
  description?: string;
  created_at: string;
}

export interface Banner {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  action_type?: string;
  action_url?: string;
  position: number;
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  user_type?: string;
  date_of_birth?: string;
  created_at?: string;
  referral_code?: string;
}

export interface Reservation {
  id: number;
  store_id: number;
  store_name?: string;
  customer_name?: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  status: 'requested' | 'confirmed' | 'seated' | 'no_show' | 'cancelled' | 'completed';
  notes?: string;
  table_number?: string;
  created_at?: string;
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
}

export interface SurveyQuestion {
  id?: number;
  question_text: string;
  question_type: 'text' | 'single_choice' | 'multiple_choice' | 'rating';
  options?: string[];
  required: boolean;
  display_order: number;
}

export interface SurveyResponse {
  id: number;
  customer_name: string;
  submitted_at: string;
  answers: { question_id: number; answer: string }[];
}

export type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'profile' | 'wallet' | 'history' | 'promotions' | 'information' | 'my-rewards' | 'account-details' | 'payment-methods' | 'saved-addresses' | 'notifications' | 'help-support' | 'legal' | 'settings' | 'my-card' | 'referral' | 'reservations' | 'events' | 'checkin';
export type OrderMode = 'pickup' | 'delivery' | 'dine_in';

export function cacheBust(url: string, ts?: number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ts ?? Date.now()}`;
}
