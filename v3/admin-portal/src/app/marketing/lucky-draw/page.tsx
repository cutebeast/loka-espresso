"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Edit2, Trash2, Save, X, ChevronLeft, ChevronRight } from "lucide-react";

interface LuckyDrawCampaign {
  id: number;
  title: string;
  description: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  spins_per_day: number;
  spin_interval_days: number;
  draw_type: string;
  spend_per_ticket_cents: number;
  max_segments: number;
}

interface LuckyDrawSegment {
  id: number;
  campaign_id: number;
  voucher_definition_id: number;
  label: string;
  color_hex: string;
  probability_weight: number;
  sort_order: number;
  is_active: boolean;
}

interface LuckyDrawSpin {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  segment_label: string | null;
  voucher_code: string | null;
  created_at: string;
}

interface VoucherDefinition {
  id: number;
  voucher_code: string;
  display_title: string;
}

const SPINS_PAGE_SIZE = 10;

const emptyCampaignForm = {
  title: "",
  description: "",
  spins_per_day: "1",
  spin_interval_days: "1",
  draw_type: "free_daily",
  spend_per_ticket_rm: "50",
  max_segments: "8",
  is_active: true,
  start_date: "",
  end_date: "",
};

const emptySegmentForm = {
  voucher_definition_id: "",
  label: "",
  color_hex: "#8B5E34",
  probability_weight: "1",
  sort_order: "0",
  is_active: true,
};

function toDateTimeLocal(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

export default function LuckyDrawPage() {
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [campaign, setCampaign] = useState<LuckyDrawCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [segments, setSegments] = useState<LuckyDrawSegment[]>([]);
  const [vouchers, setVouchers] = useState<VoucherDefinition[]>([]);
  const [editingSegment, setEditingSegment] = useState<LuckyDrawSegment | null>(null);
  const [segmentFormOpen, setSegmentFormOpen] = useState(false);
  const [segmentForm, setSegmentForm] = useState(emptySegmentForm);
  const [savingSegment, setSavingSegment] = useState(false);
  const [deletingSegmentId, setDeletingSegmentId] = useState<number | null>(null);

  const [spins, setSpins] = useState<LuckyDrawSpin[]>([]);
  const [spinsLoading, setSpinsLoading] = useState(false);
  const [ticketStats, setTicketStats] = useState<{ tickets_issued: number; tickets_consumed: number; tickets_available: number; customers_holding: number } | null>(null);

  const fetchTicketStats = useCallback(async (campaignId: number) => {
    try {
      const d = await api.getRaw<any>(`/admin/lucky-draw/campaigns/${campaignId}/ticket-stats`);
      setTicketStats(d);
    } catch { setTicketStats(null); }
  }, []);
  const pagination = usePagination({ defaultPage: 1, defaultPerPage: SPINS_PAGE_SIZE });

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 3000);
  };

  const fetchCampaign = useCallback(async () => {
    const c = await api.get<LuckyDrawCampaign | null>("/admin/lucky-draw/campaign");
    setCampaign(c);
    if (c) {
      setCampaignForm({
        title: c.title,
        description: c.description || "",
        spins_per_day: String(c.spins_per_day),
        spin_interval_days: String(c.spin_interval_days ?? 1),
        draw_type: c.draw_type || "free_daily",
        spend_per_ticket_rm: String((c.spend_per_ticket_cents ?? 5000) / 100),
        max_segments: String(c.max_segments ?? 8),
        is_active: c.is_active,
        start_date: toDateTimeLocal(c.start_date),
        end_date: toDateTimeLocal(c.end_date),
      });
      if (c.draw_type === "ticket_spend") fetchTicketStats(c.id);
    } else {
      setCampaignForm(emptyCampaignForm);
    }
    return c;
  }, []);

  const fetchSegments = useCallback(async (campaignId: number) => {
    const s = await api.get<LuckyDrawSegment[]>(`/admin/lucky-draw/campaigns/${campaignId}/segments`);
    setSegments(Array.isArray(s) ? s : []);
  }, []);

  const fetchSpins = useCallback(async (campaignId: number, p: number = 1) => {
    setSpinsLoading(true);
    try {
      const params = new URLSearchParams({
        campaign_id: String(campaignId),
        page: String(p),
        per_page: String(SPINS_PAGE_SIZE),
      });
      const d = await api.getRaw<any>(`/admin/lucky-draw/spins?${params}`);
      setSpins(d.items || []);
      pagination.setTotal(d.total || 0);
      pagination.setTotalPages(d.total_pages || 1);
      pagination.setPage(p);
    } catch (e: any) {
      setError(parseApiError(e, t("admin.errors.loadFailed", "Failed to load data")));
    } finally {
      setSpinsLoading(false);
    }
  }, [pagination.setTotal, pagination.setTotalPages, pagination.setPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchCampaign();
        if (cancelled) return;
        if (c) {
          await Promise.all([fetchSegments(c.id), fetchSpins(c.id, 1)]);
        }
        try {
          const v = await api.getRaw<any>("/admin/vouchers?per_page=50");
          if (!cancelled) setVouchers(v.items || []);
        } catch (e) {
          console.error("Failed to load voucher definitions:", e);
        }
      } catch (e: any) {
        if (!cancelled) setError(parseApiError(e, t("admin.errors.loadFailed", "Failed to load data")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchCampaign, fetchSegments, fetchSpins]);

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCampaign(true);
    setError("");
    try {
      const body = {
        title: campaignForm.title,
        description: campaignForm.description || null,
        spins_per_day: parseInt(campaignForm.spins_per_day, 10) || 1,
        spin_interval_days: Math.max(1, parseInt(campaignForm.spin_interval_days, 10) || 1),
        draw_type: campaignForm.draw_type,
        spend_per_ticket_cents: Math.round((parseFloat(campaignForm.spend_per_ticket_rm) || 50) * 100),
        max_segments: Math.min(12, Math.max(2, parseInt(campaignForm.max_segments, 10) || 8)),
        is_active: campaignForm.is_active,
        start_date: campaignForm.start_date || null,
        end_date: campaignForm.end_date || null,
      };
      const saved = campaign
        ? await api.put<LuckyDrawCampaign>(`/admin/lucky-draw/campaign/${campaign.id}`, body)
        : await api.post<LuckyDrawCampaign>("/admin/lucky-draw/campaign", body);
      setCampaign(saved);
      if (!campaign && saved) {
        setSegments([]);
        setSpins([]);
        pagination.setTotal(0);
        pagination.setTotalPages(1);
      }
      if (saved.draw_type === "ticket_spend") fetchTicketStats(saved.id);
      showMsg(t("lucky_draw.saved", "Campaign saved"));
    } catch (err: any) {
      setError(parseApiError(err, t("lucky_draw.saveFailed", "Failed to save campaign")));
    } finally {
      setSavingCampaign(false);
    }
  };

  const openAddSegment = () => {
    setEditingSegment(null);
    setSegmentForm(emptySegmentForm);
    setSegmentFormOpen(true);
  };

  const openEditSegment = (s: LuckyDrawSegment) => {
    setEditingSegment(s);
    setSegmentForm({
      voucher_definition_id: String(s.voucher_definition_id),
      label: s.label,
      color_hex: s.color_hex || "#8B5E34",
      probability_weight: String(s.probability_weight),
      sort_order: String(s.sort_order),
      is_active: s.is_active,
    });
    setSegmentFormOpen(true);
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;
    setSavingSegment(true);
    setError("");
    try {
      const body = {
        voucher_definition_id: parseInt(segmentForm.voucher_definition_id, 10),
        label: segmentForm.label,
        color_hex: segmentForm.color_hex || "#8B5E34",
        probability_weight: parseInt(segmentForm.probability_weight, 10) || 1,
        sort_order: parseInt(segmentForm.sort_order, 10) || 0,
        is_active: segmentForm.is_active,
      };
      if (editingSegment) {
        await api.put(`/admin/lucky-draw/segments/${editingSegment.id}`, body);
      } else {
        await api.post(`/admin/lucky-draw/campaigns/${campaign.id}/segments`, body);
      }
      await fetchSegments(campaign.id);
      setSegmentFormOpen(false);
      setEditingSegment(null);
      showMsg(t("lucky_draw.segmentSaved", "Segment saved"));
    } catch (err: any) {
      setError(parseApiError(err, t("lucky_draw.segmentSaveFailed", "Failed to save segment")));
    } finally {
      setSavingSegment(false);
    }
  };

  const handleDeleteSegment = async (id: number) => {
    if (!campaign) return;
    if (!confirm(t("common.confirm_delete", "Are you sure you want to delete this item?"))) return;
    setDeletingSegmentId(id);
    try {
      await api.del(`/admin/lucky-draw/segments/${id}`);
      await fetchSegments(campaign.id);
    } catch (e: any) {
      setError(parseApiError(e, t("lucky_draw.segmentDeleteFailed", "Failed to delete segment")));
    } finally {
      setDeletingSegmentId(null);
    }
  };

  const voucherLabel = (id: number) => {
    const v = vouchers.find(x => x.id === id);
    return v ? `${v.display_title} (${v.voucher_code})` : `#${id}`;
  };

  const activeWeightTotal = segments.filter(s => s.is_active).reduce((sum, s) => sum + s.probability_weight, 0);
  const weightPct = (s: LuckyDrawSegment) => {
    if (!s.is_active || activeWeightTotal <= 0) return "—";
    return `${((s.probability_weight / activeWeightTotal) * 100).toFixed(1)}%`;
  };

  const inputStyle = {
    border: "1px solid var(--color-border-light)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    fontSize: 13,
  } as const;

  if (loading) {
    return <div style={{ padding: 32 }}><h1 className="page-title">{t("lucky_draw.title", "Lucky Draw")}</h1><p>{t("lucky_draw.loading", "Loading...")}</p></div>;
  }

  return <div style={{ padding: 32 }}>
    <div className="page-header">
      <div>
        <h1 className="page-title">{t("lucky_draw.title", "Lucky Draw")}</h1>
        <p className="page-subtitle">{t("lucky_draw.subtitle", "Spin-wheel campaign, prizes and spin history")}</p>
      </div>
    </div>
    {error && <div className="alert alert-error">{error}</div>}
    {msg && <div className="alert alert-success">{msg}</div>}

    {/* Campaign card */}
    <div className="card" style={{ padding: 24, maxWidth: 700, marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("lucky_draw.campaign", "Campaign")}</h2>
      <form onSubmit={handleSaveCampaign}>
        <div className="df-grid">
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("lucky_draw.campaignTitle", "Title")}</label>
            <input required value={campaignForm.title} onChange={e => setCampaignForm({ ...campaignForm, title: e.target.value })} />
          </div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}>
            <label className="df-label">{t("lucky_draw.description", "Description")}</label>
            <textarea rows={3} value={campaignForm.description} onChange={e => setCampaignForm({ ...campaignForm, description: e.target.value })} />
          </div>
          <div className="df-field">
            <label className="df-label">{t("lucky_draw.drawType", "Draw Type")}</label>
            <select value={campaignForm.draw_type} onChange={e => setCampaignForm({ ...campaignForm, draw_type: e.target.value })}>
              <option value="free_daily">{t("lucky_draw.typeFreeDaily", "Free draws per day")}</option>
              <option value="ticket_spend">{t("lucky_draw.typeTicketSpend", "Spend-based tickets")}</option>
            </select>
            <div className="df-hint">{t("lucky_draw.drawTypeHint", "Free daily spins, or tickets earned from spending")}</div>
          </div>
          {campaignForm.draw_type === "free_daily" ? (
            <>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.spinsPerDay", "Free spins per interval")}</label>
              <input type="number" min={1} required value={campaignForm.spins_per_day} onChange={e => setCampaignForm({ ...campaignForm, spins_per_day: e.target.value })} />
              <div className="df-hint">{t("lucky_draw.spinsPerDayHint", "Free spins each customer gets per interval")}</div>
            </div>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.spinIntervalDays", "Days per interval")}</label>
              <input type="number" min={1} required value={campaignForm.spin_interval_days} onChange={e => setCampaignForm({ ...campaignForm, spin_interval_days: e.target.value })} />
              <div className="df-hint">{t("lucky_draw.spinIntervalDaysHint", "1 = daily, 7 = weekly, 30 = monthly")}</div>
            </div>
            </>
          ) : (
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.spendPerTicket", "Spend per ticket (RM)")}</label>
              <input type="number" min={1} step="0.01" required value={campaignForm.spend_per_ticket_rm} onChange={e => setCampaignForm({ ...campaignForm, spend_per_ticket_rm: e.target.value })} />
              <div className="df-hint">{t("lucky_draw.spendPerTicketHint", "Every RM X spent (paid order) earns 1 draw ticket")}</div>
            </div>
          )}
          <div className="df-field">
            <label className="df-label">{t("lucky_draw.maxSegments", "Max wheel segments")}</label>
            <input type="number" min={2} max={12} required value={campaignForm.max_segments} onChange={e => setCampaignForm({ ...campaignForm, max_segments: e.target.value })} />
            <div className="df-hint">{t("lucky_draw.maxSegmentsHint", "How many prize segments fit on this wheel (2-12)")}</div>
          </div>
          <div className="df-field">
            <label className="df-label">{t("lucky_draw.active", "Active")}</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={campaignForm.is_active} onChange={e => setCampaignForm({ ...campaignForm, is_active: e.target.checked })} />
              {t("lucky_draw.activeHint", "Customers can spin when active")}
            </label>
          </div>
          <div className="df-field">
            <label className="df-label">{t("lucky_draw.startDate", "Start date")}</label>
            <input type="datetime-local" value={campaignForm.start_date} onChange={e => setCampaignForm({ ...campaignForm, start_date: e.target.value })} />
          </div>
          <div className="df-field">
            <label className="df-label">{t("lucky_draw.endDate", "End date")}</label>
            <input type="datetime-local" value={campaignForm.end_date} onChange={e => setCampaignForm({ ...campaignForm, end_date: e.target.value })} />
          </div>
        </div>
        <div className="df-actions" style={{ marginTop: 20 }}>
          <button type="submit" className="btn btn-primary" disabled={savingCampaign}>
            <Save size={16} /> {savingCampaign
              ? t("lucky_draw.saving", "Saving...")
              : campaign
                ? t("lucky_draw.updateCampaign", "Update Campaign")
                : t("lucky_draw.createCampaign", "Create Campaign")}
          </button>
        </div>
      </form>
    </div>

    {campaign && campaign.draw_type === "ticket_spend" && ticketStats && (
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card"><div className="kpi-label">{t("lucky_draw.ticketsIssued", "Tickets issued")}</div><div className="kpi-value">{ticketStats.tickets_issued}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("lucky_draw.ticketsConsumed", "Tickets consumed")}</div><div className="kpi-value">{ticketStats.tickets_consumed}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("lucky_draw.ticketsAvailable", "Tickets available")}</div><div className="kpi-value">{ticketStats.tickets_available}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("lucky_draw.customersHolding", "Customers holding")}</div><div className="kpi-value">{ticketStats.customers_holding}</div></div>
      </div>
    )}

    {campaign && <>
      {/* Segments */}
      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t("lucky_draw.segments", "Wheel Segments")}</h2>
          <p className="page-subtitle" style={{ marginTop: 2 }}>{t("lucky_draw.segmentsSubtitle", "Prizes on the wheel — chance is weight ÷ total active weight")}</p>
        </div>
        <button type="button" onClick={openAddSegment} className="btn btn-primary btn-sm" disabled={!!campaign && segments.length >= (campaign.max_segments ?? 8)}><Plus size={16} />{t("lucky_draw.addSegment", "Add Segment")}</button>
      </div>
      <div className="table-header-bar"><span className="text-sm font-semibold">{segments.length} {t("lucky_draw.segmentCountOf", "of")} {campaign?.max_segments ?? 8} {t("lucky_draw.segmentCount", "segments")}</span></div>
      <div className="table-container" style={{ marginBottom: 16 }}>
        <table className="data-table">
          <thead><tr>
            <th style={{ width: 50 }}>{t("lucky_draw.color", "Color")}</th>
            <th>{t("lucky_draw.label", "Label")}</th>
            <th>{t("lucky_draw.voucher", "Voucher")}</th>
            <th>{t("lucky_draw.weight", "Weight")}</th>
            <th>{t("lucky_draw.chance", "Chance")}</th>
            <th>{t("lucky_draw.sortOrder", "Order")}</th>
            <th>{t("lucky_draw.activeCol", "Active")}</th>
            <th style={{ width: 90 }}>{t("lucky_draw.actions", "Actions")}</th>
          </tr></thead>
          <tbody>
            {segments.length === 0
              ? <tr><td colSpan={8} className="data-table-empty">{t("lucky_draw.noSegments", "No segments yet — add prizes for the wheel")}</td></tr>
              : segments.map(s => <tr key={s.id}>
                <td><span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 4, background: s.color_hex || "#8B5E34", border: "1px solid var(--color-border-light)" }} /></td>
                <td style={{ fontWeight: 600 }}>{s.label}</td>
                <td style={{ fontSize: 12 }}>{voucherLabel(s.voucher_definition_id)}</td>
                <td>{s.probability_weight}</td>
                <td>{weightPct(s)}</td>
                <td>{s.sort_order}</td>
                <td><span className={`badge badge-sm ${s.is_active ? "badge-green" : "badge-gray"}`}>{s.is_active ? t("lucky_draw.yes", "Active") : t("lucky_draw.no", "Inactive")}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button type="button" onClick={() => openEditSegment(s)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                    <button type="button" onClick={() => handleDeleteSegment(s.id)} disabled={deletingSegmentId === s.id} className="btn btn-ghost btn-sm" style={{ color: deletingSegmentId === s.id ? "var(--color-text-muted)" : "var(--color-error)" }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>

      {/* Segment add/edit form */}
      {segmentFormOpen && <div className="card" style={{ padding: 24, maxWidth: 700, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          {editingSegment ? t("lucky_draw.editSegment", "Edit Segment") : t("lucky_draw.newSegment", "New Segment")}
        </h3>
        <form onSubmit={handleSaveSegment}>
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.label", "Label")}</label>
              <input required maxLength={100} value={segmentForm.label} onChange={e => setSegmentForm({ ...segmentForm, label: e.target.value })} />
              <div className="df-hint">{t("lucky_draw.labelHint", "Shown on the wheel, e.g. \"RM5 Off\"")}</div>
            </div>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.voucher", "Voucher")}</label>
              <select required value={segmentForm.voucher_definition_id} onChange={e => setSegmentForm({ ...segmentForm, voucher_definition_id: e.target.value })}>
                <option value="">{t("lucky_draw.selectVoucher", "Select a voucher...")}</option>
                {vouchers.map(v => <option key={v.id} value={v.id}>{v.display_title} ({v.voucher_code})</option>)}
              </select>
              <div className="df-hint">{t("lucky_draw.voucherHint", "Prize voucher granted to the winner")}</div>
            </div>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.weight", "Weight")}</label>
              <input type="number" min={1} required value={segmentForm.probability_weight} onChange={e => setSegmentForm({ ...segmentForm, probability_weight: e.target.value })} />
            </div>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.sortOrder", "Order")}</label>
              <input type="number" min={0} value={segmentForm.sort_order} onChange={e => setSegmentForm({ ...segmentForm, sort_order: e.target.value })} />
            </div>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.color", "Color")}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={segmentForm.color_hex} onChange={e => setSegmentForm({ ...segmentForm, color_hex: e.target.value })} style={{ width: 36, height: 32, padding: 2, border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)" }} />
                <input value={segmentForm.color_hex} maxLength={20} onChange={e => setSegmentForm({ ...segmentForm, color_hex: e.target.value })} style={{ ...inputStyle, width: 90 }} />
              </div>
            </div>
            <div className="df-field">
              <label className="df-label">{t("lucky_draw.active", "Active")}</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={segmentForm.is_active} onChange={e => setSegmentForm({ ...segmentForm, is_active: e.target.checked })} />
                {t("lucky_draw.segmentActiveHint", "Include on the wheel")}
              </label>
            </div>
          </div>
          <div className="df-actions" style={{ marginTop: 20 }}>
            <button type="button" onClick={() => { setSegmentFormOpen(false); setEditingSegment(null); }} className="btn btn-ghost"><X size={16} /> {t("lucky_draw.cancel", "Cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={savingSegment}>
              <Save size={16} /> {savingSegment ? t("lucky_draw.saving", "Saving...") : t("lucky_draw.saveSegment", "Save Segment")}
            </button>
          </div>
        </form>
      </div>}

      {/* Recent spins */}
      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t("lucky_draw.recentSpins", "Recent Spins")}</h2>
          <p className="page-subtitle" style={{ marginTop: 2 }}>{pagination.total}{t("lucky_draw.totalSpins", " spins total")}</p>
        </div>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr>
            <th>{t("lucky_draw.customer", "Customer")}</th>
            <th>{t("lucky_draw.phone", "Phone")}</th>
            <th>{t("lucky_draw.prize", "Prize")}</th>
            <th>{t("lucky_draw.voucherCode", "Voucher Code")}</th>
            <th>{t("lucky_draw.time", "Time")}</th>
          </tr></thead>
          <tbody>
            {spinsLoading
              ? <tr><td colSpan={5} className="data-table-empty">{t("lucky_draw.loading", "Loading...")}</td></tr>
              : spins.length === 0
                ? <tr><td colSpan={5} className="data-table-empty">{t("lucky_draw.noSpins", "No spins yet")}</td></tr>
                : spins.map(sp => <tr key={sp.id}>
                  <td style={{ fontWeight: 600 }}>{sp.customer_name || "—"}</td>
                  <td style={{ fontSize: 12 }}>{sp.customer_phone || "—"}</td>
                  <td>{sp.segment_label || "—"}</td>
                  <td style={{ fontSize: 11 }} className="font-mono">{sp.voucher_code || "—"}</td>
                  <td style={{ fontSize: 12 }}>{sp.created_at ? new Date(sp.created_at).toLocaleString(locale) : "—"}</td>
                </tr>)}
          </tbody>
        </table>
      </div>
      {pagination.totalPages > 1 && <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasPrev} onClick={() => { pagination.prevPage(); fetchSpins(campaign.id, pagination.page - 1); }}><ChevronLeft size={14} />{t("orders.prev", "Prev")}</button>
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("orders.page", "Page ")}{pagination.page}{t("orders.of_2", " of ")}{pagination.totalPages}</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasNext} onClick={() => { pagination.nextPage(); fetchSpins(campaign.id, pagination.page + 1); }}>{t("orders.next", "Next")}<ChevronRight size={14} /></button>
      </div>}
    </>}
  </div>;
}
