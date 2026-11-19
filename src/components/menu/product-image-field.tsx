"use client";
import { useId, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProductImageField({ preview, disabled, changed, onSelect, onRemove, onUndo }: { preview: string | null; disabled?: boolean; changed: boolean; onSelect: (file: File) => void; onRemove: () => void; onUndo: () => void }) {
  const id = useId();
  const [error, setError] = useState("");
  return <section className="rounded-xl border border-border bg-background/50 p-4" aria-label="Product image">
    <div className="flex gap-4"><div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {preview ? (
        // Preview uses the local selected file; final content is validated server-side.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Product image preview" className="size-full object-contain" />
      ) : <ImagePlus className="size-6 text-muted-foreground" />}
    </div><div className="min-w-0 flex-1"><label htmlFor={id} className="text-sm font-semibold">Product image</label><p id={id + "-help"} className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP · Up to 5 MB. Saved locally as optimized WebP.</p><input id={id} aria-describedby={id + "-help"} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} className="mt-3 block w-full min-w-0 text-xs file:mr-2 file:min-h-9 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:font-medium file:text-secondary-foreground" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!file.size || file.size > 5 * 1024 * 1024) { setError("Choose an image between 1 byte and 5 MB."); return; } setError(""); onSelect(file); }} /></div></div>
    <div className="mt-3 flex gap-2">{preview && <Button type="button" variant="ghost" disabled={disabled} onClick={() => { setError(""); onRemove(); }}>Remove image</Button>}{changed && <Button type="button" variant="ghost" disabled={disabled} onClick={() => { setError(""); onUndo(); }}>Undo image change</Button>}</div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    <p className="mt-2 text-xs text-muted-foreground">Image changes are applied when you save the product.</p>
  </section>;
}
