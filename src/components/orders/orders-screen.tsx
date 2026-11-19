"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { ReceiptDialog } from "@/components/orders/receipt-dialog";
import { ConfirmationDialog } from "@/components/states/confirmation-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import type { OrderDto, OrderStatus, SettingsDto } from "@/types/api";

const filters = ["ALL", "OPEN", "COMPLETED", "CANCELLED"] as const;

export function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [currency, setCurrency] = useState("BZD");
  const [status, setStatus] = useState<(typeof filters)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<OrderDto | null>(null);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderDto | null>(null);
  const [pending, setPending] = useState(false);

  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => { api<Array<{ id: string; name: string }>>("/api/staff/manage").then(setStaff).catch(() => {}); }, []);
  const staffName = (id: string | null) => (id ? staff.find((person) => person.id === id)?.name ?? null : null);
  async function load(nextStatus = status, nextQuery = query) {
    try {
      const params = new URLSearchParams();
      if (nextStatus !== "ALL") params.set("status", nextStatus);
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const [nextOrders, settings] = await Promise.all([
        api<OrderDto[]>(`/api/orders?${params.toString()}`),
        api<SettingsDto>("/api/settings"),
      ]);
      setOrders(nextOrders);
      setCurrency(settings.currency);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load orders.");
    }
  }

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams();
    Promise.all([api<OrderDto[]>(`/api/orders?${params.toString()}`), api<SettingsDto>("/api/settings")])
      .then(([nextOrders, settings]) => {
        if (ignore) return;
        setOrders(nextOrders);
        setCurrency(settings.currency);
      })
      .catch((loadError: unknown) => {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "Could not load orders.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  function openOrder(order: OrderDto) {
    if (order.status === "OPEN") {
      router.push(`/pos?orderId=${order.id}`);
      return;
    }
    setSelected(order);
  }

  async function cancelOrder() {
    if (!cancelTarget) return;
    setPending(true);
    try {
      await api(`/api/orders/${cancelTarget.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ version: cancelTarget.version }),
      });
      toast.success(`${cancelTarget.orderNumber} cancelled`);
      setCancelTarget(null);
      await load();
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : "Could not cancel the order.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          value={query}
          placeholder="Search order or table"
          aria-label="Search orders"
          className="h-11 rounded-xl lg:max-w-sm"
          onChange={(event) => {
            setQuery(event.target.value);
            void load(status, event.target.value);
          }}
        />
        <div className="flex gap-2 overflow-x-auto">
          {filters.map((filter) => (
            <Button
              key={filter}
              type="button"
              variant={status === filter ? "default" : "outline"}
              className="h-11"
              onClick={() => {
                setStatus(filter);
                void load(filter, query);
              }}
            >
              {filter === "ALL" ? "All" : filter[0] + filter.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </div>
      {orders && <p className="mb-4 text-sm text-muted-foreground">{orders.length} checks in this view · Open orders can be resumed; completed sales are read-only.</p>}
      {error ? <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {!orders && !error ? <LoadingState label="Loading orders" /> : null}
      {orders && orders.length === 0 ? (
        <EmptyState title="No orders found" description="Saved and completed sales will appear here." />
      ) : null}
      {orders && orders.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.5fr_0.8fr_1.3fr_290px] gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground lg:grid">
            <span>Order</span>
            <span>Type</span>
            <span>Table</span>
            <span>Status</span>
            <span>Items</span>
            <span>Total</span>
            <span>Opened</span>
            <span />
          </div>
          {orders.map((order) => (
            <div key={order.id} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.5fr_0.8fr_1.3fr_290px] lg:items-center">
              <button type="button" className="text-left font-medium hover:text-primary" onClick={() => openOrder(order)}>
                {order.orderNumber}
              </button>
              <span className="text-sm">{order.orderType === "DINE_IN" ? "Dine-in" : "Takeaway"}</span>
              <span className="text-sm">{order.tableName ?? "—"}</span>
              {order.status === "OPEN" && order.kitchenServed ? <span className="status-chip status-ready">Ready to pay</span> : <OrderStatusBadge status={order.status as OrderStatus} />}
              <span className="text-sm">{order.itemCount}</span>
              <span className="text-sm font-medium">{formatMoney(order.totalCents, currency)}</span>
              <span className="text-sm text-muted-foreground">
                {formatDateTime(order.createdAt)}
                {order.completedAt ? ` · Paid ${formatDateTime(order.completedAt)}` : ""}
              </span>
              <div className="flex gap-2 lg:justify-end">
                {order.status === "OPEN" && (
                  <Button type="button" variant={order.kitchenServed ? "default" : "outline"} className="h-10" onClick={() => router.push(`/orders/${order.id}/pay`)}>
                    Take payment
                  </Button>
                )}
                <Button type="button" variant={order.status === "OPEN" ? "ghost" : "outline"} className="h-10" onClick={() => openOrder(order)}>
                  {order.status === "OPEN" ? "Edit" : "View"}
                </Button>
                {order.status === "OPEN" ? (
                  <Button type="button" variant="ghost" className="h-10" disabled={order.kitchenServed} title={order.kitchenServed ? "Served orders cannot be cancelled yet" : undefined} onClick={() => setCancelTarget(order)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.orderNumber}</DialogTitle>
            <DialogDescription>Completed and cancelled orders are read-only.{selected && (staffName(selected.openedById) || staffName(selected.closedById)) ? ` Served by ${staffName(selected.openedById) ?? "—"} · Closed by ${staffName(selected.closedById) ?? "—"}.` : ""}</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{selected.orderType === "DINE_IN" ? selected.tableName ?? "Dine-in" : "Takeaway"}</span>
                <OrderStatusBadge status={selected.status} />
              </div>
              {selected.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-3">
                  <span>
                    {item.quantity} × {item.name}
                    {item.modifiers.length > 0 && <span className="block text-xs text-muted-foreground">{item.modifiers.map((modifier) => modifier.optionName).join(" · ")}</span>}
                    {item.instructions && <span className="block text-xs text-muted-foreground">Note: {item.instructions}</span>}
                  </span>
                  <span>{formatMoney(item.lineTotalCents, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span>{formatMoney(selected.totalCents, currency)}</span>
              </div>
              {[...(selected.payment ? [{ ...selected.payment, guestName: "Table" }] : []), ...selected.guestPayments].map((payment, index) => (
                <p key={`${payment.createdAt}-${index}`} className="flex justify-between gap-3 text-muted-foreground">
                  <span>{payment.guestName} · {payment.method === "CARD" ? "Card" : "Cash"}{payment.tipCents ? ` · Tip ${formatMoney(payment.tipCents, currency)}` : ""}</span>
                  <span className="tabular-nums">{formatMoney(payment.amountCents + payment.tipCents, currency)}{payment.method !== "CARD" && payment.changeCents ? ` (change ${formatMoney(payment.changeCents, currency)})` : ""}</span>
                </p>
              ))}
              <p className="text-muted-foreground">Tax: Not configured</p>
              <Button type="button" variant="outline" onClick={() => { setReceiptOrderId(selected.id); setSelected(null); }}>View receipt</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {receiptOrderId && <ReceiptDialog orderId={receiptOrderId} open onOpenChange={(open) => { if (!open) setReceiptOrderId(null); }} />}
      <ConfirmationDialog
        open={Boolean(cancelTarget)}
        title="Cancel this order?"
        description="The table will be released. This cannot be checked out afterward."
        confirmLabel="Cancel order"
        destructive
        pending={pending}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        onConfirm={() => void cancelOrder()}
      />
    </div>
  );
}

