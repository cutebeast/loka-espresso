'use client';

import { useApp } from '../lib/app-context';

export default function CartPage() {
  const { cart, updateCartQty, cartTotal, deliveryFee, handleCheckout } = useApp();

  return (
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
  );
}
