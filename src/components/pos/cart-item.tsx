"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/domain/money";
import { lineTotalCents } from "@/lib/domain/totals";
import type { CartLine } from "@/lib/domain/cart";

export function CartItem({
  line,
  currency,
  disabled,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: CartLine;
  currency: string;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium leading-snug">{line.name}</p>
          {(line.isAddition || line.locked) && <p className="text-xs font-medium text-primary">{line.isAddition ? "Addition" : "Original order"}{line.locked ? " · Locked" : ""}</p>}
          <p className="text-xs text-muted-foreground">{formatMoney(line.unitPriceCents, currency)} each</p>
          {line.modifiers?.map((modifier, index) => <p key={`${modifier.optionId}-${index}`} className="text-xs text-muted-foreground">{modifier.optionName}{modifier.priceDeltaCents ? ` · ${modifier.priceDeltaCents > 0 ? "+" : ""}${formatMoney(modifier.priceDeltaCents, currency)}` : ""}</p>)}
          {line.instructions && <p className="text-xs text-muted-foreground">Note: {line.instructions}</p>}
        </div>
        <p className="font-medium">{formatMoney(lineTotalCents(line.unitPriceCents, line.quantity), currency)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="size-10" disabled={disabled} onClick={onDecrement} aria-label={`Decrease ${line.name}`}>
            <Minus />
          </Button>
          <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
          <Button type="button" variant="outline" size="icon" className="size-10" disabled={disabled} onClick={onIncrement} aria-label={`Increase ${line.name}`}>
            <Plus />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-10" disabled={disabled} onClick={onRemove} aria-label={`Remove ${line.name}`}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
