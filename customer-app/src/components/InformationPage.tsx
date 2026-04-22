'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Info, ArrowLeft } from 'lucide-react';
import { TypePill } from '@/components/shared';
import api, { cacheBust } from '@/lib/api';
import type { InformationCard as ApiInformationCard } from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

type InformationCard = ApiInformationCard;

interface InformationPageProps {
  onBack: () => void;
  preselectedId?: number;
}

function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return cacheBust(url.startsWith('http') ? url : `https://admin.loyaltysystem.uk${url}`);
}

export default function InformationPage({ onBack, preselectedId }: InformationPageProps) {
  const [cards, setCards] = useState<InformationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<InformationCard | null>(null);
  const preselectedConsumed = useRef(false);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/content/information?limit=20&content_type=information');
      const data = Array.isArray(res.data) ? res.data : [];
      setCards(data);
      return data;
    } catch { setCards([]); return []; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const init = async () => {
      const data = await loadCards();
      if (preselectedId && !preselectedConsumed.current && data.length > 0) {
        const found = data.find((c: InformationCard) => c.id === preselectedId);
        if (found) { setSelectedCard(found); preselectedConsumed.current = true; }
      }
    };
    init();
  }, [loadCards, preselectedId]);

  if (selectedCard) {
    const img = resolveUrl(selectedCard.image_url);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.white }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: img ? `url(${img}) center/cover` : `linear-gradient(135deg, ${LOKA.cream}, rgba(209,142,56,0.3))` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.25) 0%, transparent 50%)' }} />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setSelectedCard(null)}
            style={{ position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 12px rgba(0,0,0,0.06)', zIndex: 5 }}
          >
            <ArrowLeft size={20} color={LOKA.primary} />
          </motion.button>
          {selectedCard.content_type && (
            <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 2 }}>
              <TypePill variant="system">{selectedCard.content_type}</TypePill>
            </div>
          )}
        </div>

        <div className="scroll-container" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px 18px 32px' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {selectedCard.title}
            </h1>

            {selectedCard.content_type && (
              <div style={{ marginBottom: 16 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: LOKA.copper, background: LOKA.copperSoft, padding: '5px 14px', borderRadius: 30 }}>
                  <Info size={12} /> {selectedCard.content_type}
                </span>
              </div>
            )}

            <div style={{ width: 40, height: 3, borderRadius: 2, background: LOKA.borderSubtle, marginBottom: 20 }} />

            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>Details</h4>
              <p style={{ fontSize: 15, color: LOKA.textSecondary, lineHeight: 1.7 }}>
                {selectedCard.long_description || selectedCard.short_description || 'No content available.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <div style={{ padding: '20px 18px 12px', background: LOKA.white, borderBottom: `1px solid ${LOKA.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', color: LOKA.primary }}>
            <ArrowLeft size={22} />
          </motion.button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: LOKA.textPrimary, letterSpacing: '-0.02em' }}>Information</h1>
        </div>
      </div>

      <div className="scroll-container" style={{ flex: 1, padding: '14px 16px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (<div key={i} className="skeleton" style={{ height: 88, borderRadius: 18 }} />))}
          </div>
        ) : cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: LOKA.white, borderRadius: 20, border: `1px solid ${LOKA.borderSubtle}` }}>
            <Info size={40} color={LOKA.borderSubtle} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 6 }}>No articles available</p>
            <p style={{ fontSize: 13, color: LOKA.textMuted }}>Check back soon for updates</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cards.map((card) => {
              const img = resolveUrl(card.image_url);
              return (
                <motion.button
                  key={card.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedCard(card)}
                  style={{
                    display: 'flex', background: LOKA.white, borderRadius: 18,
                    border: `1px solid ${LOKA.borderSubtle}`, overflow: 'hidden',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    style={{
                      width: 88, height: 88, flexShrink: 0,
                      background: img ? `url(${img}) center/cover` : `linear-gradient(135deg, ${LOKA.cream}, rgba(209,142,56,0.2))`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {!img && <Info size={24} color={LOKA.brown} strokeWidth={1.5} />}
                  </div>
                  <div style={{ flex: 1, padding: '10px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {card.content_type && (
                      <div style={{ marginBottom: 3 }}>
                        <TypePill variant="system">{card.content_type}</TypePill>
                      </div>
                    )}
                    <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {card.title}
                    </p>
                    {card.short_description && (
                      <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.short_description}
                      </p>
                    )}
                    <span style={{ marginTop: 4, fontSize: 12, color: LOKA.copper, fontWeight: 600 }}>Read more →</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
