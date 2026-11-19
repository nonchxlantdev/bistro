"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import { quoteGuestPayment } from "@/lib/domain/split-bill";

export function CashPaymentFields({ balanceCents, currency, amount, cash, partial = false, disabled, onAmount, onCash }: { balanceCents: number; currency: string; amount: string; cash: string; partial?: boolean; disabled: boolean; onAmount: (value: string) => void; onCash: (value: string) => void }) {
  const applied = partial && amount.trim() ? parseMoneyToCents(amount) : balanceCents;
  const tendered = parseMoneyToCents(cash);
  let change: number | null = null;
  try { if (applied !== null && tendered !== null) change = quoteGuestPayment(balanceCents, applied, tendered).changeCents; } catch { /* Server validates again on submission. */ }
  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    {partial && <label className="block text-sm">Payment amount<Input aria-label="Guest payment amount" inputMode="decimal" value={amount} placeholder={centsToInput(balanceCents)} onChange={(event) => onAmount(event.target.value)} className="mt-1 h-12 text-lg" /><span className="mt-1 block text-xs text-muted-foreground">Leave blank for the full guest balance, or enter a partial payment.</span></label>}
    <label className="block text-sm">Cash received<Input aria-label={partial ? "Guest cash received" : "Table cash received"} inputMode="decimal" value={cash} placeholder="0.00" onChange={(event) => onCash(event.target.value)} className="mt-1 h-12 text-lg" /></label>
    <div className="grid grid-cols-4 gap-2">{[0, 500, 1000, 2000].map((extra) => <Button key={extra} type="button" variant="outline" className="h-11 px-1 text-xs" onClick={() => onCash(centsToInput((applied ?? balanceCents) + extra))}>{extra ? `+${extra / 100}` : "Exact cash"}</Button>)}</div>
    <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3 text-sm"><span>Change due</span><strong className="text-lg">{formatMoney(change ?? 0, currency)}</strong></div>
  </fieldset>;
}
