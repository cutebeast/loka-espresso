"use client";

import { QrCode, Download, RefreshCw, ToggleLeft, ToggleRight, Edit2, Trash2, Users, Circle, Receipt } from "lucide-react";
import { QRCodeDisplay } from "./QRCodeGenerator";

export interface TableItem {
  id: number;
  table_number: string;
  display_name?: string | null;
  qr_code_url?: string | null;
  qr_code_token?: string | null;
  qr_generated_at?: string | null;
  capacity?: number;
  section?: string | null;
  is_active: boolean;
  is_occupied?: boolean;
  active_order?: {
    id: number;
    order_number: string;
    status: string;
    payment_status: string;
    total_amount: number;
  } | null;
}

interface TableCardProps {
  table: TableItem;
  qrImageUrl?: string;
  expiry: { remaining: number; expired: boolean };
  onGenerateQr: (table: TableItem) => void;
  onDownloadQr: (table: TableItem) => void;
  onRegenerateQr: (table: TableItem) => void;
  onToggle: (table: TableItem) => void;
  onEdit: (table: TableItem) => void;
  onDelete: (table: TableItem) => void;
  onViewOrder: (orderId: number) => void;
  confirmDelete: number | null;
  onConfirmDelete: (id: number | null) => void;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "tp-badge-yellow",
  preparing: "tp-badge-blue",
  ready: "tp-badge-green",
  ready_for_pickup: "tp-badge-green",
  confirmed: "tp-badge-blue",
  completed: "tp-badge-green",
  delivered: "tp-badge-green",
  cancelled: "tp-badge-red",
};

export default function TableCard({
  table, qrImageUrl, expiry,
  onGenerateQr, onDownloadQr, onRegenerateQr,
  onToggle, onEdit, onDelete, onViewOrder,
  confirmDelete, onConfirmDelete,
}: TableCardProps) {
  const hasQr = !!(table.qr_code_url || table.qr_code_token) && !expiry.expired;

  const getStatusBadge = () => {
    if (table.is_occupied) return { text: "In Use", cls: "tp-badge-red" };
    if (!table.qr_code_token) return { text: "Pending", cls: "tp-badge-yellow" };
    if (expiry.expired) return { text: "Expired", cls: "tp-badge-red" };
    if (table.is_active) return { text: "Active", cls: "tp-badge-green" };
    return { text: "Inactive", cls: "tp-badge-gray" };
  };

  const badge = getStatusBadge();

  return (
    <div className={`tp-table-card ${table.is_active ? "tp-table-active" : "tp-table-inactive"}`}>
      {/* Header */}
      <div className="tp-33">
        <h4 className="tp-34">{table.table_number}</h4>
        {table.display_name && <span className="tp-display-name">{table.display_name}</span>}
        {table.capacity != null && table.capacity > 0 && (
          <div className="tp-occupancy">
            <Users size={12} />
            <span>{table.capacity}</span>
          </div>
        )}
        {table.is_occupied && (
          <div className="tp-occupied-indicator">
            <Circle size={8} fill="currentColor" />
            <span>Occupied</span>
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className="tp-35">
        <span className={`tp-badge ${badge.cls}`}>{badge.text}</span>
      </div>

      {/* Active order */}
      {table.active_order && (
        <div
          className={`tp-order-indicator ${table.active_order.payment_status === "paid" ? "tp-order-paid" : "tp-order-unpaid"}`}
          onClick={() => onViewOrder(table.active_order!.id)}
        >
          <div className="tp-order-row">
            <Receipt size={14} />
            <span className="tp-order-number">{table.active_order.order_number}</span>
            <span className={`tp-order-status-badge ${STATUS_BADGE_CLASSES[table.active_order.status] || "tp-badge-gray"}`}>
              {table.active_order.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="tp-order-total">RM {Number(table.active_order.total_amount).toFixed(2)}</div>
          {table.active_order.payment_status !== "paid" && (
            <div className="tp-order-unpaid-warn">
              <Circle size={6} fill="currentColor" /> Unpaid
            </div>
          )}
        </div>
      )}

      {/* QR Code */}
      <div className="tp-46">
        <QRCodeDisplay table={table} tableNumber={table.table_number} qrImageUrl={qrImageUrl} expiry={expiry} />
      </div>

      {/* Actions */}
      <div className="tp-49">
        {!hasQr ? (
          <button type="button" onClick={() => onGenerateQr(table)} className="tp-btn-qr">
            <QrCode size={14} /> Generate QR
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onDownloadQr(table)} className="tp-btn-download" title="Download QR">
              <Download size={14} />
            </button>
            <button type="button" onClick={() => onRegenerateQr(table)} className="tp-btn-regen" title="Regenerate QR">
              <RefreshCw size={14} />
            </button>
          </>
        )}
        <button type="button" onClick={() => onToggle(table)} className="tp-btn-toggle" title={table.is_active ? "Deactivate" : "Activate"}>
          {table.is_active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} className="text-gray-400" />}
        </button>
        <button type="button" onClick={() => onEdit(table)} className="tp-btn-edit" title="Edit">
          <Edit2 size={14} />
        </button>
        {confirmDelete === table.id ? (
          <>
            <button type="button" onClick={() => { onDelete(table); onConfirmDelete(null); }} className="tp-btn-delete-confirm">
              Confirm
            </button>
            <button type="button" onClick={() => onConfirmDelete(null)} className="tp-btn-delete-cancel">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onConfirmDelete(table.id)} className="tp-btn-delete" title="Delete">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
