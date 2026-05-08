"use client";

import { Table } from "@/lib/api";
import StatusBadge from "./StatusBadge";
import { Armchair } from "lucide-react";

interface TableGridProps {
  tables: Table[];
  onTableClick?: (table: Table) => void;
}

export default function TableGrid({ tables, onTableClick }: TableGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {tables.map((table) => {
        const statusColor =
          table.status === "available"
            ? "bg-green-50 border-green-200 text-green-700"
            : table.status === "occupied"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-amber-50 border-amber-200 text-amber-700";

        return (
          <button
            key={table.id}
            onClick={() => onTableClick?.(table)}
            className={`rounded-lg border p-4 flex flex-col items-center justify-center gap-2 transition hover:shadow-md text-left ${statusColor} ${onTableClick ? "cursor-pointer" : ""}`}
          >
            <Armchair size={28} />
            <span className="text-lg font-bold">{table.number}</span>
            <span className="text-xs text-gray-500">{table.seats} seats</span>
            <StatusBadge status={table.status} />
          </button>
        );
      })}
    </div>
  );
}
