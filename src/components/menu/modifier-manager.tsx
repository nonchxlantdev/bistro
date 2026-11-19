"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import type { ProductDto } from "@/types/api";

type Option = { id?: string; name: string; price: string; isActive: boolean };
type Group = { id: string; name: string; minSelect: number; maxSelect: number; isActive: boolean; revision: string; productIds: string[]; options: Array<{ id: string; name: string; priceDeltaCents: number; isActive: boolean }> };
type Draft = { id?: string; revision?: string; name: string; minSelect: string; maxSelect: string; isActive: boolean; productIds: string[]; options: Option[] };

function signedInput(cents: number) { return `${cents < 0 ? "-" : ""}${centsToInput(Math.abs(cents))}`; }
function signedCents(value: string) {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const cents = parseMoneyToCents(negative ? trimmed.slice(1) : trimmed);
  return cents === null ? null : (negative ? -cents : cents);
}
function makeDraft(group?: Group): Draft {
  return group ? { id: group.id, revision: group.revision, name: group.name, minSelect: String(group.minSelect), maxSelect: String(group.maxSelect), isActive: group.isActive,
    productIds: group.productIds, options: group.options.map((option) => ({ id: option.id, name: option.name, price: signedInput(option.priceDeltaCents), isActive: option.isActive })) }
    : { name: "", minSelect: "0", maxSelect: "1", isActive: true, productIds: [], options: [{ name: "", price: "0.00", isActive: true }] };
}

export function ModifierManager({ products, currency }: { products: ProductDto[]; currency: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");

  async function load() {
    try { setGroups(await api<Group[]>("/api/modifiers")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load modifier groups."); }
  }
  useEffect(() => {
    let active = true;
    api<Group[]>("/api/modifiers").then((next) => { if (active) setGroups(next); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load modifier groups."); });
    return () => { active = false; };
  }, []);

  async function save() {
    if (!draft || pending) return;
    const minSelect = Number(draft.minSelect), maxSelect = Number(draft.maxSelect);
    if (!/^\d+$/.test(draft.minSelect) || !/^\d+$/.test(draft.maxSelect) || !Number.isSafeInteger(minSelect) || !Number.isSafeInteger(maxSelect)) { setError("Enter whole selection limits."); return; }
    const options = draft.options.map((option) => ({ id: option.id, name: option.name, priceDeltaCents: signedCents(option.price), isActive: option.isActive }));
    if (options.some((option) => option.priceDeltaCents === null)) { setError("Enter a valid adjustment for each option, such as 2.00 or -1.00."); return; }
    setPending(true); setError("");
    try {
      await api(draft.id ? `/api/modifiers/${draft.id}` : "/api/modifiers", { method: draft.id ? "PATCH" : "POST", body: JSON.stringify({
        name: draft.name, minSelect, maxSelect, isActive: draft.isActive, productIds: draft.productIds, revision: draft.revision, options,
      }) });
      setDraft(null); toast.success("Modifier group saved"); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the modifier group."); }
    finally { setPending(false); }
  }

  const visibleProducts = products.filter((product) => product.name.toLowerCase().includes(productSearch.toLowerCase()));
  return <section className="space-y-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Modifier groups</h2><p className="text-sm text-muted-foreground">Reusable choices, prices and product assignments.</p></div><Button className="h-11" onClick={() => { setError(""); setProductSearch(""); setDraft(makeDraft()); }}>Add group</Button></div>
    {error && !draft && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {!groups && !error && <p className="text-sm text-muted-foreground">Loading modifier groups…</p>}
    {groups?.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No modifier groups yet.</p>}
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{groups?.map((group) => <button key={group.id} type="button" onClick={() => { setError(""); setProductSearch(""); setDraft(makeDraft(group)); }} className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/50">
      <span className="flex justify-between gap-3 font-medium"><span>{group.name}</span><span className="text-xs text-muted-foreground">{group.isActive ? "Active" : "Hidden"}</span></span>
      <span className="mt-1 block text-sm text-muted-foreground">{group.options.filter((option) => option.isActive).length} active options · {group.productIds.length} products</span>
      <span className="mt-2 block text-xs text-muted-foreground">{group.options.filter((option) => option.isActive).map((option) => `${option.name} (${option.priceDeltaCents > 0 ? "+" : ""}${formatMoney(option.priceDeltaCents, currency)})`).join(" · ") || "No active options"}</span>
      <span className="mt-3 block text-xs font-semibold underline underline-offset-4">Edit group</span>
    </button>)}</div>
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !pending) { setDraft(null); setError(""); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{draft?.id ? "Edit modifier group" : "New modifier group"}</DialogTitle><DialogDescription>Changes apply to every assigned product. Existing order snapshots keep their original names and prices.</DialogDescription></DialogHeader>
        {draft && <div className="space-y-4">
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <label className="block text-sm">Group name<Input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Minimum choices<Input inputMode="numeric" value={draft.minSelect} onChange={(event) => setDraft({ ...draft, minSelect: event.target.value })} /></label><label className="text-sm">Maximum choices<Input inputMode="numeric" value={draft.maxSelect} onChange={(event) => setDraft({ ...draft, maxSelect: event.target.value })} /></label></div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />Available on the register</label>
          <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Options</h3><Button type="button" variant="outline" onClick={() => setDraft({ ...draft, options: [...draft.options, { name: "", price: "0.00", isActive: true }] })}>Add option</Button></div>
            <div className="space-y-2">{draft.options.map((option, index) => <div key={option.id ?? `new-${index}`} className="rounded-lg border border-border p-3"><div className="grid gap-2 sm:grid-cols-[1fr_120px]"><label className="text-sm">Option name<Input aria-label={`Option ${index + 1} name`} value={option.name} maxLength={80} onChange={(event) => setDraft({ ...draft, options: draft.options.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry) })} /></label><label className="text-sm">Adjustment<Input aria-label={`Option ${index + 1} adjustment`} inputMode="decimal" value={option.price} onChange={(event) => setDraft({ ...draft, options: draft.options.map((entry, i) => i === index ? { ...entry, price: event.target.value } : entry) })} /></label></div><label className="mt-2 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={option.isActive} onChange={(event) => setDraft({ ...draft, options: draft.options.map((entry, i) => i === index ? { ...entry, isActive: event.target.checked } : entry) })} />Available</label></div>)}</div>
          </div>
          <div><h3 className="font-semibold">Assigned products</h3><p className="mb-2 text-sm text-muted-foreground">Choose every product that should show this group.</p><Input aria-label="Search products for modifier group" placeholder="Search products" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /><div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">{visibleProducts.map((product) => <label key={product.id} className="flex min-h-10 items-center gap-2 px-2 text-sm"><input type="checkbox" checked={draft.productIds.includes(product.id)} onChange={(event) => setDraft({ ...draft, productIds: event.target.checked ? [...draft.productIds, product.id] : draft.productIds.filter((id) => id !== product.id) })} />{product.name}{!product.isActive && <span className="text-muted-foreground">(hidden)</span>}</label>)}{!visibleProducts.length && <p className="p-2 text-sm text-muted-foreground">No matching products.</p>}</div></div>
        </div>}
        <DialogFooter><Button disabled={pending} className="h-11" onClick={() => void save()}>{pending ? "Saving…" : "Save group"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

