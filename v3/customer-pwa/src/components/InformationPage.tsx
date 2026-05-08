'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ChevronRight, ChevronLeft, Info, Clock, Star, Share2, X } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { InformationCard as ApiInformationCard } from '@/lib/api';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

type InformationCard = ApiInformationCard;

const CONTENT_TYPES = [
  { id: 'information', label: 'Experiences' },
  { id: 'product', label: 'Products' },
];

interface InformationPageProps {
  onBack: () => void;
  preselectedId?: number;
  preselectedSlug?: string;
  contentType?: string;
}

function resolveCardImage(card: InformationCard): string | null {
  return resolveAssetUrl(card.image_url) || resolveAssetUrl(card.icon) || null;
}

function estimateReadTime(text: string | null | undefined): string {
  if (!text) return '1 min read';
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins} min read`;
}

function tagLabel(contentType?: string | null): string {
  if (!contentType) return 'Article';
  return contentType === 'product' ? 'Product' : 'Experience';
}

export default function InformationPage({ onBack, preselectedId, preselectedSlug, contentType }: InformationPageProps) {
  const { t } = useTranslation();
  const { showToast } = useUIStore();
  const [cards, setCards] = useState<InformationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(contentType || 'information');
  const [selectedCard, setSelectedCard] = useState<InformationCard | null>(null);
  const preselectedConsumed = useRef(false);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  const pageLabel = CONTENT_TYPES.find(t => t.id === activeTab)?.label || 'Articles';

  const loadCards = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/content/information?limit=20&content_type=${type}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setCards(data);
      return data;
    } catch { setCards([]); return []; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const init = async () => {
      const data = await loadCards(contentType || 'information');
      if (preselectedId && !preselectedConsumed.current && data.length > 0) {
        const found = data.find((c: InformationCard) => c.id === preselectedId);
        if (found) { setSelectedCard(found); preselectedConsumed.current = true; }
      }
    };
    init();
  }, [loadCards, preselectedId, contentType]);

  const fetchBySlug = useCallback(async (slug: string, type: string) => {
    if (preselectedConsumed.current) return;
    setLoading(true);
    try {
      const res = await api.get(`/content/information/${encodeURIComponent(slug)}`);
      if (res.data) {
        setSelectedCard(res.data);
        preselectedConsumed.current = true;
      }
    } catch {
      await loadCards(type);
    } finally {
      setLoading(false);
    }
  }, [loadCards]);

  useEffect(() => {
    if (preselectedSlug) fetchBySlug(preselectedSlug, contentType || 'information');
  }, [preselectedSlug, contentType, fetchBySlug]);

  const handleTabChange = async (type: string) => {
    setActiveTab(type);
    await loadCards(type);
  };

  /* ── Detail view ── */
  if (selectedCard) {
    const img = resolveCardImage(selectedCard);
    const gallery = (selectedCard.gallery_urls || []).map(resolveAssetUrl).filter(Boolean) as string[];
    const allImages = img ? [img, ...gallery] : gallery;
    const tag = tagLabel(selectedCard.content_type);

    const handleShare = async () => {
      const shareData: ShareData = {
        title: selectedCard.title,
        text: selectedCard.short_description || '',
        url: `${window.location.origin}${window.location.pathname}?selectedInfoId=${selectedCard.id}&selectedInfoContentType=${selectedCard.content_type || 'information'}#information`,
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(shareData.url || '');
          showToast(t('toast.linkCopied'), 'success');
        }
      } catch { /* user cancelled or not supported */ }
    };

    return (
      <div className="info-detail-screen">
        <div className="info-detail-hero">
          {allImages.length > 1 ? (
            <ImageCarousel images={allImages} title={selectedCard.title} />
          ) : (
            <>
              {img && !brokenImages.has(selectedCard.id) ? (
                <img
                  src={img}
                  alt={selectedCard.title}
                  loading="lazy"
                  className="info-detail-hero-img"
                  onError={() => { setBrokenImages(prev => new Set(prev).add(selectedCard.id)); }}
                />
              ) : (
                <div className="info-detail-hero-img info-detail-hero-fallback">
                  <div className="info-detail-hero-fallback-icon">
                    <Info size={64} />
                  </div>
                </div>
              )}
            </>
          )}
          <div className="info-detail-hero-overlay" />
          <button className="info-detail-back-btn" onClick={() => setSelectedCard(null)} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <span className={`info-detail-tag ${selectedCard.content_type === 'product' ? 'product' : 'experience'}`}>
            <Info size={14} />
            {tag}
          </span>
        </div>

        <div className="info-detail-content">
          <h1 className="info-detail-title">{selectedCard.title}</h1>

          <div className="info-detail-meta">
            <span className="info-detail-meta-item">
              <Clock size={16} /> {estimateReadTime(selectedCard.long_description || (selectedCard.sections || []).map(s => s.body || '').join(' '))}
            </span>
            <span className="info-detail-meta-item">
              <Star size={16} /> {tag}
            </span>
          </div>

          {(selectedCard.sections || []).filter(s => s.visible !== false).length > 0 ? (
            <div className="info-detail-sections">
              {(selectedCard.sections || []).filter(s => s.visible !== false).map((section, i) => (
                <div key={i} className="info-detail-section">
                  {section.title && <h3 className="info-section-title">{section.title}</h3>}
                  {section.body && <p className="info-section-body">{section.body}</p>}
                  {section.list && section.list.length > 0 && (
                    <ul className="info-section-list">
                      {section.list.map((item, j) => <li key={j}>{item}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="info-detail-desc">
              {selectedCard.long_description || selectedCard.short_description || 'No content available.'}
            </p>
          )}
        </div>

        <div className="info-detail-footer">
          <button className="info-share-btn" onClick={handleShare}>
            <span>{t('common.share')}</span>
            <Share2 size={18} />
          </button>
        </div>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="info-screen">
      {/* Header */}
      <div className="info-header">
        <div className="info-header-left">
          <button className="info-back-btn" onClick={onBack} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="info-page-title">{pageLabel}</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="info-tab-bar">
        {CONTENT_TYPES.map(t => (
          <button
            key={t.id}
            className={`info-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Card list */}
      <div className="info-card-list">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton info-skeleton-card" />
            ))}
          </>
        ) : cards.length === 0 ? (
          <div className="info-empty">
            <Info size={40} className="info-empty-icon" />
            <p className="info-empty-title">
              {activeTab === 'product' ? 'No products available' : 'No articles available'}
            </p>
            <p className="info-empty-desc">{t('information.checkBackSoon')}</p>
          </div>
        ) : (
          cards.map((card) => {
            const img = resolveCardImage(card);
            const tag = tagLabel(card.content_type);
            const tagClass = card.content_type === 'product' ? 'product' : 'experience';
            return (
              <div key={card.id} className="info-card" onClick={() => setSelectedCard(card)}>
                <div className="info-card-thumb">
                  {img && !brokenImages.has(card.id) ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      onError={() => { setBrokenImages(prev => new Set(prev).add(card.id)); }}
                    />
                  ) : (
                    <div className="info-card-thumb-fallback">
                      <Info size={24} strokeWidth={1.5} color={LOKA.border} />
                    </div>
                  )}
                </div>
                <div className="info-card-body">
                  <div className="info-card-title">{card.title}</div>
                  {card.short_description && (
                    <div className="info-card-desc">{card.short_description}</div>
                  )}
                  <div className={`info-card-tag ${tagClass}`}>{tag}</div>
                </div>
                <div className="info-card-arrow">
                  <ChevronRight color="#8A8078" size={16} />
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
function ImageCarousel({ images, title }: { images: string[]; title?: string }) {
  const [current, setCurrent] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const total = images.length;
  const touchStartX = useRef(0);
  const isDragging = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(-${current * 100}%)`;
    }
  }, [current]);

  return (
    <>
      <div
        className="info-carousel-wrap"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        <div ref={trackRef} className="info-carousel-track">
          {images.map((src, i) => (
            <div key={i} className="info-carousel-slide" onClick={() => setLightbox(true)}>
              <img
                src={src}
                alt={title ? `${title} — image ${i + 1}` : `Image ${i + 1}`}
                className="info-carousel-img"
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* Dots */}
        {total > 1 && (
          <div className="info-carousel-dots">
            {images.map((_, i) => (
              <button
                key={i}
                className={`info-carousel-dot ${i === current ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Arrow buttons */}
        {total > 1 && (
          <>
            <button className="info-carousel-arrow info-carousel-arrow-left" onClick={prev} aria-label="Previous">
              <ChevronLeft color="#8A8078" size={14} strokeWidth={3} />
            </button>
            <button className="info-carousel-arrow info-carousel-arrow-right" onClick={next} aria-label="Next">
              <ChevronRight color="#8A8078" size={14} strokeWidth={3} />
            </button>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="info-lightbox-overlay" onClick={() => setLightbox(false)}>
          <img
            src={images[current]}
            alt={title ? `${title} — full view` : 'Full view'}
            className="info-lightbox-img"
          />
          <button
            className="info-lightbox-close"
            onClick={() => setLightbox(false)}
            aria-label="Close lightbox"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
