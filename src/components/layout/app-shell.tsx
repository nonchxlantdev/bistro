"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { DEMO_BRAND } from "@/lib/brand";
import { ACCESS_PAGES } from "@/lib/demo-policy";
import { FirstUseTips } from "@/components/layout/first-use-tips";
import { usePosStore } from "@/stores/pos-store";
import type { SettingsDto } from "@/types/api";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<string>(DEMO_BRAND.location);
  const pathname = usePathname();
  const accessPage = ACCESS_PAGES.includes(pathname);
  const kitchen = pathname.startsWith("/kitchen");
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
    <aside className={kitchen ? "hidden w-20 shrink-0 border-r border-sidebar-border lg:block" : "hidden w-20 shrink-0 border-r border-sidebar-border lg:block min-[1440px]:w-[224px]"}>
      <AppSidebar mode={kitchen ? "rail" : "responsive"} />
    </aside>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" className="w-[272px] bg-sidebar p-0 sm:max-w-[272px]"><SheetTitle className="sr-only">Navigation</SheetTitle><AppSidebar onNavigate={() => setOpen(false)} /></SheetContent></Sheet>
    <div className="flex min-w-0 flex-1 flex-col"><AppHeader onMenu={() => setOpen(true)} location={location} /><main className="min-h-0 flex-1 overflow-hidden">{children}</main></div>
    <FirstUseTips />
  </div>;
}

