"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { formatElapsed } from "@/lib/format";
type Status = "NEW" | "PREPARING" | "READY" | "SERVED";
type Ticket = { id: string; orderId: string; status: Status; createdAt: string; orderNumber: string; tableName: string; additionNumber: number; linkedTicketId: string | null; changes: Array<{ name: string; quantity: number; modifiers?: string[]; instructions?: string }> };
const states = ["ALL", "NEW", "PREPARING", "READY", "HISTORY"] as const;
const steps: Status[] = ["NEW", "PREPARING", "READY", "SERVED"];
const labels: Record<Status, string> = { NEW: "New", PREPARING: "Preparing", READY: "Ready", SERVED: "Served" };
const nextAction: Partial<Record<Status, { to: Status; label: string }>> = { NEW: { to: "PREPARING", label: "Start preparing" }, PREPARING: { to: "READY", label: "Mark ready" }, READY: { to: "SERVED", label: "Mark served" } };
export function KitchenScreen() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<(typeof states)[number]>("ALL");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const load = useCallback(async () => { try { setTickets(await api<Ticket[]>("/api/kitchen")); setError(""); setNow(Date.now()); } catch (e) { setError(e instanceof Error ? e.message : "Could not load kitchen tickets."); } }, []);
  useEffect(() => {
    let active = true;
    api<Ticket[]>("/api/kitchen").then((next) => { if (active) { setTickets(next); setNow(Date.now()); } }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load kitchen tickets."); });
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [load]);
  const router = useRouter();
  async function change(ticket: Ticket, to: Status) {
    setPending(ticket.id);
    try {
      await api("/api/kitchen/" + ticket.id, { method: "PATCH", body: JSON.stringify({ from: ticket.status, to }) }); await load();
      // Served is the hand-off to the floor: point straight to closing out the check.
      if (to === "SERVED") toast.success(`${ticket.orderNumber} served · ${ticket.tableName}`, { description: "Ready to take payment.", action: { label: "Take payment", onClick: () => router.push(`/orders/${ticket.orderId}/pay`) } });
    }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update ticket."); }
    finally { setPending(null); }
  }
  const count = (state: (typeof states)[number]) => tickets?.filter((ticket) => state === "HISTORY" ? ticket.status === "SERVED" : state === "ALL" ? ticket.status !== "SERVED" : ticket.status === state).length;
  const shown = (tickets?.filter((ticket) => filter === "HISTORY" ? ticket.status === "SERVED" : filter === "ALL" ? ticket.status !== "SERVED" : ticket.status === filter) ?? []).sort((a, b) => filter === "HISTORY" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt));
  return <div className="kitchen-screen h-full overflow-auto p-4 md:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Service queue</h2><p className="mt-1 text-sm text-muted-foreground">Oldest tickets first · Updates every 3 seconds</p></div><Button variant="outline" className="h-11" onClick={() => void load()}>Refresh queue</Button></div>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Kitchen ticket views">{states.map((state) => <Button key={state} className="h-12 shrink-0 px-4" variant={filter === state ? "default" : "outline"} aria-pressed={filter === state} onClick={() => setFilter(state)}>{state === "ALL" ? "All active" : state === "HISTORY" ? "History" : labels[state]} <span className="ml-2 opacity-70">{count(state) ?? "—"}</span></Button>)}</div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-destructive">{error}</p>}
    {!tickets && !error && <p>Loading tickets…</p>}
    {tickets && !shown.length && <p className="service-panel p-6 text-sm text-muted-foreground">{filter === "HISTORY" ? "Served tickets will appear here." : "The pass is clear. New kitchen tickets will appear here."}</p>}
    <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[1680px]:grid-cols-4">{shown.map((ticket) => <article key={ticket.id} className={"overflow-hidden rounded-xl border border-border border-t-4 bg-card " + (ticket.status === "NEW" ? "border-t-terracotta" : ticket.status === "PREPARING" ? "border-t-brass" : ticket.status === "READY" ? "border-t-success" : "border-t-border")}>
      <div className="p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="text-[22px] font-bold">{ticket.tableName}</h3><p className="mt-1 text-sm text-muted-foreground">{ticket.orderNumber}</p></div><div className="text-right"><span className={"status-chip status-" + ticket.status.toLowerCase()}>{labels[ticket.status]}</span><p className="mt-2 text-sm font-semibold">{now ? formatElapsed(ticket.createdAt, now) : "New"}</p></div></div>
        {ticket.linkedTicketId && <p className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">{ticket.changes.every((line) => line.quantity > 0) ? "Add-on" : "Update"} {ticket.additionNumber} · Same order<span className="block text-xs font-normal">Only the changes below need preparing</span></p>}
        <ol className="mt-4 grid grid-cols-4 gap-1" aria-label={"Progress: " + labels[ticket.status]}>{steps.map((step, index) => <li key={step} aria-current={step === ticket.status ? "step" : undefined} className={"border-t-2 pt-1 text-center text-[11px] " + (index <= steps.indexOf(ticket.status) ? "border-foreground font-semibold" : "border-border text-muted-foreground")}>{labels[step]}</li>)}</ol>
        <ul className="my-4 space-y-4 border-y border-border py-4">{ticket.changes.map((line, index) => <li key={index}><div className="flex gap-3"><strong className={"min-w-7 text-xl " + (line.quantity < 0 ? "text-destructive" : "")}>{line.quantity > 0 ? "+" + line.quantity : line.quantity}</strong><div className="min-w-0 flex-1"><p className="text-base font-semibold leading-snug">{line.name}{line.quantity < 0 ? " · Remove" : ""}</p>{!!line.modifiers?.length && <p className="mt-1 text-sm text-muted-foreground">{line.modifiers.join(" · ")}</p>}</div></div>{line.instructions && <p className="mt-2 rounded-lg bg-warning-soft p-3 text-sm font-semibold text-warning">Special instructions: {line.instructions}</p>}</li>)}</ul>
        {nextAction[ticket.status] ? <Button className="h-14 w-full text-base" disabled={pending === ticket.id} onClick={() => void change(ticket, nextAction[ticket.status]!.to)}>{pending === ticket.id ? "Updating…" : nextAction[ticket.status]!.label + " →"}</Button> : <p className="py-2 text-sm text-muted-foreground">Served · Ticket locked</p>}
      </div>
    </article>)}</div>
  </div>;
}

