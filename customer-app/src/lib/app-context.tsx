'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Store, Category, MenuItem, Reward, Order, CartItem, PageId, OrderMode,
  apiFetch,
} from './api';

interface AppContextValue {
  token: string;
  setToken: (v: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  selectedStore: Store | null;
  setSelectedStore: (v: Store | null) => void;
  stores: Store[];
  setStores: (v: Store[]) => void;
  orderMode: OrderMode;
  setOrderMode: (v: OrderMode) => void;
  page: PageId;
  setPage: (v: PageId) => void;
  userName: string;
  userEmail: string;
  userPhone: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  modalContent: ReactNode;
  setModalContent: (v: ReactNode) => void;
  modalTitle: string;
  setModalTitle: (v: string) => void;
  showLogin: boolean;
  setShowLogin: (v: boolean) => void;
  menuItems: MenuItem[];
  categories: Category[];
  selectedCategory: number | null;
  setSelectedCategory: (v: number | null) => void;
  orders: Order[];
  rewards: Reward[];
  loyaltyHistory: Array<{ id: number; points: number; type: string; created_at: string }>;
  walletBalance: number;
  walletHistory: Array<{ id: number; amount: number; type: string; description: string; created_at: string }>;
  loadMenu: () => void;
  loadOrders: () => void;
  loadRewards: () => void;
  loadHistory: () => void;
  loadUserData: () => void;
  addToCart: (item: MenuItem) => void;
  updateCartQty: (idx: number, delta: number) => void;
  cartTotal: number;
  deliveryFee: number;
  handleCheckout: () => void;
  redeemReward: (r: Reward) => void;
  openCustomize: (item: MenuItem) => void;
  getGreeting: () => string;
  filteredItems: MenuItem[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState('');
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
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [loyaltyHistory, setLoyaltyHistory] = useState<Array<{ id: number; points: number; type: string; created_at: string }>>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletHistory, setWalletHistory] = useState<Array<{ id: number; amount: number; type: string; description: string; created_at: string }>>([]);

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

  useEffect(() => {
    const t = setTimeout(() => {
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

  return (
    <AppContext.Provider value={{
      token, setToken,
      cart, setCart,
      selectedStore, setSelectedStore,
      stores, setStores,
      orderMode, setOrderMode,
      page, setPage,
      userName, userEmail, userPhone,
      loyaltyPoints, loyaltyTier,
      showModal, setShowModal,
      modalContent, setModalContent,
      modalTitle, setModalTitle,
      showLogin, setShowLogin,
      menuItems, categories,
      selectedCategory, setSelectedCategory,
      orders, rewards,
      loyaltyHistory, walletBalance, walletHistory,
      loadMenu, loadOrders, loadRewards, loadHistory, loadUserData,
      addToCart, updateCartQty,
      cartTotal, deliveryFee,
      handleCheckout, redeemReward, openCustomize,
      getGreeting, filteredItems,
    }}>
      {children}
    </AppContext.Provider>
  );
}
