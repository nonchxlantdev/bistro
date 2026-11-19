"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { APP_VERSION } from "@/lib/version";
import { DEMO_BRAND } from "@/lib/brand";
import type { SettingsDto } from "@/types/api";

export function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => { api<SettingsDto>("/api/settings").then(setSettings).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load settings.")); }, []);
  async function save() {
    if (!settings) return;
    setPending(true);
    try {
      const saved = await api<SettingsDto>("/api/settings", { method: "PUT", body: JSON.stringify({ businessName: settings.businessName, locationName: settings.locationName, currency: settings.currency, receiptFooter: settings.receiptFooter }) });
      setSettings(saved); toast.success("Restaurant settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save settings."); }
    finally { setPending(false); }
  }
  if (!settings && !error) return <LoadingState label="Loading restaurant settings" />;
  return <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-6xl space-y-5">
    {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-destructive">{error}</p>}
    <div><h2 className="text-2xl font-medium">Restaurant & register</h2><p className="mt-1 text-sm text-muted-foreground">Your demo presentation and saved business details.</p></div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
      {settings && <section className="service-panel p-5 md:p-6"><h3 className="font-semibold">Business identity</h3><p className="mt-1 mb-5 text-sm text-muted-foreground">These details appear on receipts. The original sample café identity is displayed as Salud Bistro for this demo.</p>
        <div className="space-y-4">
          <div><Label htmlFor="business-name">Business name on receipts</Label><Input id="business-name" className="mt-1.5 h-11" value={settings.businessName} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]"><div><Label htmlFor="location-name">Location</Label><Input id="location-name" className="mt-1.5 h-11" value={settings.locationName} onChange={(event) => setSettings({ ...settings, locationName: event.target.value })} /></div><div><Label htmlFor="currency">Currency</Label><Input id="currency" className="mt-1.5 h-11" value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value.toUpperCase() })} /></div></div>
          <div><Label htmlFor="receipt-footer">Receipt footer</Label><Textarea id="receipt-footer" className="mt-1.5 min-h-28" value={settings.receiptFooter} onChange={(event) => setSettings({ ...settings, receiptFooter: event.target.value })} /></div>
          <div className="border-t border-border pt-4"><Button className="h-11 px-5" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : "Save business details"}</Button></div>
        </div>
      </section>}
      <div className="space-y-5">
        <section className="service-panel p-5"><h3 className="font-semibold">Appearance</h3><div className="mt-4 flex items-center gap-4"><div className="text-foreground"><BrandLogo wordmark className="h-auto w-28" /></div><div><p className="font-heading text-xl">{DEMO_BRAND.name}</p><p className="mt-1 text-xs text-muted-foreground">{DEMO_BRAND.environment}</p><span className="mt-2 inline-flex status-chip status-served">Local brand assets</span></div></div><div className="mt-5 border-t border-border pt-4 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Theme</span><span>Espresso & cream · Light workspace</span></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Typography</span><span>DM Sans / Fraunces</span></div><p className="mt-3 text-xs text-muted-foreground">Fonts and the official logo are served locally. Appearance is shared across this demo.</p></div></section>
        <section className="service-panel p-5"><h3 className="font-semibold">System</h3><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Platform</dt><dd>{DEMO_BRAND.platform}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Version</dt><dd>{APP_VERSION}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Environment</dt><dd>Local Development</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Database</dt><dd>SQLite · This computer</dd></div></dl></section>
      </div>
    </div>
    <aside className="rounded-xl border border-brass/60 bg-warning-soft p-4 text-sm text-warning"><strong>Local prototype</strong><p className="mt-1">This demo is not production-ready. Staff authentication and tenant isolation are required before commercial or public deployment. Tax calculation, card processing and direct printer integration are not configured.</p><p className="mt-2 text-xs">The visual rebrand has not changed stored orders, payments or receipt business settings.</p></aside>
  </div></div>;
}



