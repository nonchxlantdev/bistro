"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FIRST_USE_TIPS, HELP_EVENT, TIP_EVENT, TIPS_STORAGE_KEY, type FirstUseTip } from "@/lib/first-use-tips";

const STORAGE = TIPS_STORAGE_KEY;
type Preferences = { disabled: boolean; seen: string[] };
let memory: Preferences = { disabled: false, seen: [] };
function read(): Preferences {
  try { const value = JSON.parse(localStorage.getItem(STORAGE) ?? "null"); if (value && typeof value.disabled === "boolean" && Array.isArray(value.seen)) return value; } catch { /* Tips also work when browser storage is unavailable. */ }
  return memory;
}
function write(value: Preferences) { memory = value; try { localStorage.setItem(STORAGE, JSON.stringify(value)); } catch { /* Keep this visit's preferences in memory. */ } }

export function FirstUseTips() {
  const pathname = usePathname();
  const [help, setHelp] = useState(false);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    function show(event: Event) {
      const id = (event as CustomEvent<FirstUseTip>).detail;
      const tip = FIRST_USE_TIPS[id];
      const current = read();
      if (!tip || current.disabled || current.seen.includes(id)) return;
      write({ ...current, seen: [...current.seen, id] });
      toast.info(tip.title, { id: "salud-first-use", description: tip.description, duration: 14000, closeButton: true, action: { label: "Got it", onClick: () => {} }, cancel: { label: "Hide tips", onClick: () => { write({ ...read(), disabled: true }); setEnabled(false); } } });
    }
    const openGuide = () => { setEnabled(!read().disabled); setHelp(true); toast.dismiss("salud-first-use"); };
    window.addEventListener(TIP_EVENT, show); window.addEventListener(HELP_EVENT, openGuide);
    return () => { window.removeEventListener(TIP_EVENT, show); window.removeEventListener(HELP_EVENT, openGuide); toast.dismiss("salud-first-use"); };
  }, []);
  useEffect(() => {
    const id = ({ "/pos": "register", "/tables": "tables", "/kitchen": "kitchen", "/menu": "menu" } as const)[pathname as "/pos" | "/tables" | "/kitchen" | "/menu"];
    if (!id) return;
    const timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent(TIP_EVENT, { detail: id })), 650);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return <Dialog open={help} onOpenChange={setHelp}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Your Salud Bistro guide</DialogTitle><DialogDescription>Quick tips for exploring the demo. Contextual tips appear after relevant selections, and start fresh every time you log in.</DialogDescription></DialogHeader>
    <label className="flex items-center justify-between gap-4 rounded-lg bg-muted p-3 text-sm"><span>Show first-use tips</span><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); write({ ...read(), disabled: !event.target.checked }); }} className="size-4" /></label>
    <Button variant="outline" onClick={() => { write({ disabled: false, seen: [] }); setEnabled(true); toast.success("Tips reset. They’ll appear as you explore the app."); setHelp(false); }}>Show tips again from the beginning</Button>
    <div className="space-y-5 py-2">{Object.entries(FIRST_USE_TIPS).map(([id, tip]) => <section key={id}><h3 className="text-sm font-semibold">{tip.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tip.description}</p></section>)}</div>
  </DialogContent></Dialog>;
}
