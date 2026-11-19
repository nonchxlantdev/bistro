"use client";

import { useMemo, useState } from "react";
import { Banknote, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import { quoteTender, tipForPercent, type TenderMethod } from "@/lib/domain/tender";

export type TipChoice = { kind: "none" } | { kind: "percent"; percent: number } | { kind: "custom" };
export type PaymentDraft = {
  method: TenderMethod | null;
  tip: TipChoice;
  customTip: string;
  customTipMode: "amount" | "percent";
  cash: string;
};
export const emptyPaymentDraft = (): PaymentDraft => ({ method: null, tip: { kind: "none" }, customTip: "", customTipMode: "percent", cash: "" });

/** Works out the tip, what to collect and the change, and whether the draft can be submitted. */
export function resolvePayment(draft: PaymentDraft, amountCents: number) {
  let tipCents: number | null = 0;
  if (draft.tip.kind === "percent") tipCents = tipForPercent(amountCents, draft.tip.percent);
  if (draft.tip.kind === "custom") {
    if (!draft.customTip.trim()) tipCents = 0;
    else if (draft.customTipMode === "percent") { const value = Number(draft.customTip); tipCents = Number.isFinite(value) && value >= 0 ? tipForPercent(amountCents, value) : null; }
    else tipCents = parseMoneyToCents(draft.customTip);
  }
  const collect = amountCents + (tipCents ?? 0);
  const tendered = draft.method === "CARD" ? collect : parseMoneyToCents(draft.cash);
  let error = "";
  let changeCents = 0;
  if (!draft.method) error = "Choose cash or card.";
  else if (tipCents === null) error = "Enter a valid tip.";
  else if (draft.method === "CASH" && (tendered === null || !draft.cash.trim())) error = "Enter the cash received.";
  else {
    try { changeCents = quoteTender({ amountCents, tipCents, method: draft.method, tenderedCents: tendered ?? 0 }).changeCents; }
    catch (e) { error = e instanceof Error ? e.message : "Check the payment."; }
  }
  return { method: draft.method, tipCents: tipCents ?? 0, collectCents: collect, tenderedCents: tendered ?? 0, changeCents, error, ready: !error };
}

const segment = "flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";
const on = "border-primary bg-primary text-primary-foreground";
const off = "border-border bg-card text-foreground hover:bg-hover";

export function PaymentFields({ amountCents, currency, tipsEnabled = true, tipPresets = [5, 8, 10, 15], draft, onChange, disabled = false }: {
  amountCents: number; currency: string; tipsEnabled?: boolean; tipPresets?: number[];
  draft: PaymentDraft; onChange: (draft: PaymentDraft) => void; disabled?: boolean;
}) {
  const money = (cents: number) => formatMoney(cents, currency);
  const result = useMemo(() => resolvePayment(draft, amountCents), [draft, amountCents]);
  const set = (patch: Partial<PaymentDraft>) => onChange({ ...draft, ...patch });
  const [showTip, setShowTip] = useState(draft.tip.kind !== "none");

  return <fieldset disabled={disabled} className="min-w-0 space-y-6">
    <div>
      <legend className="mb-2 text-sm font-medium">Paid with</legend>
      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
        {([["CASH", "Cash", Banknote], ["CARD", "Card", CreditCard]] as const).map(([value, label, Icon]) =>
          <button key={value} type="button" role="radio" aria-checked={draft.method === value} className={`${segment} h-14 text-base ${draft.method === value ? on : off}`} onClick={() => set({ method: value })}><Icon className="size-4" aria-hidden />{label}</button>)}
      </div>
    </div>

    {tipsEnabled && <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Add a tip?</p>
        {result.tipCents > 0 && <p className="text-sm tabular-nums text-muted-foreground">Tip {money(result.tipCents)}</p>}
      </div>
      {!showTip
        ? <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${segment} ${on}`} aria-pressed onClick={() => set({ tip: { kind: "none" } })}>No tip</button>
            <button type="button" className={`${segment} ${off}`} onClick={() => setShowTip(true)}>Yes, add tip</button>
          </div>
        : <div className="space-y-2">
            <div role="radiogroup" aria-label="Tip" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <button type="button" role="radio" aria-checked={draft.tip.kind === "none"} className={`${segment} ${draft.tip.kind === "none" ? on : off}`} onClick={() => { set({ tip: { kind: "none" } }); setShowTip(false); }}>None</button>
              {tipPresets.map((percent) => {
                const active = draft.tip.kind === "percent" && draft.tip.percent === percent;
                return <button key={percent} type="button" role="radio" aria-checked={active} className={`${segment} flex-col gap-0 py-1.5 ${active ? on : off}`} onClick={() => set({ tip: { kind: "percent", percent } })}>
                  <span>{percent}%</span><span className={`text-[11px] font-normal tabular-nums ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{centsToInput(tipForPercent(amountCents, percent))}</span>
                </button>;
              })}
              <button type="button" role="radio" aria-checked={draft.tip.kind === "custom"} className={`${segment} ${draft.tip.kind === "custom" ? on : off}`} onClick={() => set({ tip: { kind: "custom" } })}>Custom</button>
            </div>
            {draft.tip.kind === "custom" && <div className="flex gap-2">
              <Input aria-label="Custom tip" inputMode="decimal" autoFocus value={draft.customTip} placeholder={draft.customTipMode === "percent" ? "12" : "5.00"} onChange={(event) => set({ customTip: event.target.value })} className="h-12 flex-1 text-lg" />
              <div role="radiogroup" aria-label="Custom tip type" className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
                {(["percent", "amount"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={draft.customTipMode === mode} className={`min-w-11 rounded-md px-3 text-sm font-medium ${draft.customTipMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-hover"}`} onClick={() => set({ customTipMode: mode })}>{mode === "percent" ? "%" : "$"}</button>)}
              </div>
            </div>}
          </div>}
    </div>}

    {draft.method === "CASH" && <div>
      <label className="block text-sm font-medium" htmlFor="payment-cash">Cash received</label>
      <Input id="payment-cash" inputMode="decimal" value={draft.cash} placeholder="0.00" onChange={(event) => set({ cash: event.target.value })} className="mt-2 h-12 text-lg tabular-nums" />
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[0, 500, 1000, 2000].map((extra) => <button key={extra} type="button" className={`${segment} ${off} min-h-11`} onClick={() => set({ cash: centsToInput(result.collectCents + extra) })}>{extra ? `+${extra / 100}` : "Exact"}</button>)}
      </div>
    </div>}

    <dl className="space-y-2 border-t border-border pt-4 text-sm tabular-nums">
      <div className="flex justify-between text-muted-foreground"><dt>Bill</dt><dd>{money(amountCents)}</dd></div>
      {tipsEnabled && <div className="flex justify-between text-muted-foreground"><dt>Tip</dt><dd>{money(result.tipCents)}</dd></div>}
      <div className="flex items-baseline justify-between pt-1"><dt className="font-medium">{draft.method === "CARD" ? "Charge to card" : "To collect"}</dt><dd className="text-2xl font-semibold">{money(result.collectCents)}</dd></div>
      {draft.method === "CASH" && <div className="flex items-baseline justify-between"><dt className="font-medium">Change</dt><dd className="text-2xl font-semibold">{money(result.changeCents)}</dd></div>}
      {draft.method === "CARD" && <p className="text-xs text-muted-foreground">Run {money(result.collectCents)} on the card machine, then confirm here.</p>}
    </dl>
  </fieldset>;
}
