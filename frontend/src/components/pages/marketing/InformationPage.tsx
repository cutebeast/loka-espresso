'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
import { DataTable, Drawer, type ColumnDef } from '@/components/ui';
import { APP_DOMAIN } from '@/lib/config';

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
        setCards(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch { console.error('Failed to fetch cards'); } finally { setLoading(false); }
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

  const handleSubmit = async () => {
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

  const columns: ColumnDef<InfoCard>[] = [
    {
      key: 'image',
      header: 'Image',
      width: '80px',
      render: (row) => (
        row.image_url ? (
          <Image src={cacheBust(row.image_url)} alt="" width={60} height={40} style={{ borderRadius: 4, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 60, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', borderRadius: 4 }}>
            <i className={`fas fa-${row.icon || 'info'}`}></i>
          </div>
        )
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <div>
          <strong>{row.title}</strong>
          {(row.start_date || row.end_date) && (
            <div style={{ fontSize: '0.8em', color: '#666', marginTop: 2 }}>
              {row.start_date ? new Date(row.start_date).toLocaleDateString() : '—'} → {row.end_date ? new Date(row.end_date).toLocaleDateString() : '—'}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
          {row.slug || '-'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span style={{ display: 'block', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.short_description
            ? (row.short_description.length > 80 ? row.short_description.slice(0, 80) + '...' : row.short_description)
            : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '240px',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => handleToggleActive(row)}>
            <span className={`badge ${row.is_active ? 'badge-green' : 'badge-gray'}`}>
              {row.is_active ? 'Active' : 'Inactive'}
            </span>
          </button>
          <button className="btn btn-sm" onClick={() => openEdit(row)}><i className="fas fa-edit"></i></button>
          {deletingId === row.id ? (
            <>
              <button className="btn btn-sm" onClick={() => handleDelete(row.id)} style={{ background: '#dc3545', color: '#fff' }}>Confirm</button>
              <button className="btn btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setDeletingId(row.id)} style={{ color: '#dc3545' }}>
              <i className="fas fa-trash"></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  const drawerTitle = editingId ? 'Edit Information Card' : 'New Information Card';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} >
        <div className="card">
          {error && (
            <div className="inf-0">
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <div>
            <div className="inf-1">
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
                <select value={form.icon} onChange={(e) => setField('icon', e.target.value)} className="inf-2">
                  {iconOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="inf-3">
              <label className="iform-label">
                Slug <span className="inf-4">(QR code URL — leave blank to auto-generate)</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                placeholder="e.g. baklava-art"
              />
              {form.slug && (
                <div className="inf-5">
                  QR URL: https://{APP_DOMAIN}/?slug={form.slug}#information
                </div>
              )}
            </div>

            <div className="inf-6">
              <label className="iform-label">Short Description <span className="inf-7">(card preview)</span></label>
              <input type="text" value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} placeholder="Brief text shown on PWA card" />
            </div>

            <div className="inf-8">
              <label className="iform-label">Long Description <span className="inf-9">(detail view)</span></label>
              <textarea
                value={form.long_description}
                onChange={(e) => setField('long_description', e.target.value)}
                placeholder="Full content shown when customer taps to view details..."
                rows={4}
                className="inf-10"
              />
            </div>

            <div className="inf-11">
              <ImageUploadField 
                label="Card Image" 
                imageUrl={form.image_url} 
                token={token} 
                onSet={(url) => setField('image_url', url)} 
                hint="Cover image shown on PWA card and article header."
              />
            </div>

            <div className="inf-12">
              <GalleryUploadField
                label="Gallery Images"
                urls={form.gallery_urls}
                token={token}
                onSet={(urls) => setField('gallery_urls', urls)}
                hint="Additional images shown as a swipeable gallery inside the article."
              />
            </div>

            <div className="inf-13">
              <label className="iform-label">Content Type</label>
              <select value={form.content_type} onChange={(e) => setField('content_type', e.target.value)} className="inf-14">
                {contentTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {form.content_type === 'promotion' && (
              <div className="inf-15">
                <label className="inf-16">Promotion CTA (optional)</label>
                <div className="inf-17">
                  <div>
                    <label className="inf-18">Action URL</label>
                    <input type="text" value={form.action_url} onChange={(e) => setField('action_url', e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="inf-19">Button Label</label>
                    <input type="text" value={form.action_label} onChange={(e) => setField('action_label', e.target.value)} placeholder="Learn More" />
                  </div>
                </div>
              </div>
            )}

            <div className="inf-20">
              <div>
                <label className="iform-label">Start Date <span className="inf-21">(blank = always)</span></label>
                <input type="datetime-local" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
              </div>
              <div>
                <label className="iform-label">End Date <span className="inf-22">(blank = unlimited)</span></label>
                <input type="datetime-local" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
              </div>
            </div>

            <div className="df-actions">
              <label className="inf-25" style={{ marginRight: 'auto' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} className="inf-26" />
                Active
              </label>
              <button className="btn" onClick={closeForm}>
                Cancel
              </button>
              <button onClick={handleSubmit} className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </Drawer>

      <div className="inf-27">
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus"></i> New Information Card
        </button>
      </div>

      {error && (
        <div className="inf-28">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <DataTable<InfoCard>
        data={cards}
        columns={columns}
        emptyMessage="No information cards yet"
        loading={loading}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: fetchCards,
        }}
      />
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
    } catch { console.error('Image upload failed'); } finally { setUploading(false); }
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
    } catch { console.error('Image upload failed'); } finally { setUploading(false); }
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


