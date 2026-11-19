"use client";
import { useState } from "react";
import { CircleHelp, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HELP_EVENT } from "@/lib/first-use-tips";
import { api } from "@/lib/api-client";
import { usePosStore } from "@/stores/pos-store";

export function DemoControls() {
  const [pending, setPending] = useState(false);
  const dirty = usePosStore((state) => state.dirty);
  async function logout() {
    if (pending || (dirty && !window.confirm("Log out of the demo? Unsaved order changes will be discarded."))) return;
    setPending(true);
    try { await api("/api/demo-access", { method: "POST", body: JSON.stringify({ action: "logout" }) }); window.location.replace("/login"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not log out. Please try again."); setPending(false); }
  }
  return <div className="flex shrink-0 items-center gap-2"><Button variant="ghost" size="icon" className="size-11" title="Help & first-use tips" aria-label="Help and first-use tips" onClick={() => window.dispatchEvent(new Event(HELP_EVENT))}><CircleHelp /></Button><Button variant="ghost" size="icon" className="size-11 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Log out" aria-label="Log out of the demo" disabled={pending} onClick={() => void logout()}><LogOut /></Button></div>;
}
