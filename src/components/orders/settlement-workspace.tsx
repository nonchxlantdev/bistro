"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowLeft, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CashPaymentFields } from "@/components/orders/cash-payment-fields";
import { SplitPlanner } from "@/components/orders/split-planner";
import { ItemAllocationDialog } from "@/components/orders/item-allocation-dialog";
import { ReceiptDialog } from "@/components/orders/receipt-dialog";
import { api } from "@/lib/api-client";
import { showFirstUseTip } from "@/lib/first-use-tips";
import { formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import { quoteGuestPayment } from "@/lib/domain/split-bill";
import type { getGuestChecks } from "@/lib/services/guest-checks";
import type { SettingsDto } from "@/types/api";

type Check = Awaited<ReturnType<typeof getGuestChecks>>;
type Props = { orderId: string; currency?: string; initialMode?: "one" | "split"; initialReceipt?: boolean; onDismiss?: () => void; onClosed?: () => void; onEditOrder?: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void };

export function SettlementWorkspace({ orderId, currency: providedCurrency, initialMode = "one", initialReceipt = false, onDismiss, onClosed, onEditOrder, onDirtyChange, onBusyChange }: Props) {
  const router = useRouter();
  const formId = useId();
  const [check, setCheck] = useState<Check | null>(null);
  const [currency, setCurrency] = useState(providedCurrency ?? "BZD");
  const [mode, setMode] = useState(initialMode);
  const [method, setMethod] = useState<"equal" | "items" | "custom">("equal");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const errorBlock = useRef<HTMLDivElement>(null);
  const [tableCash, setTableCash] = useState("");
  const [guestAmount, setGuestAmount] = useState("");
  const [guestCash, setGuestCash] = useState("");
  const [guestName, setGuestName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [plannerDirty, setPlannerDirty] = useState(false);
  const [itemDirty, setItemDirty] = useState(false);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [receipt, setReceipt] = useState<{ guestId?: string } | null>(initialReceipt ? {} : null);
  const [success, setSuccess] = useState<{ message: string; guestId?: string } | null>(null);
  const dirty = plannerDirty || itemDirty;
  const memoryKeys = useRef(new Map<string, string>());

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (error && !editingItem) errorBlock.current?.focus(); }, [error, editingItem]);
  useEffect(() => {
    let active = true;
    Promise.all([api<Check>(`/api/orders/${orderId}/guests`), providedCurrency ? Promise.resolve(providedCurrency) : api<SettingsDto>("/api/settings").then((settings) => settings.currency)])
      .then(([next, money]) => { if (active) { setCheck(next); setCurrency(money); if (next.items.some((item) => item.allocations.length)) setMethod("items"); showFirstUseTip(initialMode === "split" ? "split" : "checkout"); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load checkout."); });
    return () => { active = false; };
  }, [orderId, providedCurrency, initialMode]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const links = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 || target.target === "_blank" || target.origin !== window.location.origin || target.href === window.location.href) return;
      if (busy.current || (dirty && !window.confirm("Discard unsaved split changes and leave checkout?"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", links, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", links, true); };
  }, [dirty, pending]);

  async function mutate(payload: Record<string, unknown>): Promise<Check | null> {
    if (!check || busy.current) return null;
    busy.current = true; setPending(true); onBusyChange?.(true); setError("");
    try {
      const next = await api<Check>(`/api/orders/${orderId}/guests`, { method: "POST", body: JSON.stringify({ ...payload, version: check.version }) });
      setCheck(next); return next;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update this check."); return null; }
    finally { busy.current = false; setPending(false); onBusyChange?.(false); }
  }
  function discardDrafts() {
    if (busy.current || (dirty && !window.confirm("Discard the unsaved allocation proposal? Saved shares and payments will be kept."))) return false;
    setPlannerDirty(false); setItemDirty(false); setEditingItem(null); setDraftEpoch((value) => value + 1); return true;
  }
  function changeMode(next: "one" | "split") { if (next !== mode && discardDrafts()) { setMode(next); setSelected(null); setError(""); showFirstUseTip(next === "split" ? "split" : "checkout"); } }
  function changeMethod(next: typeof method) { if (next !== method && discardDrafts()) { setMethod(next); setSelected(null); setError(""); showFirstUseTip(next === "equal" ? "split" : next); } }
  function keyFor(storageKey: string) {
    let key = memoryKeys.current.get(storageKey);
    try { key ??= sessionStorage.getItem(storageKey) ?? undefined; } catch { /* In-memory retry protection remains available. */ }
    key ??= crypto.randomUUID(); memoryKeys.current.set(storageKey, key);
    try { sessionStorage.setItem(storageKey, key); } catch { /* Local storage may be unavailable. */ }
    return key;
  }
  async function pay(guestId?: string) {
    if (!check || dirty || busy.current) return;
    const guest = guestId ? check.guests.find((entry) => entry.id === guestId) : null;
    const totalPaid = check.guests.reduce((sum, entry) => sum + entry.paidCents, 0) + (check.legacyPayment?.amountCents ?? 0);
    const balance = guest ? guest.balanceCents : check.totalCents - totalPaid;
    const amount = guest && guestAmount.trim() ? parseMoneyToCents(guestAmount) : balance;
    const tendered = parseMoneyToCents(guest ? guestCash : tableCash);
    if (amount === null || tendered === null) { setError("Enter a valid payment amount and cash received."); return; }
    let quote;
    try { quote = quoteGuestPayment(balance, amount, tendered); } catch (e) { setError(e instanceof Error ? e.message : "Check the cash received."); return; }
    const storageKey = `sora-settlement:${orderId}:${guestId ?? "table"}:${check.version}:${amount}:${tendered}`;
    const next = await mutate({ action: guest ? "pay" : "payRemaining", ...(guest ? { guestId: guest.id } : {}), amountCents: amount, tenderedCents: tendered, idempotencyKey: keyFor(storageKey) });
    if (!next) return;
    memoryKeys.current.delete(storageKey); try { sessionStorage.removeItem(storageKey); } catch { /* The saved server state still deduplicates retries. */ }
    const message = `${guest?.displayName ?? "Table"} payment recorded · Change ${formatMoney(quote.changeCents, currency)}`;
    setSuccess({ message, ...(guest ? { guestId: guest.id } : {}) }); toast.success(message);
    showFirstUseTip("paid");
    setTableCash(""); setGuestAmount(""); setGuestCash(""); setSelected(null);
  }
  async function refresh() {
    if (!discardDrafts()) return;
    busy.current = true; setPending(true); onBusyChange?.(true);
    try { setCheck(await api<Check>(`/api/orders/${orderId}/guests`)); setError(""); setSelected(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not refresh checkout."); }
    finally { busy.current = false; setPending(false); onBusyChange?.(false); }
  }
  function dismiss() {
    if (onDismiss) onDismiss();
    else if (discardDrafts()) router.push("/tables");
  }
  async function closeTable() {
    if (!check || dirty) return;
    const result = await mutate({ action: "close" });
    if (result) { toast.success("Table closed"); if (onClosed) onClosed(); else router.push("/tables"); }
  }
  function openReceipt(guestId?: string) { if (!dirty && !busy.current) setReceipt({ guestId }); }
  const paid = check ? check.guests.reduce((sum, guest) => sum + guest.paidCents, 0) + (check.legacyPayment?.amountCents ?? 0) : 0;
  const balance = check ? check.totalCents - paid : 0;
  const unassigned = check?.items.reduce((sum, item) => sum + item.lineTotalCents - item.allocatedCents, 0) ?? 0;
  const closed = check?.status !== "OPEN";
  const selectedGuest = check?.guests.find((guest) => guest.id === selected);
  const item = check?.items.find((entry) => entry.id === editingItem);
  const canClose = Boolean(check && !closed && check.complete && check.guests.length && !balance && check.guests.every((guest) => guest.balanceCents === 0) && !dirty && !pending);
  const canPayGuest = Boolean(selectedGuest && selectedGuest.balanceCents > 0 && check?.complete);
  const showPay = Boolean(check && !closed && (mode === "one" ? balance > 0 : canPayGuest));
  const money = (cents: number) => formatMoney(cents, currency);

  return <div className="settlement-workspace flex h-full min-h-0 min-w-0 flex-col bg-card">
    <header className="shrink-0 border-b border-border px-4 py-4 md:px-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-2xl font-medium">{check?.tableName ?? "Table checkout"}</h2><p className="mt-1 text-xs text-muted-foreground">{check?.orderNumber ?? "Loading check…"} · {check?.guests.length ?? 0} guest checks · {check ? balance === 0 ? "Paid in Full" : paid ? "Part paid" : "Unpaid" : "Loading"}</p></div><Button variant="ghost" size="icon" aria-label="Close checkout" disabled={pending} onClick={dismiss}><X /></Button></div>
      <div role="group" aria-label="Checkout mode" className="mt-4 grid grid-cols-2 gap-2"><Button className="h-11" variant={mode === "one" ? "default" : "outline"} aria-pressed={mode === "one"} disabled={pending} onClick={() => changeMode("one")}>One Payment</Button><Button className="h-11" variant={mode === "split" ? "default" : "outline"} aria-pressed={mode === "split"} disabled={pending} onClick={() => changeMode("split")}>Split Bill</Button></div>
      {check && <dl className="mt-4 grid grid-cols-3 gap-3"><div><dt className="text-xs text-muted-foreground">Table total</dt><dd className="mt-1 text-base font-medium sm:text-xl">{money(check.totalCents)}</dd></div><div><dt className="text-xs text-muted-foreground">Total paid</dt><dd className="mt-1 text-base font-medium sm:text-xl">{money(paid)}</dd></div><div className="text-right"><dt className="text-xs text-muted-foreground">Outstanding</dt><dd className={`mt-1 text-lg font-semibold sm:text-2xl ${balance === 0 ? "text-success" : ""}`}>{money(balance)}</dd></div></dl>}
    </header>
    <div data-settlement-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-6">
      {error && <div ref={errorBlock} tabIndex={-1} role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-destructive">{error}<Button type="button" variant="link" disabled={pending} onClick={() => void refresh()}>Refresh check</Button></div>}
      {success && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-soft p-3 text-sm text-success"><span>{success.message}</span><Button variant="outline" disabled={pending || dirty} onClick={() => openReceipt(success.guestId)}>View receipt</Button></div>}
      {check && balance === 0 && !closed && <p className="mb-4 rounded-lg bg-success-soft p-3 text-sm text-success">Paid in Full. {canClose ? "Close the table when service is finished." : "Complete item assignment before closing the table."}</p>}
      {!check && !error && <p className="py-8 text-sm text-muted-foreground">Loading checkout…</p>}
      {check && mode === "one" && <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.85fr)]"><section className="min-w-0"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold">Order summary</h3>{onEditOrder && <Button variant="link" disabled={pending || closed} onClick={onEditOrder}>Order editor</Button>}</div><ul className="divide-y divide-border">{check.items.map((line) => <li key={line.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{line.quantity} × {line.name}</p>{line.modifiers.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{line.modifiers.map((modifier) => modifier.name).join(" · ")}</p>}{line.instructions && <p className="mt-1 text-xs text-muted-foreground">Note: {line.instructions}</p>}</div><span className="shrink-0">{money(line.lineTotalCents)}</span></li>)}</ul><dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(check.subtotalCents)}</dd></div><div className="flex justify-between"><dt>Discount</dt><dd>{money(check.discountCents)}</dd></div><div className="flex justify-between"><dt>Already paid</dt><dd>{money(paid)}</dd></div></dl><p className="mt-3 text-xs text-muted-foreground">Cash only · Tax is not configured.</p></section><section className="min-w-0 space-y-4"><h3 className="font-semibold">One person pays the remaining balance</h3>{check.guests.length > 0 && <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">{check.guests.length} guest checks are saved. Their allocations and previous payments will be respected; this payment covers the remaining table balance.</p>}{unassigned > 0 && <p className="text-xs text-muted-foreground">Includes {money(unassigned)} of unassigned items. No split setup is required.</p>}{!closed && balance > 0 && <form id={formId} onSubmit={(event) => { event.preventDefault(); void pay(); }}><CashPaymentFields balanceCents={balance} currency={currency} amount="" cash={tableCash} disabled={pending} onAmount={() => {}} onCash={setTableCash} /></form>}{check.guests.length > 0 && <details className="text-sm"><summary className="cursor-pointer py-2 text-muted-foreground">Saved guest balances</summary><ul className="mt-2 space-y-2">{check.guests.map((guest) => <li key={guest.id} className="flex justify-between gap-3"><span>{guest.displayName}</span><strong>{money(guest.balanceCents)} due</strong></li>)}</ul></details>}</section></div>}
      {check && mode === "split" && <div className="space-y-5"><div className="flex flex-wrap gap-2" role="group" aria-label="Split method">{([['equal', 'Split equally'], ['items', 'Guest / items'], ['custom', 'Custom amounts']] as const).map(([key, label]) => <Button key={key} variant={method === key ? "secondary" : "outline"} className="h-11" aria-pressed={method === key} disabled={pending} onClick={() => changeMethod(key)}>{label}</Button>)}</div>
        {!selectedGuest && method !== "items" && <SplitPlanner key={`${check.version}-${method}-${draftEpoch}`} check={check} currency={currency} mode={method} pending={pending} onDirtyChange={setPlannerDirty} onSave={async (payload) => { const next = await mutate(payload); if (next) { setPlannerDirty(false); setSuccess({ message: "Split saved. Select a guest below to take payment." }); } return Boolean(next); }} />}
        {!selectedGuest && method === "items" && <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Assign items</h3><p className="mt-1 text-xs text-muted-foreground">Unassigned: {money(unassigned)} · Edit one item at a time.</p></div><Button variant="outline" disabled={pending || closed || dirty} onClick={() => void mutate({ action: "addGuest" })}>Add payee</Button></div>{!check.guests.length && <p className="mb-3 text-sm text-muted-foreground">Add payees, or choose an equal split to create them together. Names are optional.</p>}<ul className="divide-y divide-border rounded-xl border border-border px-3">{check.items.map((line) => <li key={line.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{line.quantity} × {line.name}</p><p className="mt-1 text-xs text-muted-foreground">{money(line.lineTotalCents)} · Unassigned {money(line.lineTotalCents - line.allocatedCents)}</p><p className="mt-1 text-xs text-muted-foreground">{line.allocations.map((allocation) => `${check.guests.find((guest) => guest.id === allocation.orderGuestId)?.displayName}: ${money(allocation.amountCents)}`).join(" · ") || "No shares assigned"}</p></div><Button variant="outline" disabled={pending || closed || !check.guests.length} onClick={() => { setError(""); setEditingItem(line.id); }}>Edit shares</Button></li>)}</ul></section>}
        <section className="border-t border-border pt-5"><h3 className="mb-3 font-semibold">Guest checks</h3>{!check.guests.length && <p className="text-sm text-muted-foreground">Your payees will appear here after saving a split.</p>}{!selectedGuest ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{check.guests.map((guest) => <button key={guest.id} type="button" disabled={pending || dirty} onClick={() => { setSelected(guest.id); setGuestAmount(""); setGuestCash(""); setGuestName(guest.displayName); }} className={`rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${guest.balanceCents === 0 && guest.paidCents ? "border-sage bg-success-soft/40" : "border-border bg-card hover:bg-muted/50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{guest.displayName}</strong><span className={`status-chip ${guest.balanceCents === 0 ? guest.paidCents ? "status-completed" : "status-served" : "status-open"}`}>{guest.balanceCents === 0 ? guest.paidCents ? "Paid" : "No balance" : guest.paidCents ? "Part paid" : "Unpaid"}</span></div><p className="mt-3 text-2xl font-semibold">{money(guest.balanceCents)}</p><p className="mt-1 text-xs text-muted-foreground">Allocated {money(guest.totalCents)} · Paid {money(guest.paidCents)}</p></button>)}</div> : <div className="grid items-start gap-5 md:grid-cols-2"><div className="space-y-3"><Button variant="ghost" disabled={pending} onClick={() => setSelected(null)}><ArrowLeft /> All guest checks</Button><h3 className="text-lg font-semibold">{selectedGuest.displayName}</h3><dl className="space-y-2 text-sm">{[["Allocated", selectedGuest.totalCents], ["Paid", selectedGuest.paidCents], ["Outstanding", selectedGuest.balanceCents]].map(([label, value]) => <div key={label} className="flex justify-between"><dt>{label}</dt><dd className="font-semibold">{money(Number(value))}</dd></div>)}</dl><details><summary className="cursor-pointer py-2 text-xs text-muted-foreground">Guest name (optional)</summary><div className="mt-2 flex gap-2"><Input aria-label="Optional payee name" value={guestName} disabled={pending || closed} onChange={(event) => setGuestName(event.target.value)} /><Button variant="outline" disabled={pending || closed || !guestName.trim()} onClick={() => void mutate({ action: "renameGuest", guestId: selectedGuest.id, name: guestName })}>Save name</Button></div></details><Button variant="outline" disabled={pending || dirty} onClick={() => openReceipt(selectedGuest.id)}><ReceiptText /> Guest bill / receipt</Button><ul className="space-y-1 text-xs text-muted-foreground">{selectedGuest.payments.map((payment) => <li key={payment.id}>Applied {money(payment.amountCents)} · Cash {money(payment.tenderedCents)} · Change {money(payment.changeCents)}</li>)}</ul></div><div>{!check.complete && <p className="mb-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">Assign all items before individual guest payments, or use One Payment to cover the table.</p>}{!closed && selectedGuest.balanceCents > 0 && <form id={formId} onSubmit={(event) => { event.preventDefault(); void pay(selectedGuest.id); }}><CashPaymentFields partial balanceCents={selectedGuest.balanceCents} currency={currency} amount={guestAmount} cash={guestCash} disabled={pending || !check.complete} onAmount={setGuestAmount} onCash={setGuestCash} /></form>}</div></div>}</section>
      </div>}
    </div>
    <footer className="shrink-0 border-t border-border bg-background px-4 py-3 md:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><span className="text-muted-foreground">{selectedGuest && mode === "split" ? `${selectedGuest.displayName} due` : "Table outstanding"}</span><strong className="ml-3">{money(selectedGuest && mode === "split" ? selectedGuest.balanceCents : balance)}</strong></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!check || pending || dirty} onClick={() => openReceipt()}>View / print bill</Button>{showPay && <Button type="submit" form={formId} className="h-12 px-5" disabled={pending || dirty || (mode === "split" && !canPayGuest)}>{pending ? "Recording…" : mode === "one" ? "Complete payment" : "Pay guest"}</Button>}{check && !closed && <Button variant={balance === 0 ? "default" : "outline"} className="h-12" disabled={!canClose} onClick={() => void closeTable()}>Close table</Button>}{check && closed && <Button className="h-12" disabled={pending} onClick={dismiss}>Done</Button>}</div></div></footer>
    {item && check && <ItemAllocationDialog key={`${item.id}-${check.version}`} item={item} check={check} currency={currency} pending={pending} serverError={error} onDirtyChange={setItemDirty} onClose={() => setEditingItem(null)} onSave={async (payload) => Boolean(await mutate(payload))} />}
    {receipt && <ReceiptDialog orderId={orderId} guestId={receipt.guestId} open onOpenChange={(open) => { if (!open) setReceipt(null); }} />}
  </div>;
}


