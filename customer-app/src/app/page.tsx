'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

const API = '/api/v1';

interface Store { id: number; name: string; slug: string; address: string; phone: string; opening_hours: Record<string, string>; is_active: boolean; }
interface Category { id: number; name: string; slug: string; is_active: boolean; }
interface MenuItem { id: number; store_id: number; category_id: number; name: string; description: string; base_price: number; image_url: string | null; is_available: boolean; customization_options?: Record<string, unknown>; }
interface Reward { id: number; name: string; description: string; points_cost: number; reward_type: string; is_active: boolean; }
interface Order { id: number; order_number: string; order_type: string; status: string; total: number; items: Array<Record<string, unknown>>; created_at: string; }
interface CartItem { id?: number; name: string; price: number; quantity: number; customizations?: Record<string, unknown>; itemId?: number; }

type PageId = 'home' | 'menu' | 'rewards' | 'cart' | 'orders' | 'profile' | 'history';
type OrderMode = 'pickup' | 'delivery';

function apiFetch(path: string, token?: string, options?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}${path}`, { ...options, headers });
}

export default function CustomerApp() {
  const [token, setToken] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  const [page, setPage] = useState<PageId>('home');
  const [orderMode, setOrderMode] = useState<OrderMode>('pickup');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loyaltyTier, setLoyaltyTier] = useState('Bronze');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');

  const [showLogin, setShowLogin] = useState(false);
  const [loginStep, setLoginStep] = useState(1);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [loyaltyHistory, setLoyaltyHistory] = useState<Array<{ id: number; points: number; type: string; created_at: string }>>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletHistory, setWalletHistory] = useState<Array<{ id: number; amount: number; type: string; description: string; created_at: string }>>([]);

  const [showStoreLocator, setShowStoreLocator] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setShowSplash(false);
      const saved = localStorage.getItem('fnb_customer_token');
      if (saved) { setToken(saved); } else { setShowLogin(true); }
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (token) { localStorage.setItem('fnb_customer_token', token); loadUserData(); }
  }, [token]);

  useEffect(() => {
    if (!token || !selectedStore) return;
    if (page === 'menu') loadMenu();
  }, [page, token, selectedStore, selectedCategory]);

  useEffect(() => {
    if (!token) return;
    if (page === 'orders') loadOrders();
    if (page === 'rewards') loadRewards();
    if (page === 'history') loadHistory();
  }, [page, token]);

  async function loadHistory() {
    try {
      const [loyaltyRes, walletRes] = await Promise.all([
        apiFetch('/loyalty/history?page_size=20', token),
        apiFetch('/wallet/transactions?page_size=20', token),
      ]);
      if (loyaltyRes.ok) setLoyaltyHistory(await loyaltyRes.json());
      if (walletRes.ok) { const w = await walletRes.json(); setWalletHistory(Array.isArray(w) ? w : (w.transactions || [])); }
      const balRes = await apiFetch('/wallet', token);
      if (balRes.ok) { const b = await balRes.json(); setWalletBalance(b.balance || 0); }
    } catch {}
  }

  async function loadUserData() {
    try {
      const [meRes, loyaltyRes] = await Promise.all([apiFetch('/users/me', token), apiFetch('/loyalty/balance', token)]);
      if (meRes.ok) { const u = await meRes.json(); setUserName(u.name || ''); setUserEmail(u.email || ''); setUserPhone(u.phone || ''); }
      if (loyaltyRes.ok) { const l = await loyaltyRes.json(); setLoyaltyPoints(l.points_balance || 0); setLoyaltyTier(l.tier || 'Bronze'); }
      const storesRes = await apiFetch('/stores', token);
      if (storesRes.ok) { const s = await storesRes.json(); setStores(s); if (s.length > 0) setSelectedStore(s[0]); }
    } catch {}
  }

  async function loadMenu() {
    if (!selectedStore) return;
    try {
      const [catRes, itemRes] = await Promise.all([apiFetch(`/stores/${selectedStore.id}/categories`, token), apiFetch(`/stores/${selectedStore.id}/items`, token)]);
      if (catRes.ok) { const c = await catRes.json(); setCategories(c); if (c.length > 0 && !selectedCategory) setSelectedCategory(c[0].id); }
      if (itemRes.ok) setMenuItems(await itemRes.json());
    } catch {}
  }

  async function loadOrders() {
    try { const res = await apiFetch('/orders', token); if (res.ok) setOrders(await res.json()); } catch {}
  }

  async function loadRewards() {
    try { const res = await apiFetch('/rewards', token); if (res.ok) setRewards((await res.json()).filter((r: Reward) => r.is_active)); } catch {}
  }

  async function handleSendOTP(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch('/auth/send-otp', undefined, { method: 'POST', body: JSON.stringify({ phone: phoneInput }) });
      if (res.ok) setLoginStep(2);
    } catch {}
  }

  async function handleVerifyOTP(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch('/auth/verify-otp', undefined, { method: 'POST', body: JSON.stringify({ phone: phoneInput, code: otpInput }) });
      if (res.ok) { const d = await res.json(); setToken(d.access_token); setShowLogin(false); }
    } catch {}
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/auth/register', token, { method: 'POST', body: JSON.stringify({ name: regName, email: regEmail }) });
      setUserName(regName); setUserEmail(regEmail); setShowLogin(false); setShowModal(false);
    } catch {}
  }

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.itemId === item.id);
      if (existing) return prev.map(c => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { name: item.name, price: item.base_price, quantity: 1, itemId: item.id }];
    });
  }

  function updateCartQty(idx: number, delta: number) {
    setCart(prev => { const c = [...prev]; c[idx].quantity += delta; return c.filter(x => x.quantity > 0); });
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const deliveryFee = orderMode === 'delivery' ? 3 : 0;

  async function handleCheckout() {
    if (!selectedStore || cart.length === 0) return;
    try {
      const body: Record<string, unknown> = { store_id: selectedStore.id, order_type: orderMode, items: cart.map(c => ({ name: c.name, price: c.price, quantity: c.quantity })), subtotal: cartTotal, delivery_fee: deliveryFee, total: cartTotal + deliveryFee, payment_method: 'cash' };
      const res = await apiFetch('/orders', token, { method: 'POST', body: JSON.stringify(body) });
      if (res.ok) { setCart([]); setPage('orders'); loadOrders(); }
    } catch {}
  }

  async function redeemReward(r: Reward) {
    if (loyaltyPoints < r.points_cost) return;
    try {
      const res = await apiFetch(`/rewards/${r.id}/redeem`, token, { method: 'POST' });
      if (res.ok) { loadRewards(); const lRes = await apiFetch('/loyalty/balance', token); if (lRes.ok) { const l = await lRes.json(); setLoyaltyPoints(l.points_balance || 0); } }
    } catch {}
  }

  function openCustomize(item: MenuItem) {
    setModalTitle(item.name);
    const opts = item.customization_options as Record<string, Array<Record<string, unknown>>> | undefined;
    const sizes = opts?.sizes || [];
    const addons = opts?.addons || [];
    let selectedSize = sizes.length > 0 ? (sizes[0] as Record<string, unknown>) : null;
    let selectedAddons: boolean[] = new Array(addons.length).fill(false);

    setModalContent(
      <div>
        {sizes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>Size</label>
            <select onChange={e => { selectedSize = sizes[Number(e.target.value)]; }} style={{ marginTop: 8 }}>
              {sizes.map((s, i) => <option key={i} value={i}>{String(s.name)} {Number(s.price) > 0 ? `(+RM ${Number(s.price).toFixed(2)})` : ''}</option>)}
            </select>
          </div>
        )}
        {addons.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>Add-ons</label>
            {addons.map((a, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 14 }}>
                <input type="checkbox" onChange={e => { selectedAddons[i] = e.target.checked; }} />
                {String(a.name)} (+RM {Number(a.price).toFixed(2)})
              </label>
            ))}
          </div>
        )}
        <button className="btn-primary" onClick={() => {
          let price = item.base_price;
          if (selectedSize) price += Number(selectedSize.price || 0);
          addons.forEach((a, i) => { if (selectedAddons[i]) price += Number(a.price || 0); });
          setCart(prev => [...prev, { name: item.name, price, quantity: 1, itemId: item.id }]);
          setShowModal(false);
        }}>
          Add to cart · RM {item.base_price.toFixed(2)}
        </button>
      </div>
    );
    setShowModal(true);
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  const filteredItems = selectedCategory ? menuItems.filter(i => i.category_id === selectedCategory) : menuItems;

  if (showSplash) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="app-frame">
          <div className="splash-screen">
            <div style={{ fontSize: 48, fontWeight: 800, color: 'white', letterSpacing: 4, marginBottom: 24 }}>ZUS</div>
            <div className="spinner"></div>
            <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: 20 }}>Coffee · Community · Culture</p>
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: PageId; icon: string; label: string }> = [
    { id: 'home', icon: 'fa-home', label: 'Home' },
    { id: 'menu', icon: 'fa-mug-saucer', label: 'Menu' },
    { id: 'rewards', icon: 'fa-crown', label: 'Rewards' },
    { id: 'cart', icon: 'fa-shopping-bag', label: 'Cart' },
    { id: 'orders', icon: 'fa-receipt', label: 'Orders' },
    { id: 'profile', icon: 'fa-user', label: 'Profile' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="app-frame">
        {/* Header */}
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0F4FC', padding: '8px 14px', borderRadius: 40, cursor: 'pointer' }} onClick={() => setShowStoreLocator(true)}>
              <i className="fas fa-map-pin" style={{ color: '#002F6C', fontSize: 14 }}></i>
              <span style={{ fontWeight: 600, fontSize: 15, color: '#002F6C' }}>{selectedStore?.name || 'Select store'}</span>
              <i className="fas fa-chevron-down" style={{ fontSize: 12 }}></i>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <i className="far fa-bell" style={{ fontSize: 22, color: '#002F6C', cursor: 'pointer' }}></i>
              <i className="fas fa-qrcode" style={{ fontSize: 22, color: '#002F6C', cursor: 'pointer' }} onClick={() => {
                setModalTitle('Scan QR at table');
                setModalContent(<div style={{ textAlign: 'center' }}><div style={{ background: '#eee', height: 200, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0' }}><i className="fas fa-camera" style={{ fontSize: 48 }}></i></div><p>Point camera at table QR code for dine-in</p></div>);
                setShowModal(true);
              }}></i>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#001B3D' }}>{getGreeting()}, {userName ? userName.split(' ')[0] : 'there'} 👋</h2>
            <p style={{ color: '#5E6873', fontSize: 15, marginTop: 4 }}>What&apos;s your coffee mood today?</p>
          </div>
          <div style={{ display: 'flex', marginTop: 14, background: '#F2F5F9', padding: 4, borderRadius: 50 }}>
            <div className={`toggle-option ${orderMode === 'pickup' ? 'active' : ''}`} onClick={() => setOrderMode('pickup')}>Pickup</div>
            <div className={`toggle-option ${orderMode === 'delivery' ? 'active' : ''}`} onClick={() => setOrderMode('delivery')}>Delivery</div>
          </div>
        </div>

        {/* Content */}
        <div className="app-content">
          {/* HOME */}
          {page === 'home' && (
            <div className="page-enter">
              <div className="promo-card">
                <div style={{ background: 'rgba(255,255,255,0.18)', padding: '6px 14px', borderRadius: 30, fontSize: 13, fontWeight: 600, display: 'inline-block', marginBottom: 14 }}>⚡ LIMITED OFFER</div>
                <h4 style={{ fontSize: 20, fontWeight: 700 }}>RM 2.99 First Coffee</h4>
                <p style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>New users get any handcrafted drink for RM2.99</p>
                <button className="btn-outline-light" style={{ marginTop: 14 }} onClick={() => setPage('menu')}>Order now →</button>
              </div>

              <div style={{ background: 'white', borderRadius: 24, padding: 18, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>⭐ {loyaltyTier}</span>
                  <span>{loyaltyPoints} pts</span>
                </div>
                <div style={{ background: '#E2E8F0', height: 10, borderRadius: 20, margin: '14px 0' }}>
                  <div style={{ background: '#002F6C', width: `${Math.min((loyaltyPoints / 400) * 100, 100)}%`, height: 10, borderRadius: 20 }}></div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '20px 0 12px' }}>
                <h3 style={{ fontSize: 20, fontWeight: 700 }}>Popular</h3>
                <span style={{ color: '#002F6C', fontWeight: 600, fontSize: 14, cursor: 'pointer' }} onClick={() => setPage('menu')}>See all →</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {menuItems.filter(i => i.is_available).slice(0, 4).map(item => (
                  <div key={item.id} className="product-card" onClick={() => openCustomize(item)}>
                    <div className="img-placeholder"><i className="fas fa-mug-hot" style={{ fontSize: 32, color: '#002F6C' }}></i></div>
                    <h4 style={{ fontSize: 15, fontWeight: 700 }}>{item.name}</h4>
                    <div style={{ fontSize: 13, color: '#65768A', marginBottom: 8 }}>{item.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, color: '#002F6C' }}>RM {item.base_price.toFixed(2)}</span>
                      <button className="add-btn" onClick={e => { e.stopPropagation(); addToCart(item); }}><i className="fas fa-plus"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MENU */}
          {page === 'menu' && (
            <div className="page-enter">
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0 12px', whiteSpace: 'nowrap' as const }}>
                <span className={`chip ${selectedCategory === null ? 'active' : ''}`} onClick={() => setSelectedCategory(null)}>All</span>
                {categories.map(c => (
                  <span key={c.id} className={`chip ${selectedCategory === c.id ? 'active' : ''}`} onClick={() => setSelectedCategory(c.id)}>{c.name}</span>
                ))}
              </div>
              {filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>No items found. Select a store first.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {filteredItems.filter(i => i.is_available).map(item => (
                    <div key={item.id} className="product-card" onClick={() => openCustomize(item)}>
                      <div className="img-placeholder"><i className="fas fa-mug-hot" style={{ fontSize: 32, color: '#002F6C' }}></i></div>
                      <h4 style={{ fontSize: 15, fontWeight: 700 }}>{item.name}</h4>
                      <div style={{ fontSize: 13, color: '#65768A', marginBottom: 8 }}>{item.description}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, color: '#002F6C' }}>RM {item.base_price.toFixed(2)}</span>
                        <button className="add-btn" onClick={e => { e.stopPropagation(); addToCart(item); }}><i className="fas fa-plus"></i></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* REWARDS */}
          {page === 'rewards' && (
            <div className="page-enter">
              <h2 style={{ fontWeight: 700, margin: '12px 0' }}>ZUS Rewards</h2>
              <div style={{ background: 'white', borderRadius: 24, padding: 18, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <i className="fas fa-crown" style={{ fontSize: 32, color: '#FFB347' }}></i>
                  <div><strong>{loyaltyTier}</strong><br />{loyaltyPoints} points</div>
                </div>
                <div style={{ background: '#E2E8F0', height: 10, borderRadius: 20, margin: '14px 0' }}>
                  <div style={{ background: '#002F6C', width: `${Math.min((loyaltyPoints / 400) * 100, 100)}%`, height: 10, borderRadius: 20 }}></div>
                </div>
                <p style={{ fontSize: 14, color: '#64748B' }}>{Math.max(0, 400 - loyaltyPoints)} pts to Gold tier</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '20px 0 12px' }}>
                <h3 style={{ fontWeight: 700 }}>Redeem points</h3>
              </div>
              <div style={{ background: 'white', borderRadius: 20, padding: 16 }}>
                {rewards.length === 0 ? (
                  <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No rewards available</p>
                ) : rewards.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F0F3F8' }}>
                    <div><strong>{r.name}</strong><div style={{ fontSize: 13, color: '#64748B' }}>{r.description}</div></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.points_cost} pts</span>
                      <button className="add-btn" style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }} disabled={loyaltyPoints < r.points_cost} onClick={() => redeemReward(r)}>
                        {loyaltyPoints >= r.points_cost ? 'Redeem' : `${r.points_cost} pts`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ margin: '20px 0 12px' }}><h3 style={{ fontWeight: 700 }}>Referral Program</h3></div>
              <div className="promo-card" style={{ background: '#1A2E4D' }}>
                <h4>Invite friends, get RM10</h4>
                <p style={{ fontSize: 14, marginTop: 4 }}>Share your love for coffee</p>
                <button className="btn-outline-light" style={{ marginTop: 12 }}>Share code</button>
              </div>
            </div>
          )}

          {/* CART */}
          {page === 'cart' && (
            <div className="page-enter">
              <h2 style={{ fontWeight: 700, margin: '12px 0' }}>Your cart</h2>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}><i className="fas fa-shopping-bag" style={{ fontSize: 48, opacity: 0.3 }}></i><p style={{ marginTop: 12, color: '#94A3B8' }}>Your cart is empty</p></div>
              ) : (
                <>
                  {cart.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid #F0F3F8' }}>
                      <div style={{ width: 60, height: 60, background: '#EFF3F9', borderRadius: 16, flexShrink: 0 }}></div>
                      <div style={{ flex: 1 }}>
                        <h4>{item.name}</h4>
                        <div style={{ color: '#002F6C', fontWeight: 600 }}>RM {item.price.toFixed(2)}</div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                          <button style={{ background: 'none', border: '1px solid #DDE3E9', borderRadius: 20, width: 32, height: 32, cursor: 'pointer' }} onClick={() => updateCartQty(i, -1)}>-</button>
                          <span style={{ lineHeight: '32px', fontWeight: 600 }}>{item.quantity}</span>
                          <button style={{ background: 'none', border: '1px solid #DDE3E9', borderRadius: 20, width: 32, height: 32, cursor: 'pointer' }} onClick={() => updateCartQty(i, 1)}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ background: 'white', borderRadius: 24, padding: 20, marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>RM {cartTotal.toFixed(2)}</span></div>
                    {deliveryFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><span>Delivery</span><span>RM {deliveryFee.toFixed(2)}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 16, fontSize: 18 }}><span>Total</span><span>RM {(cartTotal + deliveryFee).toFixed(2)}</span></div>
                    <button className="btn-primary" style={{ marginTop: 16 }} onClick={handleCheckout}>
                      Checkout · RM {(cartTotal + deliveryFee).toFixed(2)}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ORDERS */}
          {page === 'orders' && (
            <div className="page-enter">
              <h2 style={{ fontWeight: 700, margin: '12px 0' }}>Recent orders</h2>
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}><i className="fas fa-receipt" style={{ fontSize: 48, opacity: 0.3 }}></i><p style={{ marginTop: 12, color: '#94A3B8' }}>No orders yet</p></div>
              ) : orders.map(o => {
                const statusColors: Record<string, string> = { pending: '#FEF9C3', preparing: '#FEF9C3', confirmed: '#DBEAFE', ready: '#DCFCE7', completed: '#DCFCE7', cancelled: '#FEE2E2' };
                const statusTextColors: Record<string, string> = { pending: '#854D0E', preparing: '#854D0E', confirmed: '#1E3A8A', ready: '#166534', completed: '#166534', cancelled: '#991B1B' };
                return (
                  <div key={o.id} style={{ background: 'white', borderRadius: 20, padding: 16, marginTop: 12, cursor: 'pointer' }} onClick={() => {
                    setModalTitle(`Order ${o.order_number}`);
                    const steps = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
                    const currentIdx = steps.indexOf(o.status);
                    setModalContent(
                      <div>
                        <p style={{ marginBottom: 8 }}><strong>Type:</strong> {o.order_type}</p>
                        <p style={{ marginBottom: 8 }}><strong>Total:</strong> RM {Number(o.total).toFixed(2)}</p>
                        <p style={{ marginBottom: 16 }}><strong>Created:</strong> {new Date(o.created_at).toLocaleString()}</p>
                        {steps.map((s, idx) => (
                          <div key={s} style={{ display: 'flex', gap: 12, margin: '12px 0', alignItems: 'center' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 40, background: idx <= currentIdx ? '#002F6C' : '#EFF3F8', color: idx <= currentIdx ? 'white' : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <i className={`fas ${idx <= currentIdx ? 'fa-check' : 'fa-circle'}`} style={{ fontSize: 14 }}></i>
                            </div>
                            <span style={{ textTransform: 'capitalize', fontWeight: idx <= currentIdx ? 600 : 400 }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    );
                    setShowModal(true);
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>#{o.order_number}</strong></span><span>{new Date(o.created_at).toLocaleDateString()}</span></div>
                    <p style={{ color: '#64748B', marginTop: 4 }}>{Array.isArray(o.items) ? o.items.map((it: Record<string, unknown>) => it.name).join(', ') : ''}</p>
                    <span style={{ background: statusColors[o.status] || '#F1F5F9', color: statusTextColors[o.status] || '#334155', padding: '4px 12px', borderRadius: 30, fontSize: 13, fontWeight: 600, display: 'inline-block', marginTop: 8 }}>{o.status}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* PROFILE */}
          {page === 'profile' && (
            <div className="page-enter">
              <div style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
                <div style={{ width: 64, height: 64, background: '#002F6C', borderRadius: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28, fontWeight: 700, flexShrink: 0 }}>
                  {userName ? userName[0].toUpperCase() : '?'}
                </div>
                <div><h3>{userName || 'Guest'}</h3><p style={{ color: '#64748B' }}>{userEmail || userPhone}</p></div>
              </div>

              {/* Loyalty Summary Card */}
              <div style={{ background: 'linear-gradient(135deg, #002F6C, #1E4A7A)', borderRadius: 20, padding: 20, marginBottom: 16, color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, opacity: 0.8 }}>⭐ {loyaltyTier}</span>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{loyaltyPoints} pts</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, height: 6 }}>
                  <div style={{ background: 'white', width: `${Math.min((loyaltyPoints / 400) * 100, 100)}%`, height: 6, borderRadius: 10 }}></div>
                </div>
                <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{Math.max(0, 400 - loyaltyPoints)} pts to next tier</p>
              </div>

              {/* Wallet Card */}
              <div style={{ background: 'white', borderRadius: 20, padding: 20, marginBottom: 16, border: '1px solid #ECF1F7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 13, color: '#64748B' }}>Wallet Balance</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: '#002F6C' }}>RM {walletBalance.toFixed(2)}</p>
                  </div>
                  <i className="fas fa-wallet" style={{ fontSize: 32, color: '#002F6C', opacity: 0.3 }}></i>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: 24, padding: '8px 0' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0F3F8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => setPage('history')}>
                  <span><i className="fas fa-clock-rotate-left" style={{ marginRight: 14, color: '#002F6C' }}></i> Transaction History</span>
                  <i className="fas fa-chevron-right" style={{ color: '#94A3B8', fontSize: 12 }}></i>
                </div>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0F3F8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => {
                  setModalTitle('Delivery Addresses');
                  setModalContent(<p style={{ color: '#64748B' }}>Manage your delivery addresses here.</p>);
                  setShowModal(true);
                }}>
                  <span><i className="fas fa-map-marker-alt" style={{ marginRight: 14, color: '#002F6C' }}></i> Addresses</span>
                  <i className="fas fa-chevron-right" style={{ color: '#94A3B8', fontSize: 12 }}></i>
                </div>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0F3F8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => {
                  setModalTitle('Payment Methods');
                  setModalContent(<p style={{ color: '#64748B' }}>Manage your payment methods here.</p>);
                  setShowModal(true);
                }}>
                  <span><i className="fas fa-credit-card" style={{ marginRight: 14, color: '#002F6C' }}></i> Payment methods</span>
                  <i className="fas fa-chevron-right" style={{ color: '#94A3B8', fontSize: 12 }}></i>
                </div>
                <div style={{ padding: '18px 20px', cursor: 'pointer' }}>
                  <span><i className="fas fa-bell" style={{ marginRight: 14, color: '#002F6C' }}></i> Push notifications</span>
                  <span style={{ float: 'right', color: '#10B981', fontWeight: 600 }}>ON</span>
                </div>
              </div>
              <button style={{ marginTop: 20, width: '100%', padding: 16, borderRadius: 40, border: '1px solid #DDE3E9', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: 16 }} onClick={() => { setToken(''); localStorage.removeItem('fnb_customer_token'); setShowLogin(true); }}>Sign out</button>
            </div>
          )}

          {/* TRANSACTION HISTORY */}
          {page === 'history' && (
            <div className="page-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <button onClick={() => setPage('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#002F6C' }}><i className="fas fa-arrow-left"></i></button>
                <h3>Transaction History</h3>
              </div>

              {/* Loyalty Points History */}
              <div style={{ background: 'white', borderRadius: 20, padding: 16, marginBottom: 16, border: '1px solid #ECF1F7' }}>
                <h4 style={{ marginBottom: 12, color: '#002F6C' }}>⭐ Loyalty Points</h4>
                {loyaltyHistory.length === 0 ? (
                  <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No loyalty history yet</p>
                ) : loyaltyHistory.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F3F8' }}>
                    <div>
                      <p style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t.type}</p>
                      <p style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                    <span style={{ fontWeight: 700, color: t.points > 0 ? '#10B981' : '#EF4444' }}>
                      {t.points > 0 ? '+' : ''}{t.points} pts
                    </span>
                  </div>
                ))}
              </div>

              {/* Wallet History */}
              <div style={{ background: 'white', borderRadius: 20, padding: 16, marginBottom: 16, border: '1px solid #ECF1F7' }}>
                <h4 style={{ marginBottom: 12, color: '#002F6C' }}>💰 Wallet Transactions</h4>
                {walletHistory.length === 0 ? (
                  <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No wallet transactions yet</p>
                ) : walletHistory.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F3F8' }}>
                    <div>
                      <p style={{ fontWeight: 600 }}>{t.description || t.type}</p>
                      <p style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                    <span style={{ fontWeight: 700, color: t.amount > 0 ? '#10B981' : '#EF4444' }}>
                      {t.amount > 0 ? '+' : ''}RM {Math.abs(t.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <div className="bottom-nav">
          {navItems.map(n => (
            <div key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
              <i className={`fas ${n.icon}`}></i>
              <span>{n.label}</span>
              {n.id === 'cart' && cart.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: 'white', fontSize: 10, width: 16, height: 16, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cart.reduce((s, c) => s + c.quantity, 0)}</span>
              )}
            </div>
          ))}
        </div>

        {/* Login Modal */}
        {showLogin && (
          <div className="modal-overlay" style={{ alignItems: 'center' }}>
            <div className="modal-sheet" style={{ borderRadius: 28 }}>
              {loginStep === 1 && (
                <>
                  <h3 style={{ marginBottom: 8 }}>Log in / Sign up</h3>
                  <p style={{ color: '#64748B', marginBottom: 16 }}>Enter your phone number to get started</p>
                  <form onSubmit={handleSendOTP}>
                    <input type="tel" placeholder="Phone number (e.g. +6012345678)" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} required style={{ marginBottom: 12 }} />
                    <button type="submit" className="btn-primary">Send SMS OTP</button>
                  </form>
                </>
              )}
              {loginStep === 2 && (
                <>
                  <h3 style={{ marginBottom: 8 }}>Enter OTP</h3>
                  <p style={{ color: '#64748B', marginBottom: 16 }}>We sent a code to {phoneInput}</p>
                  <form onSubmit={handleVerifyOTP}>
                    <input type="text" placeholder="6-digit OTP" value={otpInput} onChange={e => setOtpInput(e.target.value)} maxLength={6} required style={{ marginBottom: 12, textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
                    <button type="submit" className="btn-primary">Verify</button>
                  </form>
                  <p style={{ marginTop: 12, fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Demo: check backend logs for OTP code</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Store Locator Modal */}
        {showStoreLocator && (
          <div className="modal-overlay" onClick={() => setShowStoreLocator(false)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 16 }}>Nearby stores</h3>
              <div style={{ background: '#E2E8F0', height: 120, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 16px' }}>
                <i className="fas fa-map-marked-alt" style={{ fontSize: 28, color: '#64748B' }}></i>
              </div>
              {stores.map(s => (
                <div key={s.id} style={{ background: s.id === selectedStore?.id ? '#EFF6FF' : '#F4F7FB', borderRadius: 18, padding: 14, marginBottom: 8, cursor: 'pointer', border: s.id === selectedStore?.id ? '2px solid #002F6C' : 'none' }} onClick={() => { setSelectedStore(s); setShowStoreLocator(false); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>📍 {s.name}</strong></span>
                    <span style={{ fontSize: 13, color: '#059669' }}>Open</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{s.address}</p>
                </div>
              ))}
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowStoreLocator(false)}>Select</button>
            </div>
          </div>
        )}

        {/* Generic Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3>{modalTitle}</h3>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }} onClick={() => setShowModal(false)}>✕</button>
              </div>
              {modalContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
