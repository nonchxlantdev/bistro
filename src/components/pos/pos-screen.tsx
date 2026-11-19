"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { CategoryTabs } from "@/components/pos/category-tabs";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { TableOrderDialog } from "@/components/tables/table-order-dialog";
import { OrderCart } from "@/components/pos/order-cart";
import { ProductGrid } from "@/components/pos/product-grid";
import { ProductSearch } from "@/components/pos/product-search";
import { ProductCustomization } from "@/components/pos/product-customization";
import { ConfirmationDialog } from "@/components/states/confirmation-dialog";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { showFirstUseTip } from "@/lib/first-use-tips";
import { calculateOrderTotals } from "@/lib/domain/totals";
import { centsToInput, parseMoneyToCents } from "@/lib/domain/money";
import { formatMoney } from "@/lib/domain/money";
import { usePosStore } from "@/stores/pos-store";
import type { CatalogDto, OrderDto, ProductDto, SettingsDto, TableDto } from "@/types/api";
import type { CartProduct } from "@/lib/domain/cart";

export function PosScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const tableId = params.get("tableId");
  const store = usePosStore();
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [tables, setTables] = useState<TableDto[]>([]);
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tableCheckout, setTableCheckout] = useState<TableDto | null>(null);
  const [paying, setPaying] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [confirm, setConfirm] = useState<"clear" | "cancel" | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [customizing, setCustomizing] = useState<ProductDto | null>(null);

  useEffect(() => {
    let cancel = false;
    async function loadContext() {
      try {
        const [nextCatalog, nextTables, nextSettings] = await Promise.all([
          api<CatalogDto>("/api/catalog"),
          api<TableDto[]>("/api/tables"),
          api<SettingsDto>("/api/settings"),
        ]);
        if (cancel) return;
        setCatalog(nextCatalog);
        setTables(nextTables);
        setSettings(nextSettings);
      } catch (loadError) {
        if (!cancel) setError(loadError instanceof Error ? loadError.message : "Could not load the menu.");
      }
    }
    loadContext();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    async function openTicket() {
      setLoading(true);
      setError("");
      try {
        const state = usePosStore.getState();
        if (orderId) {
          // Returning to the same ticket must not replace edits held in the cart.
          if (state.dirty && state.orderId === orderId) return;
          if (state.dirty && state.orderId !== orderId) {
            const discard = window.confirm("You have unsaved changes. Discard them and open this order?");
            if (!discard) {
              router.replace(state.orderId ? `/pos?orderId=${state.orderId}` : "/pos");
              return;
            }
          }
          const order = await api<OrderDto>(`/api/orders/${orderId}`);
          if (cancel) return;
          usePosStore.getState().loadOrder(order);
          setDiscountInput(order.discountCents ? centsToInput(order.discountCents) : "");
        } else if (tableId) {
          const table = await api<TableDto>(`/api/tables/${tableId}`);
          if (cancel) return;
          if (table.order) {
            router.replace(`/pos?orderId=${table.order.id}`);
            return;
          }
          if (state.tableId !== table.id || state.orderId) {
            if (state.dirty) {
              const discard = window.confirm("You have unsaved changes. Start a new order for this table?");
              if (!discard) {
                router.replace(state.orderId ? `/pos?orderId=${state.orderId}` : "/pos");
                return;
              }
            }
            usePosStore.getState().startNew({ orderType: "DINE_IN", tableId: table.id, tableName: table.name });
            setDiscountInput("");
          }
        } else if (!usePosStore.getState().hydrated) {
          usePosStore.getState().startNew({ orderType: "TAKEAWAY" });
          setDiscountInput("");
        }
      } catch (loadError) {
        if (!cancel) setError(loadError instanceof Error ? loadError.message : "Could not open the order.");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    openTicket();
    return () => {
      cancel = true;
    };
  }, [orderId, tableId, router]);

  const currency = settings?.currency ?? "BZD";
  const locked = store.status !== "OPEN";
  const editingLocked = locked || (store.kitchenServed && !store.additionMode);
  const filtered = useMemo(() => {
    const products = catalog?.products ?? [];
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = categoryId === "all" || product.categoryId === categoryId;
      const searchMatch = !needle || product.name.toLowerCase().includes(needle);
      return categoryMatch && searchMatch;
    });
  }, [catalog, categoryId, query]);

  function totals() {
    if (store.lines.length === 0) {
      return { subtotalCents: 0, discountCents: 0, totalCents: 0 };
    }
    return calculateOrderTotals(store.lines, store.discountCents);
  }

  function updateDiscount(value: string) {
    setDiscountInput(value);
    if (!value.trim()) {
      store.setDiscountCents(0);
      return;
    }
    const cents = parseMoneyToCents(value);
    if (cents === null) return;
    store.setDiscountCents(cents);
  }

  function guardOpen() {
    if (editingLocked) {
      toast.error(store.kitchenServed && !locked ? "This served order cannot be changed yet." : "This order is closed and cannot be changed.");
      return false;
    }
    return true;
  }

  function addProduct(product: CartProduct) {
    if (!guardOpen()) return;
    try {
      store.add(product);
    } catch (addError) {
      toast.error(addError instanceof Error ? addError.message : "Could not add that product.");
    }
  }

  async function save() {
    if (!guardOpen()) return null;
    if (store.lines.length === 0) {
      toast.error("Add a product before saving.");
      return null;
    }
    if (store.orderType === "DINE_IN" && !store.tableId) {
      toast.error("Select a table for dine-in orders.");
      return null;
    }
    let priced;
    try {
      priced = totals();
    } catch (totalError) {
      toast.error(totalError instanceof Error ? totalError.message : "Check the order total.");
      return null;
    }
    setSaving(true);
    try {
      const saved = await api<OrderDto>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          orderId: store.orderId ?? undefined,
          version: store.orderId ? store.version : undefined,
          orderType: store.orderType,
          tableId: store.orderType === "DINE_IN" ? store.tableId : null,
          discountCents: priced.discountCents,
          supportsCustomizations: true,
          additionsOnly: store.kitchenServed && store.additionMode,
          items: store.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, itemId: line.itemId, modifierOptionIds: line.modifierOptionIds, instructions: line.instructions })),
        }),
      });
      store.loadOrder(saved);
      setDiscountInput(saved.discountCents ? centsToInput(saved.discountCents) : "");
      router.replace(`/pos?orderId=${saved.id}`);
      toast.success(`Saved ${saved.orderNumber}`);
      setTables(await api<TableDto[]>("/api/tables"));
      return saved;
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save the order.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function checkout() {
    try {
    const saved = store.orderId && !store.dirty ? await api<OrderDto>(`/api/orders/${store.orderId}`) : await save();
    if (!saved) return;
    if (saved.status !== "OPEN") {
      toast.error("This order is already closed.");
      return;
    }
    store.loadOrder(saved);
    if (saved.orderType === "DINE_IN" && saved.tableId) {
      const table = await api<TableDto>(`/api/tables/${saved.tableId}`);
      if (table.order?.id !== saved.id) throw new Error("This table changed. Reload it before checkout.");
      setTableCheckout(table); setCartOpen(false); return;
    }
    setIdempotencyKey(crypto.randomUUID());
    setCheckoutOpen(true);
    setCartOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not open checkout."); }
  }

  async function closeTableCheckout() {
    const id = tableCheckout?.order?.id;
    setTableCheckout(null);
    if (!id) return;
    try {
      const latest = await api<OrderDto>(`/api/orders/${id}`);
      if (latest.status === "COMPLETED") { store.startNew({ orderType: "TAKEAWAY" }); setDiscountInput(""); router.replace("/pos"); }
      else store.loadOrder(latest);
      setTables(await api<TableDto[]>("/api/tables"));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not refresh the order."); }
  }

  async function pay(tenderedCents: number) {
    if (!store.orderId) return;
    setPaying(true);
    try {
      const paid = await api<OrderDto>(`/api/orders/${store.orderId}/checkout`, {
        method: "POST",
        body: JSON.stringify({ tenderedCents, idempotencyKey, version: store.version }),
      });
      store.loadOrder(paid);
      toast.success(`${paid.orderNumber} paid`);
      return { changeCents: paid.payment?.changeCents ?? 0 };
    } catch (payError) {
      toast.error(payError instanceof Error ? payError.message : "Checkout failed.");
      throw payError;
    } finally {
      setPaying(false);
    }
  }

  async function cancelOrder() {
    if (!store.orderId) return;
    setSaving(true);
    try {
      await api(`/api/orders/${store.orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ version: store.version }),
      });
      toast.success("Order cancelled");
      store.startNew({ orderType: "TAKEAWAY" });
      setDiscountInput("");
      setConfirm(null);
      router.replace("/tables");
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : "Could not cancel the order.");
    } finally {
      setSaving(false);
    }
  }

  const cart = (
    <OrderCart
      orderNumber={store.orderNumber}
      orderType={store.orderType}
      tableId={store.tableId}
      tables={tables}
      lines={store.lines}
      discountCents={store.discountCents}
      discountInput={discountInput}
      currency={currency}
      locked={locked}
      editingLocked={editingLocked}
      additionsOnly={store.kitchenServed}
      saving={saving}
      onOrderType={store.setOrderType}
      onTable={(nextId) => {
        const table = tables.find((entry) => entry.id === nextId);
        if (store.orderId && store.tableId && nextId !== store.tableId && !window.confirm(`Transfer this order to ${table?.name ?? "the selected table"}? Save the order to complete the transfer.`)) return;
        store.setTable(nextId || null, table?.name ?? null);
      }}
      onDiscountInput={updateDiscount}
      onIncrement={(productId) => guardOpen() && store.increment(productId)}
      onDecrement={(productId) => guardOpen() && store.decrement(productId)}
      onRemove={(productId) => guardOpen() && store.remove(productId)}
      onClear={() => setConfirm("clear")}
      onCancel={() => setConfirm("cancel")}
      onSave={() => void save()}
      onCheckout={() => void checkout()}
      onSplit={() => void (async () => {
        const saved = store.orderId && !store.dirty ? { id: store.orderId } : await save();
        if (saved) router.push(`/orders/${saved.id}/split`);
      })()}
      onKitchen={() => void (async () => {
        const saved = store.orderId && !store.dirty ? { id: store.orderId, version: store.version } : await save();
        if (!saved) return;
        const key = `sora-kitchen:${saved.id}:${saved.version}`;
        const idempotencyKey = sessionStorage.getItem(key) ?? crypto.randomUUID();
        sessionStorage.setItem(key, idempotencyKey);
        setSaving(true);
        try {
          const result = await api<{ created: boolean }>(`/api/orders/${saved.id}/kitchen`, { method: "POST", body: JSON.stringify({ version: saved.version, idempotencyKey }) });
          sessionStorage.removeItem(key);
          store.loadOrder(await api<OrderDto>(`/api/orders/${saved.id}`));
          store.finishAdditions();
          toast.success(result.created ? "Sent to kitchen" : "No new changes to send");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send to kitchen."); }
        finally { setSaving(false); }
      })()}
    />
  );

  if (loading && !catalog) return <LoadingState label="Opening the register" />;

  const itemCount = store.lines.reduce((sum, line) => sum + line.quantity, 0);
  let due = 0;
  try {
    due = totals().totalCents;
  } catch {
    due = 0;
  }

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-border px-4 py-4 md:px-6">
          {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {editingLocked ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              {store.kitchenServed && !locked ? "Served items are locked. Add new items to this order or settle the bill." : `This order is ${store.status.toLowerCase()} and is read-only.`}
            </p>
          ) : null}
          <ProductSearch value={query} onChange={setQuery} />
          <CategoryTabs categories={catalog?.categories ?? []} value={categoryId} onChange={setCategoryId} />
        </div>
        {store.additionMode && !locked && <p className="px-4 pt-3 text-sm font-medium text-primary md:px-6">Adding to {store.orderNumber} · Only new items will be sent to the kitchen.</p>}
        <div className="relative min-h-0 flex-1">
        <div className={`h-full overflow-y-auto px-4 py-4 pb-24 md:px-6 lg:pb-4 ${store.kitchenServed && editingLocked && !locked ? "grayscale opacity-40" : ""}`}>
          <ProductGrid products={filtered} currency={currency} disabled={editingLocked} onAdd={(product) => setCustomizing(product)} />
        </div>
        {store.kitchenServed && editingLocked && !locked && <div className="absolute inset-0 flex items-center justify-center bg-background/30"><Button type="button" className="h-14 px-7 text-base shadow-lg" onClick={() => { store.beginAdditions(); showFirstUseTip("additions"); }}>Add to this order</Button></div>}
        </div>
      </section>
      <aside className="hidden w-[350px] shrink-0 border-l border-border lg:block min-[1440px]:w-[380px]">{cart}</aside>
      <Button
        type="button"
        className="fixed right-4 bottom-4 z-30 h-14 rounded-full px-5 shadow-lg lg:hidden"
        onClick={() => setCartOpen(true)}
      >
        <ShoppingBag />
        {itemCount} · {formatMoney(due, currency)}
      </Button>
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-[420px]">
          <SheetHeader className="sr-only">
            <SheetTitle>Current order</SheetTitle>
          </SheetHeader>
          {cart}
        </SheetContent>
      </Sheet>
      <CheckoutDialog
        open={checkoutOpen}
        orderNumber={store.orderNumber ?? "New order"}
        subtotalCents={store.lines.length ? safeTotals(store.lines, store.discountCents).subtotalCents : 0}
        discountCents={store.lines.length ? safeTotals(store.lines, store.discountCents).discountCents : 0}
        totalCents={due}
        currency={currency}
        receiptFooter={settings?.receiptFooter ?? ""}
        pending={paying}
        onOpenChange={(open) => {
          setCheckoutOpen(open);
          if (!open && store.status === "COMPLETED") {
            store.startNew({ orderType: "TAKEAWAY" });
            setDiscountInput("");
            router.replace("/pos");
          }
        }}
        onConfirm={pay}
      />
      {tableCheckout?.order && <TableOrderDialog table={tableCheckout} currency={currency} initialView="checkout" onClose={() => void closeTableCheckout()} />}
      {customizing && <ProductCustomization key={customizing.id} product={customizing} currency={currency} onClose={() => setCustomizing(null)} onAdd={addProduct} />}
      <ConfirmationDialog
        open={confirm !== null}
        title={confirm === "cancel" ? "Cancel this order?" : "Clear this cart?"}
        description={
          confirm === "cancel"
            ? "The order will be marked cancelled and the table will become available."
            : "Unsaved items will be removed from this cart."
        }
        confirmLabel={confirm === "cancel" ? "Cancel order" : "Clear cart"}
        destructive
        pending={saving}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm === "clear") {
            store.clear();
            setDiscountInput("");
            setConfirm(null);
          } else {
            void cancelOrder();
          }
        }}
      />
    </div>
  );
}

function safeTotals(lines: { productId: string; name: string; unitPriceCents: number; quantity: number }[], discountCents: number) {
  try {
    return calculateOrderTotals(lines, discountCents);
  } catch {
    return { subtotalCents: 0, discountCents: 0, totalCents: 0 };
  }
}

