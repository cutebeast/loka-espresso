'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Pagination, Drawer } from '@/components/ui';

interface InformationPageProps {
  token: string;
}

interface InfoCard {
  id: number;
  title: string;
  slug: string | null;
  short_description: string | null;
  long_description: string | null;
  icon: string | null;
  image_url: string | null;
  gallery_urls: string[] | null;
  content_type: string | null;
  is_active: boolean;
  position: number;
  start_date: string | null;
  end_date: string | null;
}

interface InfoCardForm {
  title: string;
  slug: string;
  short_description: string;
  long_description: string;
  icon: string;
  image_url: string;
  gallery_urls: string[];
  content_type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  position: number;
}

const emptyForm: InfoCardForm = {
  title: '',
  slug: '',
  short_description: '',
  long_description: '',
  icon: 'info',
  image_url: '',
  gallery_urls: [],
  content_type: 'promotion',
  start_date: '',
  end_date: '',
  is_active: true,
  position: 0,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 255);
}

const iconOptions = [
  { value: 'info', label: 'Info' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'gift', label: 'Gift' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'bell', label: 'Bell' },
  { value: 'megaphone', label: 'Megaphone' },
];

const contentTypeOptions = [
  { value: 'promotion', label: 'Promotion' },
  { value: 'information', label: 'Information' },
  { value: 'pop_up', label: 'Pop-Up Banner' },
  { value: 'system', label: 'System' },
];

export default function InformationPage({ token }: InformationPageProps) {
  const [cards, setCards] = useState<InfoCard[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<InfoCardForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const PAGE_SIZE = 20;

  const fetchCards = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/content/cards?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCards(1); }, [fetchCards]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setDrawerOpen(true);
  };

  const openEdit = (card: InfoCard) => {
    setEditingId(card.id);
    setForm({
      title: card.title || '',
      slug: card.slug || '',
      short_description: card.short_description || '',
      long_description: card.long_description || '',
      icon: card.icon || 'info',
      image_url: card.image_url || '',
      gallery_urls: card.gallery_urls || [],
      content_type: card.content_type || 'promotion',
      start_date: card.start_date ? card.start_date.slice(0, 16) : '',
      end_date: card.end_date ? card.end_date.slice(0, 16) : '',
      is_active: card.is_active ?? true,
      position: card.position || 0,
    });
    setError('');
    setDrawerOpen(true);
  };

  const closeForm = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setError('');
    fetchCards(page);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload: any = {
      title: form.title,
      slug: form.slug || slugify(form.title),
      short_description: form.short_description || null,
      long_description: form.long_description || null,
      icon: form.icon || null,
      image_url: form.image_url || null,
      gallery_urls: form.gallery_urls.length > 0 ? form.gallery_urls : null,
      content_type: form.content_type || 'promotion',
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      position: form.position,
    };

    try {
      setSaving(true);
      let res: Response;
      if (editingId) {
        res = await apiFetch(`/admin/content/cards/${editingId}`, undefined, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch('/admin/content/cards', undefined, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save card');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setError('');
    try {
      await apiFetch(`/admin/content/cards/${id}`, undefined, { method: 'DELETE' });
      setDeletingId(null);
      fetchCards(page);
    } catch (err: any) {
      setError(err.message || 'Failed to delete card');
    }
  };

  const handleToggleActive = async (card: InfoCard) => {
    setError('');
    try {
      const res = await apiFetch(`/admin/content/cards/${card.id}`, undefined, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !card.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to toggle card');
        return;
      }
      fetchCards(page);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle card');
    }
  };

  const setField = (field: keyof InfoCardForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const drawerTitle = editingId ? 'Edit Information Card' : 'New Information Card';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} width={560}>
        <div className="card">
          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input type="text" required value={form.title} onChange={(e) => {
                  const val = e.target.value;
                  setField('title', val);
                  if (!editingId && !form.slug) {
                    setField('slug', slugify(val));
                  }
                }} />
              </div>
              <div>
                <label style={labelStyle}>Icon</label>
                <select value={form.icon} onChange={(e) => setField('icon', e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}` }}>
                  {iconOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>
                Slug <span style={{ color: THEME.success, fontWeight: 400 }}>(QR code URL — leave blank to auto-generate)</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                placeholder="e.g. baklava-art"
              />
              {form.slug && (
                <div style={{ fontSize: 12, color: THEME.success, marginTop: 4, fontFamily: 'monospace' }}>
                  QR URL: https://app.loyaltysystem.uk/?slug={form.slug}#information
                </div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Short Description <span style={{ color: THEME.success, fontWeight: 400 }}>(card preview)</span></label>
              <input type="text" value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} placeholder="Brief text shown on PWA card" />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Long Description <span style={{ color: THEME.success, fontWeight: 400 }}>(detail view)</span></label>
              <textarea
                value={form.long_description}
                onChange={(e) => setField('long_description', e.target.value)}
                placeholder="Full content shown when customer taps to view details..."
                rows={4}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <ImageUploadField 
                label="Card Image" 
                imageUrl={form.image_url} 
                token={token} 
                onSet={(url) => setField('image_url', url)} 
                hint="Cover image shown on PWA card and article header."
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <GalleryUploadField
                label="Gallery Images"
                urls={form.gallery_urls}
                token={token}
                onSet={(urls) => setField('gallery_urls', urls)}
                hint="Additional images shown as a swipeable gallery inside the article."
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Content Type</label>
              <select value={form.content_type} onChange={(e) => setField('content_type', e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 12, border: `1px solid ${THEME.accentLight}`, fontSize: 14 }}>
                {contentTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Start Date <span style={{ color: THEME.success, fontWeight: 400 }}>(blank = always)</span></label>
                <input type="datetime-local" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>End Date <span style={{ color: THEME.success, fontWeight: 400 }}>(blank = unlimited)</span></label>
                <input type="datetime-local" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={closeForm}>
                Cancel
              </button>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} style={{ width: 16, height: 16 }} />
                Active
              </label>
            </div>
          </form>
        </div>
      </Drawer>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus"></i> New Information Card
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-info-circle" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{cards.length}</strong> of <strong>{total}</strong> cards
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: `1px solid ${THEME.border}`, borderTop: 'none' }}>
        <table>
          <thead>
            <tr><th>Image</th><th>Title</th><th>Slug / QR</th><th>Short Desc</th><th>Status</th><th>Period</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: THEME.primaryLight, padding: 40 }}>
                <i className="fas fa-info-circle" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No information cards yet
              </td></tr>
            ) : cards.map(card => (
              <tr key={card.id}>
                <td>
                  {card.image_url ? (
                    <Image src={cacheBust(card.image_url)} alt="" width={60} height={40} style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: 60, height: 40, background: THEME.bgMuted, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.primary, fontSize: 18 }}>
                      <i className={`fas fa-${card.icon || 'info'}`}></i>
                    </div>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{card.title}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace', color: THEME.success }}>
                  {card.slug ? (
                    <span title={`QR: https://app.loyaltysystem.uk/?slug=${card.slug}#information`}>{card.slug}</span>
                  ) : '-'}
                </td>
                <td style={{ color: THEME.success, fontSize: 13 }}>{card.short_description || '-'}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleToggleActive(card)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <span className={`badge ${card.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {card.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td style={{ fontSize: 13, color: THEME.success }}>
                  {(card.start_date || card.end_date) ? (
                    <>
                      {card.start_date ? new Date(card.start_date).toLocaleDateString() : '—'} → {card.end_date ? new Date(card.end_date).toLocaleDateString() : '—'}
                    </>
                  ) : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(card)}><i className="fas fa-edit"></i></button>
                    {deletingId === card.id ? (
                      <>
                        <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(card.id)}>Confirm</button>
                        <button className="btn btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setDeletingId(card.id)}>
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchCards} loading={loading} />
    </div>
  );
}

function ImageUploadField({ label, imageUrl, token: _token, onSet, hint }: { label: string; imageUrl: string; token: string; onSet: (url: string) => void; hint?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload('/upload/information-image', fd);
      if (res.ok) {
        const data = await res.json();
        onSet(data.url);
      }
    } catch {} finally { setUploading(false); }
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {imageUrl && (
          <>
            <Image src={imageUrl} alt="" width={60} height={40} style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4 }} />
            <button type="button" className="btn btn-sm" onClick={() => onSet('')} style={{ color: '#EF4444' }}><i className="fas fa-times"></i></button>
          </>
        )}
      </div>
      {hint && <div style={{ fontSize: 11, color: THEME.success, marginTop: 3 }}><i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>{hint}</div>}
    </div>
  );
}

function GalleryUploadField({ label, urls, token: _token, onSet, hint }: { label: string; urls: string[]; token: string; onSet: (urls: string[]) => void; hint?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await apiUpload('/upload/information-image', fd);
        if (res.ok) {
          const data = await res.json();
          newUrls.push(data.url);
        }
      }
      onSet([...urls, ...newUrls]);
    } catch {} finally { setUploading(false); }
  }

  function removeUrl(index: number) {
    onSet(urls.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input type="file" ref={fileRef} accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Add Images'}
        </button>
        {urls.map((url, i) => (
          <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
            <Image src={url} alt="" width={60} height={40} style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4 }} />
            <button
              type="button"
              onClick={() => removeUrl(i)}
              style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 999, background: '#EF4444', color: 'white', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {hint && <div style={{ fontSize: 11, color: THEME.success, marginTop: 3 }}><i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>{hint}</div>}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primaryDark };
