"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { formatMoney } from "@/lib/domain/money";
import type { ProductDto } from "@/types/api";
export function ProductCard({ product, currency, disabled, onAdd }: { product: ProductDto; currency: string; disabled?: boolean; onAdd: (product: ProductDto) => void }) {
  const [broken, setBroken] = useState(false);
  return <button type="button" disabled={disabled} onClick={() => onAdd(product)} className="group flex min-h-[144px] flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-sage hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">
    {product.imagePath && !broken && <div className="h-24 w-full overflow-hidden">{
      // Local product images are optional and can have arbitrary dimensions.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={product.imageThumbnailPath ?? product.imagePath} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setBroken(true)} />
    }</div>}
    <div className="flex flex-1 flex-col p-4"><p className="text-xs text-muted-foreground">{product.categoryName}</p><p className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug">{product.name}</p><div className="mt-auto flex items-end justify-between gap-2 pt-5"><div><p className="text-lg font-medium tracking-tight">{formatMoney(product.priceCents, currency)}</p><p className="mt-1 text-[11px] text-success">{product.modifierGroups?.length ? "Options available" : "Available"}</p></div><Plus className="mb-1 size-[18px] text-muted-foreground group-hover:text-foreground" /></div></div>
  </button>;
}

