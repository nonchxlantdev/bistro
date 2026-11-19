"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import { planSettlement } from "@/lib/domain/settlement-plan";
import type { getGuestChecks } from "@/lib/services/guest-checks";
type Check = Awaited<ReturnType<typeof getGuestChecks>>;

export function SplitPlanner({ check, currency, mode, pending, onDirtyChange, onSave }: { check: Check; currency: string; mode: "equal" | "custom"; pending: boolean; onDirtyChange: (dirty: boolean) => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [count, setCount] = useState(String(check.guests.length || 2));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const settled = check.complete && check.guests.length > 0 && check.guests.every((guest) => guest.balanceCents === 0) && check.guests.reduce((sum, guest) => sum + guest.paidCents, 0) + (check.legacyPayment?.amountCents ?? 0) >= check.totalCents;
  let base: ReturnType<typeof planSettlement> | null = null;
  let plan: ReturnType<typeof planSettlement> | null = null;
  let error = "";
  let amounts: number[] | undefined;
  if (!settled && check.status === "OPEN") {
    try {
      base = planSettlement(check, Number(count), "equal");
      amounts = base.payees.map((payee) => payee.locked ? payee.totalCents : parseMoneyToCents(custom[payee.id] ?? centsToInput(check.guests.find((guest) => guest.id === payee.id)?.totalCents ?? 0)) ?? -1);
      plan = mode === "equal" ? base : planSettlement(check, Number(count), "custom", amounts);
    } catch (e) { error = e instanceof Error ? e.message : "Check the split amounts."; }
  }
  function touch() { setTouched(true); onDirtyChange(true); }
  async function save() {
    if (!plan || settled || check.status !== "OPEN") return;
    if (check.items.some((item) => item.allocations.length) && !window.confirm("Apply this reviewed split? Unpaid allocations will be replaced. Paid checks and their allocations stay locked.")) return;
    if (await onSave({ action: "configureSplit", mode, count: Number(count), ...(mode === "custom" ? { amounts } : {}) })) { onDirtyChange(false); setTouched(false); }
  }
  if (settled || check.status !== "OPEN") return <section className="max-w-3xl space-y-4" aria-label="Saved split summary"><div><h3 className="font-semibold">{settled ? "Split settled" : "Saved split"}</h3><p className="mt-1 text-sm text-muted-foreground">{settled ? "All guest checks are paid. Saved shares are shown below." : "This order is closed. Saved shares are read-only."}</p></div><dl className="divide-y divide-border rounded-xl border border-border bg-card px-4">{check.guests.map((guest) => <div key={guest.id} className="flex items-center justify-between gap-4 py-4"><dt><span className="block text-sm font-medium">{guest.displayName}</span><span className="mt-1 block text-xs text-muted-foreground">Paid {formatMoney(guest.paidCents, currency)} · Due {formatMoney(guest.balanceCents, currency)}</span></dt><dd className="shrink-0 text-right font-semibold">{formatMoney(guest.totalCents, currency)}</dd></div>)}</dl></section>;
  return <section className="max-w-3xl space-y-5" aria-label={mode === "equal" ? "Equal split preview" : "Custom split preview"}>
    <div className="grid items-end gap-5 sm:grid-cols-[minmax(0,1fr)_160px]"><div><h3 className="font-semibold">{mode === "equal" ? "Split equally" : "Custom amounts"}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Review each share before saving. Existing paid checks stay fixed.</p></div><label className="flex w-40 flex-col gap-2 text-sm font-medium">Number of payees<Input type="number" min={1} max={100} disabled={pending || check.status !== "OPEN"} value={count} onChange={(event) => { setCount(event.target.value); touch(); }} className="h-11 w-full" /></label></div>
    {mode === "custom" && <p className="rounded-lg bg-muted p-3 text-sm">Final shares must total {formatMoney(check.totalCents, currency)}{check.discountCents ? " after discount" : ""}. Paid payees’ shares are locked. The unpaid amounts must cover the remaining allocatable balance exactly.</p>}
    {base && <div className="overflow-hidden rounded-xl border border-border bg-card">{base.payees.map((payee, index) => {
      const preview = plan?.payees[index];
      return <div key={payee.id} className="grid items-center gap-4 border-b border-border p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_160px]"><div className="min-w-0"><p className="text-sm font-medium">{payee.displayName}</p>{payee.locked && <p className="mt-1 text-xs text-muted-foreground">Paid allocations locked</p>}{preview && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Total {formatMoney(preview.totalCents, currency)} · Paid {formatMoney(preview.paidCents, currency)} · Due {formatMoney(preview.balanceCents, currency)}</p>}</div>{mode === "custom" ? payee.locked ? <div className="sm:text-right"><p className="text-xs text-muted-foreground">Final share · Locked</p><p className="mt-2 font-semibold">{formatMoney(payee.totalCents, currency)}</p></div> : <label className="flex w-40 flex-col gap-2 text-xs font-medium text-muted-foreground">Final share<Input inputMode="decimal" aria-label={`Custom amount for ${payee.displayName}`} disabled={pending || check.status !== "OPEN"} value={custom[payee.id] ?? centsToInput(check.guests.find((guest) => guest.id === payee.id)?.totalCents ?? 0)} className="h-11 w-full text-right text-foreground" onChange={(event) => { setCustom((current) => ({ ...current, [payee.id]: event.target.value })); touch(); }} /></label> : <strong className="text-lg sm:text-right">{formatMoney(preview?.totalCents ?? payee.totalCents, currency)}</strong>}</div>;
    })}</div>}
    {error && <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{error}</p>}
    {check.items.some((item) => item.allocations.length) && <p className="text-xs text-muted-foreground">This is a proposal. Your saved split stays in place until you confirm.</p>}
    <Button type="button" className="h-12" disabled={pending || !plan || check.status !== "OPEN"} onClick={() => void save()}>{pending ? "Saving…" : "Confirm & save split"}</Button>{touched && <span className="ml-3 text-xs text-muted-foreground">Unsaved proposal</span>}
  </section>;
}


