import { MenuScreen } from "@/components/menu/menu-screen";
import { Suspense } from "react";

export default function MenuPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading menu workspace…</p>}><MenuScreen /></Suspense>;
}
