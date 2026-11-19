"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryDto } from "@/types/api";
import { ProductImageField } from "@/components/menu/product-image-field";

export type ProductFormValues = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  isActive: boolean;
};

export function MenuProductForm({
  values,
  categories,
  onChange,
  image,
}: {
  values: ProductFormValues;
  categories: CategoryDto[];
  onChange: (values: ProductFormValues) => void;
  image: React.ComponentProps<typeof ProductImageField>;
}) {
  return (
    <fieldset disabled={image.disabled} className="min-w-0 space-y-4">
      <ProductImageField {...image} />
      <label className="block space-y-1.5">
        <Label htmlFor="product-name">Name</Label>
        <Input
          id="product-name"
          value={values.name}
          className="h-11 rounded-xl"
          onChange={(event) => onChange({ ...values, name: event.target.value })}
        />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="product-description">Description</Label>
        <Textarea
          id="product-description"
          value={values.description}
          className="min-h-20 rounded-xl"
          onChange={(event) => onChange({ ...values, description: event.target.value })}
        />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="product-category">Category</Label>
        <select
          id="product-category"
          value={values.categoryId}
          onChange={(event) => onChange({ ...values, categoryId: event.target.value })}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="">Choose a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="product-price">Price</Label>
        <Input
          id="product-price"
          inputMode="decimal"
          placeholder="0.00"
          value={values.price}
          className="h-11 rounded-xl"
          onChange={(event) => onChange({ ...values, price: event.target.value })}
        />
      </label>
      <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
        <Label htmlFor="product-active">Available on the POS</Label>
        <Switch
          id="product-active"
          checked={values.isActive}
          onCheckedChange={(checked) => onChange({ ...values, isActive: checked })}
        />
      </div>
    </fieldset>
  );
}
