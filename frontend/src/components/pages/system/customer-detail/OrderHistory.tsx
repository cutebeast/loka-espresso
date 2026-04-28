'use client';

import { formatRM } from '@/lib/merchant-api';
import type { MerchantOrder } from '@/lib/merchant-types';
import { DataTable, Pagination, ColumnDef } from '@/components/ui';

interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

interface OrderHistoryProps {
  orders: PaginatedResponse<MerchantOrder> | null;
  ordersPage: number;
  pageSize: number;
  setOrdersPage: (page: number) => void;
}

const ordersColumns: ColumnDef<MerchantOrder>[] = [
  { key: 'order_number', header: 'Order #' },
  { key: 'order_type', header: 'Type', render: (o) => <span className="cdp-36">{o.order_type?.replace('_', ' ')}</span> },
  { key: 'total', header: 'Total', render: (o) => formatRM(o.total) },
  { key: 'status', header: 'Status', render: (o) => (
    <span className={`badge ${o.status === 'completed' ? 'badge-green' : o.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
      {o.status}
    </span>
  )},
  { key: 'created_at', header: 'Date', render: (o) => new Date(o.created_at).toLocaleDateString() },
];

export default function OrderHistory({ orders, ordersPage, pageSize, setOrdersPage }: OrderHistoryProps) {
  if (!orders) {
    return <div className="cdp-79"><i className="fas fa-spinner fa-spin"></i></div>;
  }

  return (
    <>
      <DataTable
        data={orders.items}
        columns={ordersColumns}
        emptyMessage="No orders found"
      />
      <Pagination
        page={ordersPage}
        totalPages={Math.max(1, Math.ceil(orders.total / pageSize))}
        onPageChange={setOrdersPage}
      />
    </>
  );
}
