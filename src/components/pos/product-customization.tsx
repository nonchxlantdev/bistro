"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/domain/money";
import type { CartProduct } from "@/lib/domain/cart";
import type { ProductDto } from "@/types/api";

export function ProductCustomization({ product, currency, onClose, onAdd }: { product: ProductDto; currency: string; onClose: () => void; onAdd: (product: CartProduct) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const groups = product.modifierGroups ?? [];
  const chosen = groups.flatMap((group) => group.options.filter((option) => selected.includes(option.id)).map((option) => ({ optionId: option.id, groupName: group.name, optionName: option.name, priceDeltaCents: option.priceDeltaCents })));
  const priceCents = product.priceCents + chosen.reduce((sum, option) => sum + option.priceDeltaCents, 0);
  function confirm() {
    for (const group of groups) {
      const count = group.options.filter((option) => selected.includes(option.id)).length;
      if (count < group.minSelect || count > group.maxSelect) { setError(`Choose ${group.minSelect}–${group.maxSelect} options for ${group.name}.`); return; }
    }
    onAdd({ id: product.id, name: product.name, priceCents, modifierOptionIds: selected, modifiers: chosen, instructions: instructions.trim() });
    onClose();
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{product.name}</DialogTitle><DialogDescription>Choose options and add any kitchen instructions.</DialogDescription></DialogHeader>
      <div className="space-y-4">{groups.map((group) => <fieldset key={group.id} className="space-y-2">
        <legend className="font-semibold">{group.name}</legend><p className="text-xs text-muted-foreground">{group.minSelect ? `Required · Choose ${group.minSelect}–${group.maxSelect}` : `Optional · Choose up to ${group.maxSelect}`}</p>
        {group.options.map((option) => <label key={option.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3">
          <input type={group.maxSelect === 1 ? "radio" : "checkbox"} name={group.id} checked={selected.includes(option.id)} onChange={(event) => {
            setError("");
            const checked = event.target.checked;
            setSelected((current) => group.maxSelect === 1 ? [...current.filter((id) => !group.options.some((entry) => entry.id === id)), ...(checked ? [option.id] : [])] : checked ? [...current, option.id] : current.filter((id) => id !== option.id));
          }} />
          <span className="flex-1">{option.name}</span><span className="text-muted-foreground">{option.priceDeltaCents ? `${option.priceDeltaCents > 0 ? "+" : ""}${formatMoney(option.priceDeltaCents, currency)}` : "Included"}</span>
        </label>)}
        {group.maxSelect === 1 && group.minSelect === 0 && group.options.some((option) => selected.includes(option.id)) && <Button type="button" variant="ghost" onClick={() => setSelected((current) => current.filter((id) => !group.options.some((option) => option.id === id)))}>Clear selection</Button>}
      </fieldset>)}
      <label className="block text-sm">Special instructions<Textarea maxLength={300} value={instructions} placeholder="e.g. no onions" onChange={(event) => setInstructions(event.target.value)} /></label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button type="button" className="h-12 w-full" onClick={confirm}>Add to order · {formatMoney(priceCents, currency)}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
