"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentFields, emptyPaymentDraft, resolvePayment, type PaymentDraft } from "@/components/orders/payment-fields";
import { formatMoney } from "@/lib/domain/money";
import type { TenderMethod } from "@/lib/domain/tender";

export type CheckoutPayment = { method: TenderMethod; tipCents: number; tenderedCents: number };
type Result = { changeCents: number; tipCents: number; method: string; collectedCents: number };

export function CheckoutDialog({ open, orderNumber, subtotalCents, discountCents, totalCents, currency, receiptFooter, tipsEnabled = true, tipPresets, pending, onOpenChange, onConfirm }: {
  open: boolean; orderNumber: string; subtotalCents: number; discountCents: number; totalCents: number; currency: string; receiptFooter: string;
  tipsEnabled?: boolean; tipPresets?: number[]; pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payment: CheckoutPayment) => Promise<Result | void>;
}) {
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Result | null>(null);
  const money = (cents: number) => formatMoney(cents, currency);
  const reset = () => { setDraft(emptyPaymentDraft()); setError(""); setDone(null); };

  async function confirm() {
    const payment = resolvePayment(draft, totalCents);
    if (!payment.ready || !payment.method) { setError(payment.error); return; }
    setError("");
    try {
      const result = await onConfirm({ method: payment.method, tipCents: payment.tipCents, tenderedCents: payment.tenderedCents });
      if (result) setDone(result);
    } catch { /* The caller shows the server message. */ }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (pending) return; if (!next) reset(); onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>{done ? "Payment recorded" : "Take payment"}</DialogTitle>
        <DialogDescription>{orderNumber}{discountCents ? ` · Subtotal ${money(subtotalCents)} · Discount ${money(discountCents)}` : ""}</DialogDescription>
      </DialogHeader>
      {!done
        ? <form id="checkout-payment" className="space-y-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
            <PaymentFields amountCents={totalCents} currency={currency} tipsEnabled={tipsEnabled} tipPresets={tipPresets} draft={draft} onChange={(next) => { setDraft(next); setError(""); }} disabled={pending} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </form>
        : <div className="border-y border-border py-6 text-center">
            <p className="text-sm text-muted-foreground">{done.method === "CARD" ? "Charged to card" : "Change due"}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums">{money(done.method === "CARD" ? done.collectedCents : done.changeCents)}</p>
            {done.tipCents > 0 && <p className="mt-2 text-sm text-muted-foreground">Includes {money(done.tipCents)} tip</p>}
            {receiptFooter && <p className="mt-4 text-sm text-muted-foreground">{receiptFooter}</p>}
          </div>}
      <DialogFooter>
        {!done
          ? <Button type="submit" form="checkout-payment" className="h-12 w-full" disabled={pending || !draft.method}>{pending ? "Recording…" : "Confirm payment"}</Button>
          : <Button type="button" className="h-12 w-full" onClick={() => { reset(); onOpenChange(false); }}>Done</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
