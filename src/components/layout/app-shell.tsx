"use client";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { DEMO_BRAND } from "@/lib/brand";
import { ACCESS_PAGES } from "@/lib/demo-policy";
import { FirstUseTips } from "@/components/layout/first-use-tips";
import { usePosStore } from "@/stores/pos-store";
import type { SettingsDto } from "@/types/api";

const NAV_STORAGE = "salud:navigation";
const NAV_EVENT = "salud:navigation-change";
type NavState = "open" | "closed" | null; // null = automatic (open on wide screens)
function readNav(): NavState { try { const value = localStorage.getItem(NAV_STORAGE); return value === "open" || value === "closed" ? value : null; } catch { return null; } }
function subscribeNav(onChange: () => void) {
  window.addEventListener(NAV_EVENT, onChange); window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(NAV_EVENT, onChange); window.removeEventListener("storage", onChange); };
}
let memoryNav: NavState = null;
function writeNav(value: NavState) { memoryNav = value; try { if (value) localStorage.setItem(NAV_STORAGE, value); } catch { /* memory only */ } window.dispatchEvent(new Event(NAV_EVENT)); }

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Desktop/landscape sidebar: open (full, with labels) or closed (hidden), remembered per browser.
  // Until the user chooses, it is open on wide screens (≥1280px) and closed on tablets/small laptops.
  const navState = useSyncExternalStore(subscribeNav, () => readNav() ?? memoryNav, () => null);
  const toggleNavigation = useCallback(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) { setOpen((value) => !value); return; }
    const isOpen = navState ? navState === "open" : window.matchMedia("(min-width: 1280px)").matches;
    writeNav(isOpen ? "closed" : "open");
  }, [navState]);
  const [location, setLocation] = useState<string>(DEMO_BRAND.location);
  const pathname = usePathname();
  const accessPage = ACCESS_PAGES.includes(pathname);
  const dirty = usePosStore((state) => state.dirty);
  useEffect(() => { if (!accessPage) api<SettingsDto>("/api/settings").then((settings) => setLocation(settings.locationName)).catch(() => {}); }, [accessPage]);
  useEffect(() => {
    if (!dirty || accessPage) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, accessPage]);
  useEffect(() => {
    if (accessPage) return;
    const checkAccess = () => { void api<{ stage: string }>("/api/demo-access").then(({ stage }) => {
      if (stage !== "accepted") window.location.replace(`${stage === "disclaimer" ? "/disclaimer" : "/login"}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }).catch(() => {}); };
    window.addEventListener("focus", checkAccess);
    return () => window.removeEventListener("focus", checkAccess);
  }, [accessPage]);
  if (accessPage) return <>{children}</>;
  return <div className="flex h-dvh overflow-hidden bg-background">
    <aside id="app-navigation" className={cn("hidden w-[224px] shrink-0 border-r border-sidebar-border", navState === "open" && "lg:block", navState === null && "xl:block")}>
      <AppSidebar />
    </aside>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" className="w-[272px] bg-sidebar p-0 sm:max-w-[272px] [&_[data-slot=sheet-close]]:size-10 [&_[data-slot=sheet-close]]:text-sidebar-foreground [&_[data-slot=sheet-close]]:hover:bg-sidebar-accent [&_[data-slot=sheet-close]]:hover:text-sidebar-foreground"><SheetTitle className="sr-only">Navigation</SheetTitle><AppSidebar onNavigate={() => setOpen(false)} /></SheetContent></Sheet>
    <div className="flex min-w-0 flex-1 flex-col"><AppHeader onMenu={toggleNavigation} navState={navState} sheetOpen={open} location={location} /><main className="min-h-0 flex-1 overflow-hidden">{children}</main></div>
    <FirstUseTips />
  </div>;
}

