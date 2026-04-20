'use client';

import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Clock, MapPin, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { Order } from '../../lib/api';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
}

const statusConfig: Record<string, { variant: 'default' | 'success' | 'warning' | 'error' | 'info'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  confirmed: { variant: 'info', label: 'Confirmed' },
  preparing: { variant: 'info', label: 'Preparing' },
  ready: { variant: 'success', label: 'Ready' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'error', label: 'Cancelled' },
};

export function OrderCard({ order, onClick }: OrderCardProps) {
  const config = statusConfig[order.status] || { variant: 'default', label: order.status };
  const timeAgo = formatDistanceToNow(new Date(order.created_at), { addSuffix: true });

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-gray-900">{order.order_number}</p>
          <p className="text-xs text-gray-400">{timeAgo}</p>
        </div>
        <Badge variant={config.variant} size="sm">
          {config.label}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
        <div className="flex items-center gap-1">
          <Clock size={14} />
          <span>{order.order_type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
        </div>
        {order.store_name && (
          <div className="flex items-center gap-1">
            <MapPin size={14} />
            <span>{order.store_name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {order.items.slice(0, 2).map((item, i) => (
            <span key={i}>
              {item.quantity}x {item.name}
              {i < Math.min(order.items.length, 2) - 1 && ', '}
            </span>
          ))}
          {order.items.length > 2 && (
            <span className="text-gray-400"> +{order.items.length - 2} more</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="font-bold text-primary">RM {order.total.toFixed(2)}</span>
          <ChevronRight size={16} className="text-gray-400" />
        </div>
      </div>
    </motion.div>
  );
}