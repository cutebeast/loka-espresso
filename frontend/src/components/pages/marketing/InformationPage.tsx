'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
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
  action_url: string;
  action_type: string;
  action_label: string;
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
  content_type: 'information',
  action_url: '',
  action_type: '',
  action_label: '',
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
  { value: 'information', label: 'Information' },
  { value: 'product',     label: 'Product' },
  { value: 'promotion',   label: 'Promotion' },
  { value: 'system',      label: 'System' },
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
      content_type: card.content_type || 'information',
      action_url: (card as any).action_url || '',
      action_type: (card as any).action_type || '',
      action_label: (card as any).action_label || '',
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
      content_type: form.content_type || 'information',
      action_url: form.action_url || null,
      action_type: form.action_type || null,
      action_label: form.action_label || null,
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
            <div className="ip-0">
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="ip-1">
              <div>
                <label className="iform-label">Title *</label>
                <input type="text" required value={form.title} onChange={(e) => {
                  const val = e.target.value;
                  setField('title', val);
                  if (!editingId && !form.slug) {
                    setField('slug', slugify(val));
                  }
                }} />
              </div>
              <div>
                <label className="iform-label">Icon</label>
                <select value={form.icon} onChange={(e) => setField('icon', e.target.value)} className="ip-2">
                  {iconOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ip-3">
              <label className="iform-label">
                Slug <span className="ip-4">(QR code URL — leave blank to auto-generate)</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                placeholder="e.g. baklava-art"
              />
              {form.slug && (
                <div className="ip-5">
                  QR URL: https://app.loyaltysystem.uk/?slug={form.slug}#information
                </div>
              )}
            </div>

            <div className="ip-6">
              <label className="iform-label">Short Description <span className="ip-7">(card preview)</span></label>
              <input type="text" value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} placeholder="Brief text shown on PWA card" />
            </div>

            <div className="ip-8">
              <label className="iform-label">Long Description <span className="ip-9">(detail view)</span></label>
              <textarea
                value={form.long_description}
                onChange={(e) => setField('long_description', e.target.value)}
                placeholder="Full content shown when customer taps to view details..."
                rows={4}
                className="ip-10"
              />
            </div>

            <div className="ip-11">
              <ImageUploadField 
                label="Card Image" 
                imageUrl={form.image_url} 
                token={token} 
                onSet={(url) => setField('image_url', url)} 
                hint="Cover image shown on PWA card and article header."
              />
            </div>

            <div className="ip-12">
              <GalleryUploadField
                label="Gallery Images"
                urls={form.gallery_urls}
                token={token}
                onSet={(urls) => setField('gallery_urls', urls)}
                hint="Additional images shown as a swipeable gallery inside the article."
              />
            </div>

            <div className="ip-13">
              <label className="iform-label">Content Type</label>
              <select value={form.content_type} onChange={(e) => setField('content_type', e.target.value)} className="ip-14">
                {contentTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {form.content_type === 'promotion' && (
              <div className="ip-15">
                <label className="ip-16">Promotion CTA (optional)</label>
                <div className="ip-17">
                  <div>
                    <label className="ip-18">Action URL</label>
                    <input type="text" value={form.action_url} onChange={(e) => setField('action_url', e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="ip-19">Button Label</label>
                    <input type="text" value={form.action_label} onChange={(e) => setField('action_label', e.target.value)} placeholder="Learn More" />
                  </div>
                </div>
              </div>
            )}

            <div className="ip-20">
              <div>
                <label className="iform-label">Start Date <span className="ip-21">(blank = always)</span></label>
                <input type="datetime-local" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
              </div>
              <div>
                <label className="iform-label">End Date <span className="ip-22">(blank = unlimited)</span></label>
                <input type="datetime-local" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
              </div>
            </div>

            <div className="ip-23">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={closeForm}>
                Cancel
              </button>
              <div className="ip-24" />
              <label className="ip-25">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} className="ip-26" />
                Active
              </label>
            </div>
          </form>
        </div>
      </Drawer>

      <div className="ip-27">
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus"></i> New Information Card
        </button>
      </div>

      {error && (
        <div className="ip-28">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <div className="ip-29">
        <div className="ip-30">
          <span className="ip-31"><i className="fas fa-info-circle"></i></span>
          Showing <strong className="ip-32">{cards.length}</strong> of <strong>{total}</strong> cards
        </div>
        <div className="ip-33">
          Page {page} of {totalPages}
        </div>
      </div>

      <div className="ip-34">
        <table>
          <thead>
            <tr><th>Image</th><th>Title</th><th>Type</th><th>Slug / QR</th><th>Short Desc</th><th>Status</th><th>Period</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr><td colSpan={8} className="ip-35">
                <span className="ip-36"><i className="fas fa-info-circle"></i></span>
                No information cards yet
              </td></tr>
            ) : cards.map(card => (
              <tr key={card.id}>
                <td>
                  {card.image_url ? (
                    <Image src={cacheBust(card.image_url)} alt="" width={60} height={40} className="ip-37" />
                  ) : (
                    <div className="ip-38">
                      <i className={`fas fa-${card.icon || 'info'}`}></i>
                    </div>
                  )}
                </td>
                <td className="ip-39">{card.title}</td>
                <td>
                  <span className={`badge ${
                    card.content_type === 'promotion' ? 'badge-copper' :
                    card.content_type === 'system' ? 'badge-gray' :
                    card.content_type === 'product' ? 'badge-green' :
                    'badge-blue'
                  } ip-40`} >
                    {card.content_type || 'information'}
                  </span>
                </td>
                <td className="ip-41">
                  {card.slug ? (
                    <span title={`QR: https://app.loyaltysystem.uk/?slug=${card.slug}#information`}>{card.slug}</span>
                  ) : '-'}
                </td>
                <td className="ip-42">{card.short_description || '-'}</td>
                <td>
                  <button className="btn btn-sm ip-43" onClick={() => handleToggleActive(card)} >
                    <span className={`badge ${card.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {card.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td className="ip-44">
                  {(card.start_date || card.end_date) ? (
                    <>
                      {card.start_date ? new Date(card.start_date).toLocaleDateString() : '—'} → {card.end_date ? new Date(card.end_date).toLocaleDateString() : '—'}
                    </>
                  ) : '—'}
                </td>
                <td>
                  <div className="ip-45">
                    <button className="btn btn-sm" onClick={() => openEdit(card)}><i className="fas fa-edit"></i></button>
                    {deletingId === card.id ? (
                      <>
                        <button className="btn btn-sm ip-46"  onClick={() => handleDelete(card.id)}>Confirm</button>
                        <button className="btn btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm ip-47"  onClick={() => setDeletingId(card.id)}>
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
      <label className="iform-label">{label}</label>
      <div className="iuf-48">
        <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} className="iuf-49" />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {imageUrl && (
          <>
            <Image src={imageUrl} alt="" width={60} height={40} className="iuf-50" />
            <button type="button" className="btn btn-sm iuf-51" onClick={() => onSet('')} ><i className="fas fa-times"></i></button>
          </>
        )}
      </div>
      {hint && <div className="iuf-52"><span className="iuf-53"><i className="fas fa-info-circle"></i></span>{hint}</div>}
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
      <label className="iform-label">{label}</label>
      <div className="guf-54">
        <input type="file" ref={fileRef} accept="image/*" multiple onChange={handleUpload} className="guf-55" />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Add Images'}
        </button>
        {urls.map((url, i) => (
          <div key={i} className="guf-56">
            <Image src={url} alt="" width={60} height={40} className="guf-57" />
            <button
              type="button"
              onClick={() => removeUrl(i)}
              className="guf-remove-btn"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {hint && <div className="guf-58"><span className="guf-59"><i className="fas fa-info-circle"></i></span>{hint}</div>}
    </div>
  );
}


