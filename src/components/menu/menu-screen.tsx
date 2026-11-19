"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CategoryForm, type CategoryFormValues } from "@/components/menu/category-form";
import { MenuProductForm, type ProductFormValues } from "@/components/menu/menu-product-form";
import { ModifierManager } from "@/components/menu/modifier-manager";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import type { CatalogDto, CategoryDto, ProductDto, SettingsDto } from "@/types/api";

const emptyCategory: CategoryFormValues = { name: "", sortOrder: "0", isActive: true };
const emptyProduct: ProductFormValues = { name: "", description: "", categoryId: "", price: "", isActive: true };

export function MenuScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const tabs = ["products", "modifiers", "categories"] as const;
  const activeTab = tabs.find((tab) => tab === params.get("tab")) ?? "products";
  const [menu, setMenu] = useState<CatalogDto | null>(null);
  const [currency, setCurrency] = useState("BZD");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [error, setError] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<CategoryFormValues | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState<ProductFormValues | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const blobUrl = useRef<string | null>(null);
  useEffect(() => () => { if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); }, []);
  function resetImage(url: string | null) {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = null; setImageFile(null); setImageRemoved(false); setOriginalImage(url); setImagePreview(url);
  }
  function selectImage(file: File) {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = URL.createObjectURL(file); setImageFile(file); setImageRemoved(false); setImagePreview(blobUrl.current);
  }
  function changeTab(tab: typeof tabs[number]) {
    const query = new URLSearchParams(params.toString()); query.set("tab", tab); router.replace(`/menu?${query}`, { scroll: false });
  }

  async function load() {
    try {
      const [nextMenu, settings] = await Promise.all([api<CatalogDto>("/api/categories"), api<SettingsDto>("/api/settings")]);
      setMenu(nextMenu);
      setCurrency(settings.currency);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the menu.");
    }
  }

  useEffect(() => {
    let ignore = false;
    Promise.all([api<CatalogDto>("/api/categories"), api<SettingsDto>("/api/settings")])
      .then(([nextMenu, settings]) => {
        if (ignore) return;
        setMenu(nextMenu);
        setCurrency(settings.currency);
      })
      .catch((loadError: unknown) => {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "Could not load the menu.");
      });
  
    return () => { ignore = true; };
  }, []);

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (menu?.products ?? []).filter((product) => (categoryFilter === "all" || product.categoryId === categoryFilter) && (!needle || product.name.toLowerCase().includes(needle)));
  }, [menu, query, categoryFilter]);

  async function saveCategory() {
    if (!categoryDraft || pending) return;
    const sortOrder = Number(categoryDraft.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) { toast.error("Display order must be a whole number."); return; }
    setPending(true);
    try {
      await api(editingCategoryId ? `/api/categories/${editingCategoryId}` : "/api/categories", { method: editingCategoryId ? "PATCH" : "POST", body: JSON.stringify({ name: categoryDraft.name, sortOrder, isActive: categoryDraft.isActive }) });
      toast.success("Category saved"); setCategoryDraft(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the category."); }
    finally { setPending(false); }
  }
  async function saveProduct() {
    if (!productDraft || pending) return;
    const priceCents = parseMoneyToCents(productDraft.price);
    if (priceCents === null) { toast.error("Enter a valid price, such as 8.50."); return; }
    setPending(true);
    try {
      const payload = { name: productDraft.name, description: productDraft.description, categoryId: productDraft.categoryId, priceCents, isActive: productDraft.isActive };
      let body: string | FormData = JSON.stringify(payload);
      if (imageFile || imageRemoved) {
        const form = new FormData(); form.set("product", JSON.stringify(payload));
        if (imageFile) form.set("image", imageFile);
        if (imageRemoved) form.set("removeImage", "true");
        body = form;
      }
      await api(editingProductId ? `/api/products/${editingProductId}` : "/api/products", { method: editingProductId ? "PATCH" : "POST", body });
      toast.success("Product saved"); setProductDraft(null); resetImage(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the product."); }
    finally { setPending(false); }
  }
  async function toggleProduct(product: ProductDto, isActive: boolean) {
    try {
      await api(`/api/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ name: product.name, description: product.description, categoryId: product.categoryId, priceCents: product.priceCents, isActive }) });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update the product."); }
  }
  function editCategory(category: CategoryDto) {
    setEditingCategoryId(category.id); setCategoryDraft({ name: category.name, sortOrder: String(category.sortOrder), isActive: category.isActive });
  }
  function editProduct(product: ProductDto) {
    resetImage(product.imagePath); setEditingProductId(product.id); setProductDraft({ name: product.name, description: product.description, categoryId: product.categoryId, price: centsToInput(product.priceCents), isActive: product.isActive });
  }

  return <div className="h-full overflow-y-auto px-4 pb-6 md:px-6">
    <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-border bg-background px-4 pt-4 md:-mx-6 md:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-2xl font-medium">Menu management</h2><p className="mt-1 text-sm text-muted-foreground">Products, finishing touches & categories — all in one place.</p></div>{menu && <span className="text-xs text-muted-foreground">{menu.products.length} products · {menu.categories.length} categories</span>}</div>
      <div role="tablist" aria-label="Menu management sections" className="flex gap-1">{tabs.map((tab, index) => <button key={tab} type="button" role="tab" id={"menu-tab-" + tab} aria-selected={activeTab === tab} aria-controls={"menu-panel-" + tab} tabIndex={activeTab === tab ? 0 : -1} onClick={() => changeTab(tab)} onKeyDown={(event) => { let next: number | null = null; if (event.key === "ArrowRight") next = (index + 1) % tabs.length; if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length; if (event.key === "Home") next = 0; if (event.key === "End") next = tabs.length - 1; if (next !== null) { event.preventDefault(); changeTab(tabs[next]); document.getElementById("menu-tab-" + tabs[next])?.focus(); } }} className={"min-h-12 border-b-2 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring " + (activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-destructive">{error}</p>}
    {!menu && !error && <LoadingState label="Loading menu" />}
    {menu && <section role="tabpanel" id={"menu-panel-" + activeTab} aria-labelledby={"menu-tab-" + activeTab} tabIndex={0}>
      {activeTab === "products" && <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3"><Input value={query} placeholder="Search products" aria-label="Search products" className="h-11 min-w-40 flex-1 sm:max-w-sm" onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter products by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-sm"><option value="all">All categories</option>{menu.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button className="ml-auto h-11" onClick={() => { setEditingProductId(null); resetImage(null); setProductDraft({ ...emptyProduct, categoryId: menu.categories[0]?.id ?? "" }); }}>Add product</Button></div>
        {!products.length ? <EmptyState title="No matching products" description="Try another search or category, or add a product to the menu." /> : <div className="overflow-hidden rounded-xl border border-border bg-card">
          {products.map((product) => <div key={product.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[48px_minmax(0,1fr)_90px_200px]">
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground">{product.imagePath ? (
              // Local images are served through the validated application image route.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageThumbnailPath ?? product.imagePath} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            ) : product.name.slice(0, 2).toUpperCase()}</div>
            <button type="button" className="min-w-0 text-left" onClick={() => editProduct(product)}><span className="block truncate text-sm font-semibold">{product.name}</span><span className="text-xs text-muted-foreground">{product.categoryName}{product.modifierGroups?.length ? " · " + product.modifierGroups.length + " modifier groups" : ""}</span></button>
            <span className="text-right text-sm font-medium">{formatMoney(product.priceCents, currency)}</span>
            <div className="col-span-2 col-start-2 flex items-center justify-end gap-3 sm:col-span-1 sm:col-start-auto"><span className={"status-chip " + (product.isActive ? "status-completed" : "status-served")}>{product.isActive ? "Available" : "Hidden"}</span><Switch checked={product.isActive} onCheckedChange={(checked) => void toggleProduct(product, checked)} aria-label={"Toggle " + product.name} /><Button variant="ghost" onClick={() => editProduct(product)} aria-label={"Edit " + product.name}>Edit</Button></div>
          </div>)}
        </div>}
      </div>}
      {activeTab === "modifiers" && <ModifierManager products={menu.products} currency={currency} />}
      {activeTab === "categories" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Organize the register. Hidden categories keep their products and history.</p><Button className="h-11" onClick={() => { setEditingCategoryId(null); setCategoryDraft(emptyCategory); }}>Add category</Button></div><div className="overflow-hidden rounded-xl border border-border bg-card">{menu.categories.map((category) => <div key={category.id} className="flex flex-wrap items-center gap-3 border-b border-border p-4 last:border-b-0"><div className="min-w-0 flex-1"><p className="font-semibold">{category.name}</p><p className="mt-1 text-xs text-muted-foreground">{menu.products.filter((product) => product.categoryId === category.id).length} products · Sort order {category.sortOrder}</p></div><span className={"status-chip " + (category.isActive ? "status-completed" : "status-served")}>{category.isActive ? "Active" : "Hidden"}</span><Button variant="outline" onClick={() => editCategory(category)} aria-label={"Edit " + category.name}>Edit category</Button></div>)}{!menu.categories.length && <p className="p-5 text-sm text-muted-foreground">Add a category to organize your first products.</p>}</div></div>}
    </section>}
    <Dialog open={Boolean(categoryDraft)} onOpenChange={(open) => { if (!open && !pending) setCategoryDraft(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{editingCategoryId ? "Edit category" : "New category"}</DialogTitle></DialogHeader>{categoryDraft && <CategoryForm values={categoryDraft} onChange={setCategoryDraft} />}<DialogFooter><Button className="h-11" disabled={pending} onClick={() => void saveCategory()}>{pending ? "Saving…" : "Save category"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(productDraft)} onOpenChange={(open) => { if (!open && !pending) { setProductDraft(null); resetImage(null); } }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editingProductId ? "Edit product" : "New product"}</DialogTitle></DialogHeader>{productDraft && <MenuProductForm values={productDraft} categories={menu?.categories ?? []} onChange={setProductDraft} image={{ preview: imagePreview, disabled: pending, changed: Boolean(imageFile || imageRemoved), onSelect: selectImage, onRemove: () => { if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); blobUrl.current = null; setImageFile(null); setImageRemoved(true); setImagePreview(null); }, onUndo: () => resetImage(originalImage) }} />}<DialogFooter><Button className="h-11" disabled={pending} onClick={() => void saveProduct()}>{pending ? "Saving product…" : "Save product"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

