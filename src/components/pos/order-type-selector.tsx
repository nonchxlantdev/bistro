"use client";

import { cn } from "cn";
import type { OrderType } from "@/types/api";

export function OrderTypeSelector({
  value,
  disabled,
  onChange,
}: {
  value: OrderType;
  disabled?: boolean;
  onChange: (value: OrderType) => void;
}) {
  const options: Array<{ id: OrderType; label: string }> = [
    { id: "DINE_IN", label: "Dine-in" },
    { id: "TAKEAWAY", label: "Takeaway" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={cn(
            "h-11 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50",
            value === option.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
