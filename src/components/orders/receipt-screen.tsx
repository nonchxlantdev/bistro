"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/domain/money";
import { DEMO_BRAND } from "@/lib/brand";
import type { getGuestChecks } from "@/lib/services/guest-checks";
import type { SettingsDto } from "@/types/api";

type State = Awaited<ReturnType<typeof getGuestChecks>>;
export function ReceiptScreen({ orderId, guestId, embedded = false }: { orderId: string; guestId?: string; embedded?: boolean }) {
  const [data, setData] = useState<{ check: State; settings: SettingsDto } | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api<State>(`/api/orders/${orderId}/guests`), api<SettingsDto>("/api/settings")])
      .then(([check, settings]) => { if (active) setData({ check, settings }); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load receipt."); });
    api<Array<{ id: string; name: string }>>("/api/staff/manage").then((list) => { if (active) setStaff(list); }).catch(() => {});
    return () => { active = false; };
  }, [orderId]);
  if (!data) return <div className="p-5">{error || "Loading receipt…"}</div>;
  const { check, settings } = data;
  const guest = guestId ? check.guests.find((entry) => entry.id === guestId) : null;
  if (guestId && !guest) return <div className="p-5">Guest not found.</div>;
  const entries = check.items.flatMap((item) => {
    const detail = [item.modifiers.map((modifier) => `${modifier.name}${modifier.priceDeltaCents ? ` (${modifier.priceDeltaCents > 0 ? "+" : ""}${formatMoney(modifier.priceDeltaCents, settings.currency)} each)` : ""}`).join(", "), item.instructions ? `Note: ${item.instructions}` : ""].filter(Boolean).join(" · ");
    if (!guest) return [{ name: `${item.quantity} × ${item.name}`, detail, cents: item.lineTotalCents }];
    const allocation = item.allocations.find((entry) => entry.orderGuestId === guest.id);
    return allocation ? [{ name: allocation.quantityUnits ? `${allocation.quantityUnits} × ${item.name}` : `${item.name} (shared)`, detail, cents: allocation.amountCents }] : [];
  });
  const payments = guest ? guest.payments.map((payment) => ({ ...payment, guestName: guest.displayName })) : check.guests.flatMap((entry) => entry.payments.map((payment) => ({ ...payment, guestName: entry.displayName })));
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0) + (!guest ? (check.legacyPayment?.amountCents ?? 0) : 0);
  const tips = payments.reduce((sum, payment) => sum + payment.tipCents, 0) + (!guest ? (check.legacyPayment?.tipCents ?? 0) : 0);
  const nameOf = (id: string | null | undefined) => (id ? staff.find((person) => person.id === id)?.name : undefined);
  const server = nameOf(check.openedById) ?? nameOf(payments.find((payment) => payment.staffId)?.staffId ?? check.legacyPayment?.staffId);
  const methodLabel = (method: string) => (method === "CARD" ? "card" : "cash");
  const total = guest ? guest.totalCents : check.totalCents;
  const money = (cents: number) => formatMoney(cents, settings.currency);
  const businessName = settings.businessName || DEMO_BRAND.name;
  return <div className="receipt-document mx-auto my-6 w-[80mm] max-w-full bg-white px-5 py-6 text-black">
    {!embedded && <button type="button" className="receipt-controls mb-5 w-full rounded bg-black p-3 text-white" onClick={() => window.print()}>Print</button>}
    <header className="space-y-1 text-center">
      <h1 className="text-2xl font-bold uppercase tracking-[0.18em]">{businessName}</h1>
      {settings.locationName && <p className="text-sm">{settings.locationName}</p>}
      <p className="pt-1 text-[11px] uppercase tracking-wider">Demo receipt · Not a fiscal receipt</p>
    </header>
    <div className="mt-5 space-y-0.5 border-t border-dashed border-black pt-3 text-sm">
      <div className="flex justify-between gap-3"><span>{check.orderNumber}</span><span>{check.tableName ?? "Takeaway"}</span></div>
      <div className="text-xs">{new Date(check.createdAt).toLocaleString()}</div>
      {guest && <div className="font-semibold">{guest.displayName}</div>}
      {server && <div className="text-xs">Served by {server}</div>}
    </div>
    <div className="mt-3 space-y-2.5 border-y border-dashed border-black py-3 text-sm">{entries.map((entry, index) => <div key={index}>
      <div className="flex justify-between gap-3"><span>{entry.name}</span><span className="shrink-0 tabular-nums">{money(entry.cents)}</span></div>
      {entry.detail && <p className="mt-0.5 pl-3 text-xs leading-snug">{entry.detail}</p>}
    </div>)}</div>
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(guest ? guest.grossCents : check.subtotalCents)}</span></div>
      <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{money(guest ? guest.discountCents : check.discountCents)}</span></div>
      <div className="flex justify-between border-t border-black pt-1.5 text-base font-bold"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
    </div>
    {(payments.length > 0 || (!guest && check.legacyPayment)) && <div className="mt-3 space-y-2 border-t border-dashed border-black pt-3 text-sm">
      {[...payments, ...(!guest && check.legacyPayment ? [{ ...check.legacyPayment, guestName: check.tableName ?? "Takeaway" }] : [])].map((payment) => <div key={payment.id}>
        <div className="flex justify-between gap-3"><span>{payment.guestName} · {methodLabel(payment.method)}</span><span className="tabular-nums">{money(payment.amountCents)}</span></div>
        {payment.tipCents > 0 && <div className="flex justify-between gap-3 text-xs"><span>Tip</span><span className="tabular-nums">{money(payment.tipCents)}</span></div>}
        <div className="mt-0.5 text-xs">{payment.method === "CARD" ? `Charged to card ${money(payment.amountCents + payment.tipCents)}` : `Received ${money(payment.tenderedCents)} · Change ${money(payment.changeCents)}`}</div>
      </div>)}
    </div>}
    {tips > 0 && <div className="mt-3 flex justify-between text-sm"><span>Total with tip</span><span className="tabular-nums">{money(paid + tips)}</span></div>}
    <div className="mt-3 flex justify-between border-t border-black pt-2 text-base font-bold"><span>Balance</span><span className="tabular-nums">{money(total - paid)}</span></div>
    {guest && !check.complete && <p className="mt-4 text-xs">Item assignment is incomplete; guest discounts are not final.</p>}
    <footer className="mt-6 space-y-1 border-t border-dashed border-black pt-4 text-center text-xs leading-relaxed">
      <p>Tax: Not configured</p>
      <p>{settings.receiptFooter || `Thank you for visiting ${businessName}.`}</p>
    </footer>
  </div>;
}
