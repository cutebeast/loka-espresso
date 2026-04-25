'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ChevronRight, Info, Clock, Star } from 'lucide-react';
import api from '@/lib/api';
import type { InformationCard as ApiInformationCard } from '@/lib/api';

type InformationCard = ApiInformationCard;

interface InformationPageProps {
  onBack: () => void;
  preselectedId?: number;
  preselectedSlug?: string;
}

import { resolveAssetUrl } from '@/lib/tokens';

function resolveCardImage(card: InformationCard): string | null {
  return resolveAssetUrl(card.image_url) || resolveAssetUrl(card.icon) || null;
}

function estimateReadTime(text: string | null | undefined): string {
  if (!text) return '1 min read';
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins} min read`;
}

export default function InformationPage({ onBack, preselectedId, preselectedSlug }: InformationPageProps) {
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

  useEffect(() => {
    if (!preselectedSlug || preselectedConsumed.current) return;
    const fetchBySlug = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/content/information/${encodeURIComponent(preselectedSlug)}`);
        if (res.data) {
          setSelectedCard(res.data);
          preselectedConsumed.current = true;
        }
      } catch {
        await loadCards();
      } finally {
        setLoading(false);
      }
    };
    fetchBySlug();
  }, [preselectedSlug, loadCards]);

  /* ── Detail view ── */
  if (selectedCard) {
    const img = resolveCardImage(selectedCard);
    const gallery = (selectedCard.gallery_urls || []).map(resolveAssetUrl).filter(Boolean) as string[];
    const allImages = img ? [img, ...gallery] : gallery;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
        <div className="info-detail-hero">
          {allImages.length > 1 ? (
            <ImageCarousel images={allImages} />
          ) : (
            <div className="info-detail-hero-img" style={img ? { backgroundImage: `url(${img})` } : { background: 'linear-gradient(135deg, #F3EEE5, rgba(209,142,56,0.3))' }} />
          )}
          <div className="info-detail-hero-overlay" />
          <button className="info-detail-back-btn" onClick={() => setSelectedCard(null)} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <span className="info-detail-tag">
            <Info size={14} />
            {selectedCard.content_type || 'Article'}
          </span>
        </div>

        <div className="info-detail-content">
          <h1 className="info-detail-title">{selectedCard.title}</h1>

          <div className="info-detail-meta">
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Clock size={16} /> {estimateReadTime(selectedCard.long_description)}
            </span>
            {selectedCard.content_type && (
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Star size={16} /> {selectedCard.content_type}
              </span>
            )}
          </div>

          <p className="info-detail-desc">
            {selectedCard.long_description || selectedCard.short_description || 'No content available.'}
          </p>
        </div>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="info-screen">
      <div className="info-header">
        <button className="info-back-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="info-page-title">Experiences</h1>
      </div>

      <div className="info-card-list">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 120, borderRadius: 20 }} />
            ))}
          </>
        ) : cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 20, border: '1px solid var(--loka-border-light)' }}>
            <Info size={40} color="#D4DCE5" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1B2023', marginBottom: 6 }}>No articles available</p>
            <p style={{ fontSize: 13, color: '#6A7A8A' }}>Check back soon for updates</p>
          </div>
        ) : (
          cards.map((card) => {
            const img = resolveCardImage(card);
            return (
              <div key={card.id} className="info-exp-card" onClick={() => setSelectedCard(card)}>
                <div
                  className="info-card-thumb"
                  style={img ? { backgroundImage: `url(${img})` } : {}}
                >
                  {!img && <Info size={24} color="#C4CED8" strokeWidth={1.5} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />}
                  <span className="info-thumb-badge">{card.content_type || 'Article'}</span>
                </div>
                <div className="info-card-body">
                  <div className="info-card-title">{card.title}</div>
                  {card.short_description && (
                    <div className="info-card-desc">{card.short_description}</div>
                  )}
                </div>
                <div className="info-card-arrow">
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Inline Image Carousel for article gallery ── */
function ImageCarousel({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);
  const total = images.length;
  const touchStartX = useRef(0);
  const isDragging = useRef(false);

  const next = () => setCurrent((c) => (c + 1) % total);
  const prev = () => setCurrent((c) => (c - 1 + total) % total);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = true;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 40) next();
    else if (diff < -40) prev();
  };

  /* Mouse drag for desktop */
  const onMouseDown = (e: React.MouseEvent) => {
    touchStartX.current = e.clientX;
    isDragging.current = true;
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = touchStartX.current - e.clientX;
    if (diff > 40) next();
    else if (diff < -40) prev();
  };

  return (
    <div
      className="carousel-wrap"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      <div
        className="carousel-track"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {images.map((src, i) => (
          <div key={i} className="carousel-slide">
            <img
              src={src}
              alt=""
              className="carousel-img"
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Dots */}
      {total > 1 && (
        <div className="carousel-dots">
          {images.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot ${i === current ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Arrow buttons */}
      {total > 1 && (
        <>
          <button className="carousel-arrow carousel-arrow-left" onClick={prev} aria-label="Previous">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button className="carousel-arrow carousel-arrow-right" onClick={next} aria-label="Next">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </>
      )}
    </div>
  );
}
