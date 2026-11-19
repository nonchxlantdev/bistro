"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChefHat, LayoutGrid, ShoppingBag, ReceiptText } from "lucide-react";
import { LoadingState } from "@/components/states/loading-state";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";
import type { DashboardDto, OrderStatus } from "@/types/api";

export function DashboardScreen() {
  const [data, setData] = useState<DashboardDto | null>(null);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    const dateTimer = window.setTimeout(() => setDate(new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date())), 0);
    api<DashboardDto>("/api/dashboard").then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load service overview."));
    return () => window.clearTimeout(dateTimer);
  }, []);
  if (!data && !error) return <LoadingState label="Preparing your service overview" />;
  return <div className="h-full overflow-y-auto p-4 md:p-6">
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-destructive">{error}</p>}
    {data && <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl font-medium">Today’s service</h2><p className="mt-1 text-sm text-muted-foreground">{date} · {data.locationName}</p></div><span className="status-chip status-served">Salud Bistro — Demo</span></div>
      <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-4">
        {[["Open orders", String(data.openOrders), "Checks in service"], ["Occupied tables", data.occupiedTables + " / " + data.tableCount, "On the floor"], ["Completed today", String(data.completedToday), "Settled orders"], ["Cash sales today", formatMoney(data.salesCents, data.currency), "Completed sales"]].map(([label, value, note]) => <div key={label} className="min-w-0 border-b border-border p-4 last:border-b-0 lg:border-b-0 md:p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="my-2 break-words text-[28px] leading-tight font-medium tracking-tight">{value}</p><p className="text-xs text-muted-foreground">{note}</p></div>)}
      </div>
      <nav aria-label="Service shortcuts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ href: "/pos", label: "Open register", note: "Start a new order", Icon: ShoppingBag }, { href: "/tables", label: "View tables", note: "Seat & settle", Icon: LayoutGrid }, { href: "/kitchen", label: "View kitchen", note: data.activeKitchenTickets + " active tickets", Icon: ChefHat }, { href: "/orders", label: "Recent orders", note: "Find any check", Icon: ReceiptText }].map(({ href, label, note, Icon }) => <Link key={href} href={href} className="service-panel flex min-h-24 items-center gap-3 p-4 transition-colors hover:bg-muted"><Icon className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><ArrowUpRight className="ml-auto hidden size-4 text-muted-foreground sm:block" /></Link>)}
      </nav>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        <section className="service-panel overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4 md:px-5"><h3 className="font-semibold">Recent orders</h3><Link href="/orders" className="text-sm underline underline-offset-4">View all</Link></div>
          {!data.recentOrders.length && <p className="p-5 text-sm text-muted-foreground">Your first check will appear here. Open the register to begin.</p>}
          {data.recentOrders.map((order) => <Link key={order.id} href={order.status === "OPEN" ? "/pos?orderId=" + order.id : "/orders"} className="flex items-center gap-3 border-b border-border p-4 last:border-b-0 hover:bg-muted/60 md:px-5"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{order.orderNumber} <span className="ml-2 font-normal text-muted-foreground">{order.tableName}</span></p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p></div><div className="hidden sm:block"><OrderStatusBadge status={order.status as OrderStatus} /></div><p className="w-24 text-right text-sm font-semibold">{formatMoney(order.totalCents, data.currency)}</p></Link>)}
        </section>
        <section className="service-panel p-5"><h3 className="font-semibold">On the floor</h3><div className="mt-4 flex items-end justify-between gap-3"><p className="text-[28px] font-medium">{formatMoney(data.awaitingPaymentCents, data.currency)}</p><span className="pb-1 text-xs text-muted-foreground">Awaiting payment</span></div><p className="mt-1 text-sm text-muted-foreground">Across {data.openOrders} open checks</p>
          <div className="my-5 border-t border-border" /><div className="flex justify-between text-sm"><span>Tables in service</span><strong>{data.occupiedTables} of {data.tableCount}</strong></div><progress aria-label="Occupied tables" max={data.tableCount || 1} value={data.occupiedTables} className="mt-3 h-2 w-full accent-success" /><p className="mt-2 text-xs text-muted-foreground">{data.tableCount - data.occupiedTables} tables not occupied</p><Link href="/tables" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-muted">Manage the floor</Link>
        </section>
      </div>
    </div>}
  </div>;
}


