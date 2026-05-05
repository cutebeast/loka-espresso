'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
import { DataTable, Drawer, type ColumnDef } from '@/components/ui';
import { APP_DOMAIN } from '@/lib/config';

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

interface Section {
  title: string;
  body: string;
  list: string[];
  visible?: boolean;
}

function emptySection(): Section {
  return { title: '', body: '', list: [], visible: true };
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
  sections: Section[];
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
  sections: [],
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
  { value: 'information',  label: 'Information' },
  { value: 'product',      label: 'Product' },
  { value: 'popup_banner', label: 'Popup Banner' },
  { value: 'system',       label: 'System' },
];

export default function InformationPage() {
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
  const [contentTypeFilter, setContentTypeFilter] = useState('');

  const PAGE_SIZE = 20;

  const fetchCards = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      if (contentTypeFilter) params.set('content_type', contentTypeFilter);
      const res = await apiFetch(`/admin/content/cards?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch { console.error('Failed to fetch cards'); } finally { setLoading(false); }
  }, [contentTypeFilter]);

  useEffect(() => { fetchCards(1); }, [fetchCards]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setDrawerOpen(true);
  };

  const parseSections = (raw: any): Section[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
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
      sections: parseSections((card as any).sections),
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
    if (form.content_type === 'system') {
      payload.sections = form.sections;
    }

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

  const addSection = () => {
    setForm((prev) => ({ ...prev, sections: [...prev.sections, emptySection()] }));
  };

  const removeSection = (index: number) => {
    setForm((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }));
  };

  const updateSection = (index: number, field: keyof Section, value: any) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  };

  const addListItem = (sectionIndex: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIndex ? { ...s, list: [...s.list, ''] } : s
      ),
    }));
  };

  const removeListItem = (sectionIndex: number, itemIndex: number) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIndex ? { ...s, list: s.list.filter((_, j) => j !== itemIndex) } : s
      ),
    }));
  };

  const updateListItem = (sectionIndex: number, itemIndex: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIndex ? { ...s, list: s.list.map((li, j) => (j === itemIndex ? value : li)) } : s
      ),
    }));
  };

  const columns: ColumnDef<InfoCard>[] = [
    {
      key: 'image',
      header: 'Image',
      width: '80px',
      render: (row) => (
        row.image_url ? (
          <img src={cacheBust(row.image_url)} alt="" style={{ width: 60, height: 40, borderRadius: 4, objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
          {row.short_description && (
            <div style={{ fontSize: '0.85em', color: '#666', marginTop: 2 }}>
              {row.short_description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'content_type',
      header: 'Type',
      width: '110px',
      render: (row) => (
        <span className={`badge ${row.content_type === 'product' ? 'badge-blue' : row.content_type === 'popup_banner' ? 'badge-yellow' : row.content_type === 'system' ? 'badge-gray' : 'badge-green'}`}>
          {row.content_type === 'product' ? 'Product' : row.content_type === 'popup_banner' ? 'Popup Banner' : row.content_type === 'system' ? 'System' : 'Info'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '200px',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => handleToggleActive(row)} title={row.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
            <i className={`fas ${row.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 20, color: row.is_active ? '#16A34A' : '#9CA3AF' }}></i>
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

            {form.content_type !== 'popup_banner' && (<>
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

            {form.content_type !== 'popup_banner' ? (
            <div className="inf-48">
              <label className="iform-label">Sections <span className="inf-50">(structured content)</span></label>
              {form.sections.map((section, si) => (
                <div key={si} className="inf-51">
                  <div className="inf-52">
                    <span className="inf-53">Section {si + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={section.visible !== false} onChange={(e) => updateSection(si, 'visible', e.target.checked)} style={{ accentColor: '#3B4A1A' }} />
                        <i className={`fas ${section.visible !== false ? 'fa-eye' : 'fa-eye-slash'}`} style={{ color: section.visible !== false ? '#16A34A' : '#9CA3AF' }}></i>
                      </label>
                      <button type="button" className="inf-54" onClick={() => removeSection(si)}>
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                  <div className="inf-55">
                    <input
                      type="text"
                      className="inf-56"
                      placeholder="Section title"
                      value={section.title}
                      onChange={(e) => updateSection(si, 'title', e.target.value)}
                    />
                  </div>
                  <div className="inf-55">
                    <textarea
                      className="inf-57"
                      placeholder="Section body"
                      rows={3}
                      value={section.body}
                      onChange={(e) => updateSection(si, 'body', e.target.value)}
                    />
                  </div>
                  <div className="inf-58">
                    <label className="inf-59">List Items</label>
                    {section.list.map((item, li) => (
                      <div key={li} className="inf-60">
                        <input
                          type="text"
                          className="inf-61"
                          placeholder={`List item ${li + 1}`}
                          value={item}
                          onChange={(e) => updateListItem(si, li, e.target.value)}
                        />
                        <button type="button" className="inf-62" onClick={() => removeListItem(si, li)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    ))}
                    <div className="inf-63">
                      <button type="button" className="inf-64" onClick={() => addListItem(si)}>
                        <i className="fas fa-plus"></i> Add list item
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="inf-65">
                <button type="button" className="inf-64" onClick={addSection}>
                  <i className="fas fa-plus"></i> Add section
                </button>
              </div>
            </div>
            ) : (
            <div className="inf-8">
              <label className="iform-label">Description <span className="inf-9">(popup overlay text)</span></label>
              <textarea
                value={form.long_description}
                onChange={(e) => setField('long_description', e.target.value)}
                placeholder="Text displayed as overlay on the popup banner..."
                rows={3}
                className="inf-10"
              />
            </div>
            )}

            <div className="inf-11">
              <ImageUploadField
                label="Cover — Image or Video"
                imageUrl={form.image_url}
                onSet={(url) => setField('image_url', url)}
                hint={form.content_type === 'popup_banner'
                  ? 'JPEG, PNG, MP4, WebM — Max 50MB. Portrait/vertical (9:16) for fullscreen mobile overlay.'
                  : 'JPEG, PNG, MP4, WebM — Max 25MB. Landscape/horizontal (16:9) for in-article display.'}
                folder={form.content_type}
                allowVideo={true}
                portrait={form.content_type === 'popup_banner'}
              />
            </div>

            {form.content_type !== 'popup_banner' && (
            <div className="inf-12">
              <GalleryUploadField
                label="Image Gallery"
                urls={form.gallery_urls}
                onSet={(urls) => setField('gallery_urls', urls)}
                hint="JPEG, PNG — additional images shown as swipeable gallery. Images only, no video."
                folder={form.content_type}
              />
            </div>
            )}

            <div className="inf-13">
              <label className="iform-label">Content Type</label>
              <select value={form.content_type} onChange={(e) => setField('content_type', e.target.value)} className="inf-14">
                {contentTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {form.content_type === 'popup_banner' && (
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
            </>)}

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
        <select
          value={contentTypeFilter}
          onChange={e => setContentTypeFilter(e.target.value)}
          className="inf-14"
          style={{ maxWidth: 160 }}
        >
          <option value="">All Types</option>
          <option value="information">Information</option>
          <option value="product">Product</option>
          <option value="popup_banner">Popup Banner</option>
          <option value="system">System</option>
        </select>
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

function ImageUploadField({ label, imageUrl, onSet, hint, folder, allowVideo, portrait }: { label: string; imageUrl: string; onSet: (url: string) => void; hint?: string; folder?: string; allowVideo?: boolean; portrait?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [ratioError, setRatioError] = useState('');

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRatioError('');

    // Validate aspect ratio for image files (skip video — can't read dimensions client-side)
    if (portrait !== undefined && file.type.startsWith('image/')) {
      try {
        const dimensions = await new Promise<{w: number; h: number}>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = URL.createObjectURL(file);
        });
        URL.revokeObjectURL(URL.createObjectURL(file));
        const isPortrait = dimensions.h > dimensions.w;
        if (portrait && !isPortrait) {
          setRatioError('This content type requires a portrait/vertical image (height > width). Please select a portrait image.');
          return;
        }
        if (!portrait && isPortrait) {
          setRatioError('This content type requires a landscape/horizontal image (width > height). Please select a landscape image.');
          return;
        }
      } catch { /* skip validation if image load fails */ }
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const endpoint = folder === 'product' ? '/upload/products-image' : folder === 'popup_banner' ? '/upload/information-image' : '/upload/information-image';
      const res = await apiUpload(endpoint, fd);
      if (res.ok) {
        const data = await res.json();
        onSet(data.url);
      }
    } catch { console.error('Upload failed'); } finally { setUploading(false); }
  }

  const isVideo = imageUrl && /\.(mp4|webm)($|\?)/i.test(imageUrl);

  return (
    <div>
      <label className="iform-label">{label}</label>
      {ratioError && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><i className="fas fa-exclamation-circle"></i> {ratioError}</div>}
      <div className="iuf-48">
        <input type="file" ref={fileRef} accept={allowVideo ? 'image/*,video/mp4,video/webm' : 'image/*'} onChange={handleUpload} className="iuf-49" />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Browse'}
        </button>
        {imageUrl && (
          <>
            {isVideo ? (
              <span className="iuf-50" style={{ width: 60, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', borderRadius: 4, fontSize: 10, fontWeight: 600, color: '#3B4A1A' }}>
                <i className="fas fa-video" style={{ marginRight: 4 }}></i>VIDEO
              </span>
            ) : (
              <img src={imageUrl} alt="" width={60} height={40} className="iuf-50" style={{ borderRadius: 4, objectFit: 'cover' }} />
            )}
            <button type="button" className="btn btn-sm iuf-51" onClick={() => onSet('')} ><i className="fas fa-times"></i></button>
          </>
        )}
      </div>
      <div className="iuf-52"><span className="iuf-53"><i className="fas fa-info-circle"></i></span>{hint}</div>
    </div>
  );
}

function GalleryUploadField({ label, urls, onSet, hint, folder }: { label: string; urls: string[]; onSet: (urls: string[]) => void; hint?: string; folder?: string }) {
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
        const endpoint = folder === 'product' ? '/upload/products-image' : folder === 'popup_banner' ? '/upload/information-image' : '/upload/information-image';
        const res = await apiUpload(endpoint, fd);
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
            <img src={url} alt="" width={60} height={40} className="guf-57" style={{ borderRadius: 4, objectFit: 'cover' }} />
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


