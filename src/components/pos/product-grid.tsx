"use client";

import { ProductCard } from "@/components/pos/product-card";
import { EmptyState } from "@/components/states/empty-state";
import type { ProductDto } from "@/types/api";

export function ProductGrid({
  products,
  currency,
  disabled,
  onAdd,
}: {
  products: ProductDto[];
  currency: string;
  disabled?: boolean;
  onAdd: (product: ProductDto) => void;
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        title="No products match"
        description="Try another search or category. Disabled products stay off the register."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} currency={currency} disabled={disabled} onAdd={onAdd} />
      ))}
    </div>
  );
}
