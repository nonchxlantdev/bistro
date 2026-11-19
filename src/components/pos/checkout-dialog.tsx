"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { quoteCashPayment } from "@/lib/domain/checkout";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";

export function CheckoutDialog({
  open,
  orderNumber,
  subtotalCents,
  discountCents,
  totalCents,
  currency,
  receiptFooter,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  orderNumber: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  receiptFooter: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (tenderedCents: number) => Promise<{ changeCents: number } | void>;
}) {
  const [cashInput, setCashInput] = useState("");
  const [error, setError] = useState("");
  const [changeCents, setChangeCents] = useState<number | null>(null);

  const tenderedCents = parseMoneyToCents(cashInput);
  const quote = useMemo(() => {
    if (tenderedCents === null) return null;
    return quoteCashPayment(totalCents, tenderedCents);
  }, [tenderedCents, totalCents]);

  function applyAmount(cents: number) {
    setCashInput(centsToInput(cents));
    setError("");
    setChangeCents(null);
  }

  async function confirm() {
    setError("");
    if (tenderedCents === null || !quote) {
      setError("Enter the cash received.");
      return;
    }
    if (!quote.ok) {
      setError(quote.message);
      return;
    }
    try {
      const result = await onConfirm(tenderedCents);
      if (result) setChangeCents(result.changeCents);
    } catch {
      setError("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setCashInput("");
          setError("");
          setChangeCents(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{changeCents === null ? "Cash checkout" : "Sale complete"}</DialogTitle>
          <DialogDescription>
            {orderNumber} · Cash only. Card payments are not part of this version.
          </DialogDescription>
        </DialogHeader>

        {changeCents === null ? (
          <div className="space-y-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatMoney(subtotalCents, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd>{formatMoney(discountCents, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd>Not configured</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total due</dt>
                <dd>{formatMoney(totalCents, currency)}</dd>
              </div>
            </dl>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted-foreground">Cash received</span>
              <Input
                value={cashInput}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Cash received"
                className="h-12 rounded-xl text-lg"
                onChange={(event) => {
                  setCashInput(event.target.value);
                  setError("");
                }}
              />
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 500, 1000, 2000].map((extra) => (
                <Button key={extra} type="button" variant="outline" className="h-11" onClick={() => applyAmount(totalCents + extra)}>
                  {extra === 0 ? "Exact" : `+${extra / 100}`}
                </Button>
              ))}
            </div>
            <p className="text-sm">
              Change due:{" "}
              <span className="font-semibold">
                {quote?.ok ? formatMoney(quote.changeCents, currency) : formatMoney(0, currency)}
              </span>
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <p className="text-xs text-muted-foreground">This prototype does not calculate tax and is not tax-compliant.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-primary/10 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Change due</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{formatMoney(changeCents, currency)}</p>
            {receiptFooter ? <p className="mt-4 text-sm text-muted-foreground">{receiptFooter}</p> : null}
          </div>
        )}

        <DialogFooter>
          {changeCents === null ? (
            <Button type="button" className="h-11" disabled={pending} onClick={confirm}>
              {pending ? "Completing…" : "Complete sale"}
            </Button>
          ) : (
            <Button type="button" className="h-11" onClick={() => {
              setCashInput("");
              setError("");
              setChangeCents(null);
              onOpenChange(false);
            }}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
