"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import { splitEqually } from "@/lib/domain/split-bill";
import type { getGuestChecks } from "@/lib/services/guest-checks";
type Check = Awaited<ReturnType<typeof getGuestChecks>>;

export function ItemAllocationDialog({ item, check, currency, pending, serverError, onClose, onDirtyChange, onSave }: { item: Check["items"][number]; check: Check; currency: string; pending: boolean; serverError?: string; onClose: () => void; onDirtyChange: (dirty: boolean) => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(Object.fromEntries(check.guests.map((guest) => [guest.id, centsToInput(item.allocations.find((entry) => entry.orderGuestId === guest.id)?.amountCents ?? 0)])));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const blocked = check.status !== "OPEN" || Boolean(check.discountCents && check.guests.some((guest) => guest.paidCents > 0));
  function change(id: string, value: string) { setDrafts((current) => ({ ...current, [id]: value })); setDirty(true); onDirtyChange(true); setError(""); }
  function close() { if (!pending && (!dirty || window.confirm("Discard this item's unsaved shares?"))) { onDirtyChange(false); onClose(); } }
  async function save() {
    const allocations = [];
    for (const guest of check.guests) {
      const amountCents = drafts[guest.id]?.trim() ? parseMoneyToCents(drafts[guest.id]) : 0;
      if (amountCents === null) { setError("Enter valid amounts or leave a share blank."); return; }
      if (!amountCents) continue;
      const old = item.allocations.find((entry) => entry.orderGuestId === guest.id);
      allocations.push({ guestId: guest.id, amountCents, quantityUnits: guest.paidCents > 0 ? old?.quantityUnits ?? null : item.unitPriceCents > 0 && amountCents % item.unitPriceCents === 0 ? amountCents / item.unitPriceCents : null });
    }
    if (allocations.reduce((sum, entry) => sum + entry.amountCents, 0) > item.lineTotalCents) { setError("Shares exceed this item's total."); return; }
    if (await onSave({ action: "allocate", itemId: item.id, allocations })) { onDirtyChange(false); onClose(); }
  }
  function equal() {
    const unpaid = check.guests.filter((guest) => guest.paidCents === 0);
    const locked = item.allocations.filter((entry) => check.guests.some((guest) => guest.id === entry.orderGuestId && guest.paidCents > 0)).reduce((sum, entry) => sum + entry.amountCents, 0);
    if (!unpaid.length) return;
    const next = { ...drafts };
    for (const share of splitEqually(item.lineTotalCents - locked, unpaid.map((guest) => guest.id))) next[share.guestId] = centsToInput(share.amountCents);
    setDrafts(next); setDirty(true); onDirtyChange(true);
  }
  const allocated = Object.values(drafts).reduce((sum, value) => sum + (parseMoneyToCents(value) ?? 0), 0);
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Assign {item.name}</DialogTitle><DialogDescription>{item.quantity} items · {formatMoney(item.lineTotalCents, currency)} total. Enter units or a shared amount.</DialogDescription></DialogHeader>
    {blocked && <p className="text-sm text-muted-foreground">These allocations are locked. Use the existing balances to settle this check.</p>}
    {check.guests.map((guest) => { const cents = parseMoneyToCents(drafts[guest.id] ?? ""); const units = cents !== null && item.unitPriceCents > 0 && cents % item.unitPriceCents === 0 ? String(cents / item.unitPriceCents) : ""; return <div key={guest.id} className="grid grid-cols-[minmax(0,1fr)_100px_80px] items-end gap-3"><p className="pb-3 text-sm font-medium">{guest.displayName}{guest.paidCents > 0 && <span className="block text-xs text-muted-foreground">Paid share locked</span>}</p><label className="text-xs">Amount<Input aria-label={`Amount for ${guest.displayName}`} disabled={pending || blocked || guest.paidCents > 0} inputMode="decimal" value={drafts[guest.id] ?? ""} onChange={(event) => change(guest.id, event.target.value)} /></label><label className="text-xs">Units<Input aria-label={`Units for ${guest.displayName}`} disabled={pending || blocked || guest.paidCents > 0 || !item.unitPriceCents} type="number" min={0} max={item.quantity} step={1} value={units} onChange={(event) => { const quantity = Number(event.target.value); if (Number.isInteger(quantity) && quantity >= 0 && quantity <= item.quantity) change(guest.id, centsToInput(quantity * item.unitPriceCents)); }} /></label></div>; })}
    <p className="text-sm">Unassigned after save: <strong>{formatMoney(item.lineTotalCents - allocated, currency)}</strong></p>{(error || serverError) && <p role="alert" className="text-sm text-destructive">{error || serverError}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={pending || blocked || !check.guests.some((guest) => !guest.paidCents)} onClick={equal}>Split unpaid share equally</Button><Button disabled={pending || blocked} onClick={() => void save()}>Save item shares</Button></div>
  </DialogContent></Dialog>;
}
