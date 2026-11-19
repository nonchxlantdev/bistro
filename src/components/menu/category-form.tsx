"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type CategoryFormValues = {
  name: string;
  sortOrder: string;
  isActive: boolean;
};

export function CategoryForm({
  values,
  onChange,
}: {
  values: CategoryFormValues;
  onChange: (values: CategoryFormValues) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          value={values.name}
          className="h-11 rounded-xl"
          onChange={(event) => onChange({ ...values, name: event.target.value })}
        />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="category-order">Display order</Label>
        <Input
          id="category-order"
          inputMode="numeric"
          value={values.sortOrder}
          className="h-11 rounded-xl"
          onChange={(event) => onChange({ ...values, sortOrder: event.target.value })}
        />
      </label>
      <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
        <Label htmlFor="category-active">Active on the register</Label>
        <Switch
          id="category-active"
          checked={values.isActive}
          onCheckedChange={(checked) => onChange({ ...values, isActive: checked })}
        />
      </div>
    </div>
  );
}
