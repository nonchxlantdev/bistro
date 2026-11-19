"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SettlementWorkspace } from "@/components/orders/settlement-workspace";
import { api } from "@/lib/api-client";
import type { OrderDto } from "@/types/api";

/** Close-out for one order: dine-in opens the table checkout, takeaway opens the register payment. */
export function PayOrderScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<OrderDto>(`/api/orders/${orderId}`).then((next) => {
      if (next.orderType === "TAKEAWAY" && next.status === "OPEN") router.replace(`/pos?orderId=${next.id}&pay=1`);
      else setOrder(next);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load this order."));
  }, [orderId, router]);
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!order) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  return <SettlementWorkspace orderId={order.id} initialMode="one" initialReceipt={order.status !== "OPEN"} onDismiss={() => router.push("/orders")} onClosed={() => router.push("/tables")} />;
}
