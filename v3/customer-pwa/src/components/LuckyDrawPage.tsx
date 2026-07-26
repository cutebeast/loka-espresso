'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Gift, Ticket } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LOKA } from '@/lib/tokens';
import api from '@/lib/api';

interface LuckyDrawSegment {
  id: number;
  label: string;
  color_hex: string;
  probability_weight: number;
  sort_order: number;
}

interface LuckyDrawCampaign {
  id: number;
  title: string;
  description: string | null;
  spins_per_day: number;
  draw_type: 'free_daily' | 'ticket_spend';
  spend_per_ticket_cents: number;
  max_segments: number;
  segments: LuckyDrawSegment[];
  spins_remaining: number | null;
  tickets_available: number | null;
}

interface SpinResult {
  segment: LuckyDrawSegment;
  voucher_code: string;
  voucher_title: string;
  spins_remaining: number;
  tickets_remaining: number | null;
}

const WHEEL_SIZE = 300;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = WHEEL_SIZE / 2 - 6;
const FULL_TURNS = 5;
const SPIN_DURATION_MS = 4500;

/** Polar point on the wheel; angle in degrees clockwise from 12 o'clock. */
function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) };
}

function segmentPath(startDeg: number, endDeg: number): string {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polar(startDeg, RADIUS);
  const p2 = polar(endDeg, RADIUS);
  return `M ${CENTER} ${CENTER} L ${p1.x} ${p1.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function truncateLabel(label: string): string {
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

export default function LuckyDrawPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setPage, showToast, triggerSignIn } = useUIStore();
  const reducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<LuckyDrawCampaign | null>(null);
  const [spinsRemaining, setSpinsRemaining] = useState<number | null>(null);
  const [ticketsAvailable, setTicketsAvailable] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/lucky-draw/active');
      const data = res.data as unknown as LuckyDrawCampaign;
      const segments = [...(data.segments || [])].sort((a, b) => a.sort_order - b.sort_order);
      setCampaign({ ...data, segments });
      setSpinsRemaining(data.spins_remaining);
      setTicketsAvailable(data.tickets_available ?? null);
    } catch {
      // 404 = no active campaign; anything else leaves the empty state too
      setCampaign(null);
      setSpinsRemaining(null);
      setTicketsAvailable(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, isAuthenticated]);

  useEffect(() => () => {
    if (spinTimer.current) clearTimeout(spinTimer.current);
  }, []);

  const segments = campaign?.segments ?? [];
  const segAngle = segments.length > 0 ? 360 / segments.length : 360;
  const isTicketType = campaign?.draw_type === 'ticket_spend';
  const avail = isTicketType ? ticketsAvailable : spinsRemaining;

  const handleSpin = async () => {
    if (spinning) return;
    if (!isAuthenticated) {
      triggerSignIn();
      return;
    }
    if (avail === 0 || segments.length === 0) return;
    setSpinning(true);
    setLimitHit(false);
    try {
      // 1) Ask the server for the winning segment FIRST
      const res = await api.post('/lucky-draw/spin');
      const spinResult = res.data as unknown as SpinResult;
      const winIndex = segments.findIndex((s) => s.id === spinResult.segment.id);
      const idx = winIndex >= 0 ? winIndex : 0;

      // 2) Animate the wheel to land that segment under the top pointer.
      //    Rotating clockwise by R puts wheel-angle (360 - R mod 360) at the top,
      //    so R mod 360 must equal 360 - segment-center-angle.
      const segmentCenter = (idx + 0.5) * segAngle;
      const targetMod = ((360 - segmentCenter) % 360 + 360) % 360;
      const jitter = (Math.random() - 0.5) * segAngle * 0.5;
      setRotation((prev) => {
        const currentMod = ((prev % 360) + 360) % 360;
        const delta = ((targetMod - currentMod) % 360 + 360) % 360;
        return prev + 360 * FULL_TURNS + delta + jitter;
      });

      // 3) Reveal the prize after the animation completes
      const delay = reducedMotion ? 100 : SPIN_DURATION_MS + 150;
      spinTimer.current = setTimeout(() => {
        setResult(spinResult);
        setSpinsRemaining(spinResult.spins_remaining);
        if (spinResult.tickets_remaining != null) setTicketsAvailable(spinResult.tickets_remaining);
        setSpinning(false);
      }, delay);
    } catch (err: unknown) {
      setSpinning(false);
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (status === 429) {
        if (isTicketType) setTicketsAvailable(0);
        else setSpinsRemaining(0);
        setLimitHit(true);
        return;
      }
      const msg = typeof detail === 'string' && detail.trim() ? detail : t('luckyDraw.spinFailed');
      showToast(msg, 'error');
    }
  };

  const spinDisabled = spinning || (isAuthenticated && avail === 0);

  return (
    <div style={{ minHeight: '100%', background: 'var(--loka-bg)' }}>
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('home')} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{campaign?.title || t('luckyDraw.title')}</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      {loading ? (
        <div className="skeleton home-skeleton-card" style={{ height: 360, margin: 16 }} />
      ) : !campaign || segments.length === 0 ? (
        <div className="home-empty" style={{ paddingTop: 80 }}>
          <div className="home-empty-icon"><Gift size={40} strokeWidth={1.5} /></div>
          <p className="home-empty-text">{t('luckyDraw.noCampaign')}</p>
        </div>
      ) : (
        <div style={{ padding: '8px 16px 120px', textAlign: 'center' }}>
          {campaign.description && (
            <p style={{ fontSize: 13, color: 'var(--loka-text-muted)', margin: '4px 0 16px' }}>
              {campaign.description}
            </p>
          )}

          {/* Wheel */}
          <div style={{ position: 'relative', width: WHEEL_SIZE, margin: '12px auto 20px' }}>
            {/* Pointer */}
            <div style={{
              position: 'absolute',
              top: -6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '14px solid transparent',
              borderRight: '14px solid transparent',
              borderTop: `22px solid ${LOKA.brown}`,
              zIndex: 2,
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
            }} />
            <div style={{
              width: WHEEL_SIZE,
              height: WHEEL_SIZE,
              borderRadius: '50%',
              border: `6px solid ${LOKA.brown}`,
              boxShadow: LOKA.shadowLg,
              transform: `rotate(${rotation}deg)`,
              transition: reducedMotion ? 'none' : `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.8, 0.08, 1)`,
              willChange: 'transform',
            }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
                {segments.map((seg, i) => {
                  const start = i * segAngle;
                  const end = start + segAngle;
                  const mid = start + segAngle / 2;
                  const labelPos = polar(mid, RADIUS * 0.62);
                  return (
                    <g key={seg.id}>
                      <path d={segmentPath(start, end)} fill={seg.color_hex || LOKA.copper} stroke={LOKA.cream} strokeWidth={1.5} />
                      <text
                        x={labelPos.x}
                        y={labelPos.y}
                        fill="#fff"
                        fontSize={11}
                        fontWeight={700}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid}, ${labelPos.x}, ${labelPos.y})`}
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                      >
                        {truncateLabel(seg.label)}
                      </text>
                    </g>
                  );
                })}
                {/* Hub */}
                <circle cx={CENTER} cy={CENTER} r={22} fill={LOKA.brown} stroke={LOKA.gold} strokeWidth={3} />
              </svg>
            </div>
          </div>

          {/* Spend-to-earn explainer (ticket campaigns, everyone sees it) */}
          {isTicketType && (
            <div style={{ fontSize: 12, color: 'var(--loka-text-muted)', marginBottom: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--loka-card, #fff)', border: '1px solid var(--loka-border, #eee)' }}>
              🎟️ {t('luckyDraw.spendToEarn', { amount: ((campaign?.spend_per_ticket_cents ?? 5000) / 100).toFixed(0) })}
            </div>
          )}

          {/* Spins / tickets remaining */}
          {isAuthenticated && !isTicketType && spinsRemaining !== null && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--loka-text-muted)', marginBottom: 12 }}>
              {t('luckyDraw.spinsLeft', { count: spinsRemaining })}
            </div>
          )}
          {isAuthenticated && isTicketType && ticketsAvailable !== null && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--loka-text-muted)', marginBottom: 12 }}>
              {t('luckyDraw.ticketsLeft', { count: ticketsAvailable })}
            </div>
          )}

          {isAuthenticated && !isTicketType && (limitHit || spinsRemaining === 0) && (
            <div style={{
              padding: 12,
              borderRadius: 12,
              background: LOKA.warningLight,
              color: LOKA.brown,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 12,
            }}>
              {(campaign?.spin_interval_days ?? 1) > 1 ? t('luckyDraw.comeBackLater') : t('luckyDraw.comeBackTomorrow')}
            </div>
          )}

          {isAuthenticated && isTicketType && (limitHit || ticketsAvailable === 0) && (
            <div style={{
              padding: 12,
              borderRadius: 12,
              background: LOKA.warningLight,
              color: LOKA.brown,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 12,
            }}>
              {t('luckyDraw.earnBySpending')}
            </div>
          )}

          {/* Spin button */}
          <button
            onClick={handleSpin}
            disabled={spinDisabled}
            style={{
              width: '100%',
              padding: '16px 24px',
              borderRadius: 16,
              background: `linear-gradient(135deg, ${LOKA.gold}, ${LOKA.copper})`,
              color: '#fff',
              border: 'none',
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 1,
              cursor: spinDisabled ? 'not-allowed' : 'pointer',
              opacity: spinDisabled ? 0.6 : 1,
              boxShadow: '0 4px 16px rgba(196,137,58,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Gift size={20} />
            {!isAuthenticated
              ? t('luckyDraw.signInToSpin')
              : spinning
                ? t('luckyDraw.spinning')
                : t('luckyDraw.spin')}
          </button>
        </div>
      )}

      {/* Result modal */}
      <AnimatePresence>
        {result && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setResult(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(26, 35, 9, 0.55)',
                zIndex: 1000,
              }}
            />
            <div style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              pointerEvents: 'none',
            }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
              style={{
                width: 'calc(100% - 48px)',
                maxWidth: 340,
                background: LOKA.surface,
                borderRadius: 20,
                padding: 24,
                textAlign: 'center',
                boxShadow: LOKA.shadowXl,
                pointerEvents: 'auto',
              }}
            >
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                background: `linear-gradient(135deg, ${LOKA.gold}, ${LOKA.copper})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Ticket size={28} color="#fff" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: LOKA.primary, margin: '0 0 4px' }}>
                {t('luckyDraw.youWon')}
              </h2>
              <div style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 12 }}>
                {result.voucher_title}
              </div>
              <div style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: `1.5px dashed ${LOKA.copper}`,
                background: LOKA.copperSoft,
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--loka-text-muted)' }}>
                  {t('luckyDraw.voucherCode')}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1.5, color: LOKA.brown }}>
                  {result.voucher_code}
                </div>
              </div>
              <button
                onClick={() => {
                  setResult(null);
                  setPage('my-rewards', { initialTab: 'vouchers' });
                }}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${LOKA.primary}, ${LOKA.primaryLight})`,
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: 8,
                }}
              >
                {t('luckyDraw.viewInWallet')}
              </button>
              <button
                onClick={() => setResult(null)}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: 14,
                  background: 'transparent',
                  color: 'var(--loka-text-muted)',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
