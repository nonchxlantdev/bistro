"use client";

import { TableCard } from "@/components/tables/table-card";
import type { TableDto } from "@/types/api";

export function TableGrid({
  tables,
  currency,
  now,
  pendingId,
  onOpen,
  onReserve,
  onAction,
}: {
  tables: TableDto[];
  currency: string;
  now: number;
  pendingId?: string | null;
  onOpen: (table: TableDto) => void;
  onReserve: (table: TableDto) => void;
  onAction?: (table: TableDto, action: "bill" | "split" | "checkout") => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {tables.map((table) => (
        <TableCard
          key={table.id}
          table={table}
          currency={currency}
          now={now}
          pending={pendingId === table.id}
          onOpen={onOpen}
          onReserve={onReserve}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
