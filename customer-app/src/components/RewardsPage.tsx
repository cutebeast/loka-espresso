'use client';

import { useApp } from '../lib/app-context';

export default function RewardsPage() {
  const { loyaltyTier, loyaltyPoints, rewards, redeemReward } = useApp();

  return (
    <div className="page-enter">
      <h2 style={{ fontWeight: 700, margin: '12px 0' }}>Loka Rewards</h2>
      <div style={{ background: 'white', borderRadius: 24, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <i className="fas fa-crown" style={{ fontSize: 32, color: '#FFB347' }}></i>
          <div><strong>{loyaltyTier}</strong><br />{loyaltyPoints} points</div>
        </div>
        <div style={{ background: '#E2E8E2', height: 10, borderRadius: 20, margin: '14px 0' }}>
          <div style={{ background: '#384B16', width: `${Math.min((loyaltyPoints / 400) * 100, 100)}%`, height: 10, borderRadius: 20 }}></div>
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
      <div className="promo-card" style={{ background: '#2A3910' }}>
        <h4>Invite friends, get RM10</h4>
        <p style={{ fontSize: 14, marginTop: 4 }}>Share your love for coffee</p>
        <button className="btn-outline-light" style={{ marginTop: 12 }}>Share code</button>
      </div>
    </div>
  );
}
