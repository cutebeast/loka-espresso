"use client";

import { useEffect, useState } from "react";
import {
  api,
  getMarketingCampaigns,
  createMarketingCampaign,
  sendCampaign,
  type MarketingCampaign,
} from "@/lib/api";

export default function MarketingCampaignsPage() {
  const [items, setItems] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [form, setForm] = useState({
    campaign_name: "",
    channel: "push_notification" as MarketingCampaign["channel"],
    status: "draft" as MarketingCampaign["status"],
    audience_segment: "",
    content: "",
    scheduled_at: "",
    sent_count: 0,
    open_rate: 0,
  });

  const fetchData = () => {
    setLoading(true);
    getMarketingCampaigns()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({
      campaign_name: "",
      channel: "push_notification",
      status: "draft",
      audience_segment: "",
      content: "",
      scheduled_at: "",
      sent_count: 0,
      open_rate: 0,
    });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: MarketingCampaign) => {
    setEditing(item);
    setForm({
      campaign_name: item.campaign_name,
      channel: item.channel,
      status: item.status,
      audience_segment: item.audience_segment || "",
      content: item.content || "",
      scheduled_at: item.scheduled_at ? item.scheduled_at.slice(0, 16) : "",
      sent_count: item.sent_count,
      open_rate: item.open_rate || 0,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/admin/marketing/campaigns/${editing.id}`, form);
      } else {
        await createMarketingCampaign(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSend = async (id: number) => {
    if (!confirm("Send this campaign now?")) return;
    try {
      await sendCampaign(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "scheduled":
        return "bg-amber-100 text-amber-700";
      case "active":
        return "bg-green-100 text-green-700";
      case "paused":
        return "bg-yellow-100 text-yellow-700";
      case "completed":
        return "bg-gray-100 text-gray-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Marketing Campaigns</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Campaign
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Campaign" : "Add Campaign"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <input
                required
                value={form.campaign_name}
                onChange={(e) => setForm({ ...form, campaign_name: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Channel</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value as MarketingCampaign["channel"] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="push_notification">Push Notification</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="in_app">In-App</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as MarketingCampaign["status"] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Audience Segment</label>
              <input
                value={form.audience_segment}
                onChange={(e) => setForm({ ...form, audience_segment: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Scheduled At</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full border rounded px-3 py-2"
                rows={4}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button
                type="submit"
                className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Channel</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Scheduled At</th>
              <th className="text-left px-4 py-3 font-semibold">Sent Count</th>
              <th className="text-left px-4 py-3 font-semibold">Open Rate</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No campaigns found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.campaign_name}</td>
                  <td className="px-4 py-3 capitalize">{item.channel.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">{item.sent_count}</td>
                  <td className="px-4 py-3">
                    {item.open_rate !== undefined ? `${item.open_rate}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline mr-3">
                      Edit
                    </button>
                    {item.status === "draft" || item.status === "scheduled" ? (
                      <button onClick={() => handleSend(item.id)} className="text-green-600 hover:underline">
                        Send
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
