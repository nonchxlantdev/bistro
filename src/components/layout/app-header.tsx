"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoControls } from "@/components/layout/demo-controls";
const titles: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Overview", subtitle: "A clear view of today's service" },
  "/pos": { title: "Register", subtitle: "Take orders. Keep service moving." },
  "/tables": { title: "Tables", subtitle: "Seat guests, manage checks & settle bills" },
  "/orders": { title: "Orders", subtitle: "Open checks & past service" },
  "/kitchen": { title: "Kitchen", subtitle: "The pass · Live preparation queue" },
  "/menu": { title: "Menu", subtitle: "Your dishes, drinks & finishing touches" },
  "/settings": { title: "Settings", subtitle: "Restaurant identity & local system" },
};
export function AppHeader({ onMenu, location }: { onMenu: () => void; location: string }) {
  const pathname = usePathname();
  const match = Object.keys(titles).find((path) => pathname === path || pathname.startsWith(path + "/"));
  const current = titles[match ?? "/pos"];
  const [clock, setClock] = useState("");
  useEffect(() => { const tick = () => setClock(new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())); tick(); const timer = window.setInterval(tick, 30000); return () => window.clearInterval(timer); }, []);
  return <header className="flex min-h-[76px] shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 md:px-6">
    <Button variant="outline" size="icon" className="size-11 lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu /></Button>
    <div className="min-w-0 flex-1"><p className="text-[11px] text-muted-foreground lg:hidden">Salud Bistro — Demo</p><h1 className="truncate text-[23px] font-medium">{current.title}</h1><p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{current.subtitle}</p></div>
    <div className="hidden text-right text-xs text-muted-foreground md:block"><p className="flex items-center justify-end gap-1"><MapPin className="size-3" />{location}</p><p className="mt-1">{clock || "Local service"}</p></div>
    <span className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground lg:hidden">DEMO</span>
    {pathname !== "/pos" && pathname !== "/settings" && <Link href="/pos" className="hidden min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground sm:inline-flex">Open register</Link>}
    {pathname === "/pos" && <Link href="/tables" className="hidden min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium sm:inline-flex">View tables</Link>}
    <DemoControls />
  </header>;
}

