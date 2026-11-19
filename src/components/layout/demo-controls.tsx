"use client";
import { useEffect, useState } from "react";
import { CircleHelp, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HELP_EVENT } from "@/lib/first-use-tips";
import { api } from "@/lib/api-client";
import { usePosStore } from "@/stores/pos-store";

type Person = { id: string; name: string; role: string };
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export function DemoControls() {
  const [pending, setPending] = useState(false);
  const [staff, setStaff] = useState<Person | null>(null);
  const dirty = usePosStore((state) => state.dirty);
  useEffect(() => { api<{ current: Person | null }>("/api/staff").then((data) => setStaff(data.current)).catch(() => {}); }, []);

  async function switchStaff() {
    if (pending || (dirty && !window.confirm("Switch staff? Unsaved order changes will be discarded."))) return;
    setPending(true);
    try { await api("/api/staff", { method: "POST", body: JSON.stringify({ action: "logout" }) }); window.location.replace(`/staff?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not switch staff."); setPending(false); }
  }
  async function logout() {
    if (pending || (dirty && !window.confirm("Log out of the demo? Unsaved order changes will be discarded."))) return;
    setPending(true);
    try { await api("/api/demo-access", { method: "POST", body: JSON.stringify({ action: "logout" }) }); window.location.replace("/login"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not log out. Please try again."); setPending(false); }
  }
  return <div className="flex shrink-0 items-center gap-1.5">
    {staff && <button type="button" disabled={pending} onClick={() => void switchStaff()} title={`Signed in as ${staff.name} · tap to switch staff`} aria-label={`Signed in as ${staff.name}. Switch staff`}
      className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
      <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{initials(staff.name)}</span>
      <span className="hidden text-left leading-tight sm:block"><span className="block font-medium">{staff.name}</span><span className="block text-[11px] text-muted-foreground">Switch</span></span>
    </button>}
    <Button variant="ghost" size="icon" className="size-11" title="Help & first-use tips" aria-label="Help and first-use tips" onClick={() => window.dispatchEvent(new Event(HELP_EVENT))}><CircleHelp /></Button>
    <Button variant="ghost" size="icon" className="size-11 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Log out" aria-label="Log out of the demo" disabled={pending} onClick={() => void logout()}><LogOut /></Button>
  </div>;
}
