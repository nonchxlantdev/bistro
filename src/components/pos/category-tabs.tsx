"use client";

import { cn } from "cn";
import type { CategoryDto } from "@/types/api";

export function CategoryTabs({
  categories,
  value,
  onChange,
}: {
  categories: CategoryDto[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [{ id: "all", name: "All" }, ...categories];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((category) => {
        const active = value === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onChange(category.id)}
            className={cn(
              "h-11 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
              active ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}

