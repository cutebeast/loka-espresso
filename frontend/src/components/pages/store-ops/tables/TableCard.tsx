'use client';

import { formatRM } from '@/lib/merchant-api';
import { QRCodeDisplay } from './QRCodeGenerator';
import type { MerchantTableItem } from '@/lib/merchant-types';

interface TableCardProps {
  table: MerchantTableItem;
  qrImageUrl: string | undefined;
  expiry: { remaining: number; expired: boolean } | undefined;
  confirmDelete: number | null;
  onGenerateQR: (table: MerchantTableItem) => void;
  onDownloadQR: (table: MerchantTableItem) => void;
  onToggle: (table: MerchantTableItem) => void;
  onEdit: (table: MerchantTableItem) => void;
  onDelete: (id: number) => void;
  onSetConfirmDelete: (id: number | null) => void;
  onViewOrder: (orderId: number) => void;
}

export function TableCard({
  table,
  qrImageUrl,
  expiry,
  confirmDelete,
  onGenerateQR,
  onDownloadQR,
  onToggle,
  onEdit,
  onDelete,
  onSetConfirmDelete,
  onViewOrder,
}: TableCardProps) {
  return (
    <div className={`card ${table.is_active ? 'tp-table-active' : 'tp-table-inactive'}`}>
      <div className="tp-33">
        <div>
          <h4 className="tp-34">Table {table.table_number}</h4>
          <p className="tp-35">
            <i className="fas fa-users"></i> Capacity: {table.capacity}
            {table.is_occupied && (
              <span className="tp-36">
                <span className="tp-37"><i className="fas fa-circle"></i></span> Occupied
              </span>
            )}
          </p>
          {table.active_order && (
            <div
              onClick={() => onViewOrder(table.active_order!.id)}
              className={`tp-order-indicator ${table.active_order.payment_status === 'paid' ? 'tp-order-indicator-paid' : 'tp-order-indicator-unpaid'}`}
              title="Click to view order details"
            >
              <div className="tp-38">
                <div>
                  <span className="tp-39">
                    <span className="tp-40"><i className="fas fa-receipt"></i></span>
                    {table.active_order.order_number}
                  </span>
                  <span className={`badge ${
                    table.active_order.status === 'pending' ? 'badge-yellow' :
                    table.active_order.status === 'preparing' ? 'badge-blue' :
                    table.active_order.status === 'ready' ? 'badge-green' :
                    table.active_order.status === 'confirmed' ? 'badge-blue' :
                    'badge-gray'
                  } tp-41`}>
                    {table.active_order.status}
                  </span>
                </div>
                <div className="tp-42">
                  {formatRM(table.active_order.total)}
                  {table.active_order.payment_status !== 'paid' && (
                    <span className="tp-43">
                      <i className="fas fa-exclamation-circle"></i> Unpaid
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <span className={`badge ${
          table.is_occupied ? 'badge-red' :
          !table.qr_code_url ? 'badge-yellow' :
          expiry?.expired ? 'badge-red' :
          table.is_active ? 'badge-green' : 'badge-gray'
        }`}>
          {table.is_occupied ? 'In Use' :
           !table.qr_code_url ? 'Pending' :
           expiry?.expired ? 'Expired' :
           table.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <QRCodeDisplay table={table} qrImageUrl={qrImageUrl} expiry={expiry} />

      <div className="tables-card-actions tp-49">
        {!table.qr_code_url ? (
          <button className="btn btn-sm btn-primary" onClick={() => onGenerateQR(table)} title="Generate QR code for this table">
            <i className="fas fa-qrcode"></i> Generate QR
          </button>
        ) : (
          <>
            <button className="btn btn-sm" onClick={() => onDownloadQR(table)} title="Download QR">
              <i className="fas fa-download"></i>
            </button>
            <button className="btn btn-sm" onClick={() => onGenerateQR(table)} title="Regenerate QR (invalidates old code)">
              <i className="fas fa-sync-alt"></i>
            </button>
          </>
        )}
        <button
          className="btn btn-sm"
          onClick={() => onToggle(table)}
          title={table.is_active ? 'Deactivate' : 'Activate'}
        >
          <i
            className={`fas ${table.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} ${table.is_active ? 'text-success' : 'text-primary-light'}`}
          ></i>
        </button>
        <button className="btn btn-sm" onClick={() => onEdit(table)} title="Edit">
          <i className="fas fa-edit"></i>
        </button>
        {confirmDelete === table.id ? (
          <>
            <button
              className="btn btn-sm tp-50"
              onClick={() => onDelete(table.id)}
            >
              Confirm
            </button>
            <button className="btn btn-sm" onClick={() => onSetConfirmDelete(null)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            className="btn btn-sm tp-51"
            onClick={() => onSetConfirmDelete(table.id)}
            title="Delete"
          >
            <i className="fas fa-trash"></i>
          </button>
        )}
      </div>
    </div>
  );
}
