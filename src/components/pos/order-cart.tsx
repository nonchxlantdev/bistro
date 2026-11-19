"use client";
import { CartItem } from "@/components/pos/cart-item";
import { OrderTypeSelector } from "@/components/pos/order-type-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/domain/money";
import { calculateOrderTotals } from "@/lib/domain/totals";
import { cartLineKey, type CartLine } from "@/lib/domain/cart";
import type { OrderType, TableDto } from "@/types/api";

export function OrderCart({ orderNumber, orderType, tableId, tables, lines, discountCents, discountInput, currency, locked, editingLocked, additionsOnly, saving, onOrderType, onTable, onDiscountInput, onIncrement, onDecrement, onRemove, onClear, onCancel, onSave, onCheckout, onSplit, onKitchen }: {
  orderNumber: string | null; orderType: OrderType; tableId: string | null; tables: TableDto[]; lines: CartLine[]; discountCents: number; discountInput: string; currency: string; locked: boolean; editingLocked: boolean; additionsOnly: boolean; saving: boolean;
  onOrderType: (value: OrderType) => void; onTable: (id: string) => void; onDiscountInput: (value: string) => void; onIncrement: (id: string) => void; onDecrement: (id: string) => void; onRemove: (id: string) => void; onClear: () => void; onCancel: () => void; onSave: () => void; onCheckout: () => void; onSplit: () => void; onKitchen: () => void;
}) {
  let totals = { subtotalCents: 0, discountCents: 0, totalCents: 0 };
  let discountError = "";
  if (lines.length) { try { totals = calculateOrderTotals(lines, discountCents); } catch (e) { totals = calculateOrderTotals(lines, 0); discountError = e instanceof Error ? e.message : "Check the discount."; } }
  const selectable = tables.filter((table) => table.status === "AVAILABLE" || table.id === tableId);
  const groups = [{ title: additionsOnly ? "Previously ordered" : "Items", entries: lines.filter((line) => !line.isAddition) }, { title: "Additions", entries: lines.filter((line) => line.isAddition) }];
  return <div className="flex h-full min-h-0 flex-col bg-card">
    <div className="shrink-0 space-y-3 border-b border-border p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Current order</p><h2 className="mt-1 text-xl font-medium">{orderNumber ?? "New check"}</h2></div><span className="status-chip status-served">{lines.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
      <OrderTypeSelector value={orderType} disabled={editingLocked || additionsOnly} onChange={onOrderType} />
      {orderType === "DINE_IN" ? <label className="flex items-center gap-3 text-sm"><span className="text-muted-foreground">Table</span><select value={tableId ?? ""} disabled={editingLocked || additionsOnly} onChange={(event) => onTable(event.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select a table</option>{selectable.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.capacity} seats</option>)}</select></label> : <p className="text-xs text-muted-foreground">Takeaway · No table required</p>}
    </div>
    <div className="min-h-[80px] flex-1 overflow-y-auto p-4">
      {!lines.length && <div className="py-8 text-center"><p className="font-heading text-xl">Start something good.</p><p className="mt-2 text-sm text-muted-foreground">Choose a dish or drink from the menu.</p></div>}
      {groups.filter((group) => group.entries.length).map((group) => <section key={group.title} className="mb-4 last:mb-0"><h3 className="mb-2 text-xs font-semibold text-muted-foreground">{group.title}</h3><div className="space-y-2">{group.entries.map((line) => <CartItem key={cartLineKey(line)} line={line} currency={currency} disabled={editingLocked || line.locked} onIncrement={() => onIncrement(cartLineKey(line))} onDecrement={() => onDecrement(cartLineKey(line))} onRemove={() => onRemove(cartLineKey(line))} />)}</div></section>)}
    </div>
    <div className="shrink-0 space-y-3 border-t border-border bg-background/45 p-4">
      <details className="text-sm"><summary className="cursor-pointer py-1 text-muted-foreground">Discount {discountCents ? "· " + formatMoney(discountCents, currency) : ""}</summary><Input className="mt-2 h-11 bg-card" value={discountInput} disabled={editingLocked || additionsOnly} inputMode="decimal" placeholder="0.00" aria-label="Discount amount" onChange={(event) => onDiscountInput(event.target.value)} /></details>
      {discountError && <p role="alert" className="text-sm text-destructive">{discountError}</p>}
      <dl className="space-y-1.5 text-sm"><div className="flex justify-between text-muted-foreground"><dt>Subtotal</dt><dd>{formatMoney(totals.subtotalCents, currency)}</dd></div>{totals.discountCents > 0 && <div className="flex justify-between text-muted-foreground"><dt>Discount</dt><dd>−{formatMoney(totals.discountCents, currency)}</dd></div>}<div className="flex items-center justify-between pt-1"><dt className="font-semibold">Total due</dt><dd className="text-2xl font-semibold tracking-tight">{formatMoney(totals.totalCents, currency)}</dd></div></dl>
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-11 px-2" disabled={editingLocked || saving || !lines.length} onClick={onSave}>{saving ? "Saving…" : additionsOnly ? "Save additions" : "Save order"}</Button><Button variant="secondary" className="h-11 px-2" disabled={editingLocked || saving || !lines.length} onClick={onKitchen}>{additionsOnly ? "Send additions" : "Send to kitchen"}</Button></div>
      <div className={orderType === "DINE_IN" ? "grid grid-cols-[0.8fr_1.2fr] gap-2" : ""}>{orderType === "DINE_IN" && <Button variant="outline" className="h-12" disabled={locked || saving || !lines.length} onClick={onSplit}>Split bill</Button>}<Button className="h-12 w-full text-base" disabled={locked || saving || !lines.length} onClick={onCheckout}>Checkout</Button></div>
      <div className="flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">Cash only · Tax not configured</p><button type="button" className="min-h-8 text-xs text-muted-foreground underline underline-offset-2 disabled:opacity-40" disabled={editingLocked || additionsOnly || saving || !lines.length} onClick={orderNumber ? onCancel : onClear}>{orderNumber ? "Cancel order" : "Clear cart"}</button></div>
    </div>
  </div>;
}

