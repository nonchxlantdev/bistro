"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutGrid, ReceiptText, Settings, ShoppingBag, UtensilsCrossed, ChefHat, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { BrandLogo } from "@/components/layout/brand-logo";
import { DEMO_BRAND } from "@/lib/brand";
import { APP_VERSION } from "@/lib/version";

const links: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/pos", label: "Register", icon: ShoppingBag },
  { href: "/tables", label: "Tables", icon: LayoutGrid },
  { href: "/orders", label: "Orders", icon: ReceiptText },
  { href: "/kitchen", label: "Kitchen", icon: ChefHat },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppSidebar({ onNavigate, mode = "full" }: { onNavigate?: () => void; mode?: "full" | "rail" | "responsive" }) {
  const pathname = usePathname();
  const label = mode === "rail" ? "sr-only" : mode === "responsive" ? "hidden min-[1440px]:block" : "block";
  return <div className="flex h-full flex-col overflow-y-auto bg-sidebar text-sidebar-foreground">
    <div className="flex shrink-0 flex-col items-center gap-3 px-3 pt-4 pb-5">
      <div className="w-[94%]"><BrandLogo wordmark className="h-auto w-full" /></div>
      <p className={cn("text-center text-xs text-sidebar-foreground/80", label)}>Restaurant & Café</p>
      <span className="rounded border border-sidebar-border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-sidebar-foreground/75">DEMO</span>
    </div>
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 px-3">
      {links.map(({ href, label: title, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return <Link key={href} href={href} title={title} aria-label={title} aria-current={active ? "page" : undefined} onClick={onNavigate}
          className={cn("flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
          <Icon className="size-[18px] shrink-0" /><span className={label}>{title}</span>
        </Link>;
      })}
    </nav>
    <div className={cn("border-t border-sidebar-border px-5 py-4 text-xs leading-5 text-sidebar-foreground/70", label)}><p>{DEMO_BRAND.environment}</p><p>{process.env.NEXT_PUBLIC_SORA_HOSTED ? "Live Demo" : "Local Development"}</p><p className="mt-2 text-[11px]">{DEMO_BRAND.platform} · {APP_VERSION}</p></div>
  </div>;
}

