"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/format";

/** API dates arrive as ISO strings. */
const when = (value: Date | string | null | undefined) => (value ? formatDateTime(typeof value === "string" ? value : value.toISOString()) : "");
import type { SettingsDto } from "@/types/api";
import type { daySummary } from "@/lib/services/business-day";

type Day = Awaited<ReturnType<typeof daySummary>>;
type Overview = { current: Day | null; defaultFloatCents: number; history: Day[] };

const FLOAT_PRESETS = [5000, 10000, 15000, 20000];

export function CloseoutScreen() {
  const [data, setData] = useState<Overview | null>(null);
  const [currency, setCurrency] = useState("BZD");
  const [business, setBusiness] = useState("Salud Bistro");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [floatInput, setFloatInput] = useState("");
  const [editingFloat, setEditingFloat] = useState(false);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [closeAnyway, setCloseAnyway] = useState(false);
  const [report, setReport] = useState<Day | null>(null);
  const money = useCallback((cents: number) => formatMoney(cents, currency), [currency]);

  const load = useCallback(async () => {
    try {
      const [overview, settings] = await Promise.all([api<Overview>("/api/day"), api<SettingsDto>("/api/settings")]);
      setData(overview); setCurrency(settings.currency); setBusiness(settings.businessName); setError("");
      setFloatInput((value) => value || centsToInput(overview.current?.openingFloatCents ?? overview.defaultFloatCents));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the day."); }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api<Overview>("/api/day"), api<SettingsDto>("/api/settings")]).then(([overview, settings]) => {
      if (!active) return;
      setData(overview); setCurrency(settings.currency); setBusiness(settings.businessName);
      setFloatInput(centsToInput(overview.current?.openingFloatCents ?? overview.defaultFloatCents));
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the day."); });
    return () => { active = false; };
  }, []);

  async function post(body: Record<string, unknown>) {
    setPending(true); setError("");
    try { return await api<unknown>("/api/day", { method: "POST", body: JSON.stringify(body) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); return null; }
    finally { setPending(false); }
  }
  async function start() {
    const floatCents = parseMoneyToCents(floatInput);
    if (floatCents === null) { setError("Enter the opening float, for example 100.00."); return; }
    if (await post({ action: "start", floatCents })) { toast.success(editingFloat ? "Float updated" : "Day started"); setEditingFloat(false); setReport(null); await load(); }
  }
  async function close() {
    const countedCashCents = parseMoneyToCents(counted);
    if (countedCashCents === null || !counted.trim()) { setError("Count the cash drawer and enter the total."); return; }
    const closed = await post({ action: "close", countedCashCents, notes, confirmOpenOrders: closeAnyway });
    if (closed) { setReport(closed as Day); setCounted(""); setNotes(""); setCloseAnyway(false); toast.success("Day closed"); await load(); }
  }

  if (!data) return <div className="p-6 text-sm text-muted-foreground">{error || "Loading…"}</div>;
  const day = data.current;
  const countedCents = counted.trim() ? parseMoneyToCents(counted) : null;
  const difference = day && countedCents !== null ? countedCents - day.expectedCashCents : null;

  return <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {error && <p role="alert" className="mb-6 border-l-2 border-destructive bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}

      {report && <ClosedReport day={report} money={money} business={business} onDismiss={() => setReport(null)} />}

      {!day && !report && <section className="max-w-xl">
        <h2 className="text-2xl font-medium">Start the day</h2>
        <p className="mt-2 text-sm text-muted-foreground">Count the cash you&rsquo;re putting in the drawer before service. It&rsquo;s left out of the day&rsquo;s sales.</p>
        <FloatInput value={floatInput} onChange={setFloatInput} money={money} />
        <Button className="mt-6 h-12 px-6" disabled={pending} onClick={() => void start()}>{pending ? "Starting…" : `Start day with ${money(parseMoneyToCents(floatInput) ?? 0)}`}</Button>
      </section>}

      {day && <>
        <section className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-sm text-muted-foreground">Today · opened {when(day.openedAt)}{day.openedBy ? ` by ${day.openedBy}` : ""}</p>
            <h2 className="mt-1 text-4xl font-semibold tabular-nums">{money(day.totals.salesCents)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{day.totals.orders} {day.totals.orders === 1 ? "order" : "orders"} paid · {day.totals.payments} {day.totals.payments === 1 ? "payment" : "payments"}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Opening float</p>
            <p className="text-xl font-medium tabular-nums">{money(day.openingFloatCents)}</p>
            {day.totals.payments === 0 && !editingFloat && <button type="button" className="min-h-9 text-xs underline underline-offset-4" onClick={() => { setEditingFloat(true); setFloatInput(centsToInput(day.openingFloatCents)); }}>Change float</button>}
          </div>
        </section>
        {editingFloat && <section className="border-b border-border py-6"><FloatInput value={floatInput} onChange={setFloatInput} money={money} /><div className="mt-4 flex gap-2"><Button className="h-11" disabled={pending} onClick={() => void start()}>Save float</Button><Button variant="ghost" className="h-11" onClick={() => setEditingFloat(false)}>Cancel</Button></div></section>}

        <dl className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {([["Cash sales", day.totals.cashSalesCents], ["Card sales", day.totals.cardSalesCents], ["Tips", day.totals.tipsCents]] as const).map(([label, value], index) =>
            <div key={label} className={`py-5 ${index ? "pl-4 sm:pl-6" : "pr-4"}`}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-medium tabular-nums sm:text-xl">{money(value)}</dd>
            </div>)}
        </dl>

        <div className="grid gap-10 py-8 lg:grid-cols-2">
          <section>
            <h3 className="text-sm font-semibold">Cash drawer</h3>
            <dl className="mt-3 space-y-2 text-sm tabular-nums">
              <Row label="Opening float" value={money(day.openingFloatCents)} />
              <Row label="Cash sales" value={money(day.totals.cashSalesCents)} />
              <Row label="Cash tips" value={money(day.totals.cashTipsCents)} />
              <Row strong label="Should be in the drawer" value={money(day.expectedCashCents)} />
            </dl>
            <h3 className="mt-8 text-sm font-semibold">Card machine</h3>
            <dl className="mt-3 space-y-2 text-sm tabular-nums">
              <Row label="Card sales" value={money(day.totals.cardSalesCents)} />
              <Row label="Card tips" value={money(day.totals.cardTipsCents)} />
              <Row strong label="Card batch total" value={money(day.totals.cardSalesCents + day.totals.cardTipsCents)} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Should match the total on your card machine&rsquo;s end-of-day slip.</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold">By server</h3>
            {day.servers.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No payments yet today.</p> :
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-sm tabular-nums">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-normal">Server</th><th className="py-2 text-right font-normal">Orders</th><th className="py-2 text-right font-normal">Cash</th><th className="py-2 text-right font-normal">Card</th><th className="py-2 text-right font-normal">Tips</th><th className="py-2 text-right font-normal">Sales</th></tr></thead>
                <tbody>{day.servers.map((server) => <tr key={server.staffId ?? "none"} className="border-b border-border last:border-0">
                  <td className="py-3 font-medium">{server.name}</td><td className="py-3 text-right">{server.orders}</td><td className="py-3 text-right">{money(server.cashSalesCents)}</td><td className="py-3 text-right">{money(server.cardSalesCents)}</td><td className="py-3 text-right">{money(server.tipsCents)}</td><td className="py-3 text-right font-medium">{money(server.salesCents)}</td>
                </tr>)}</tbody>
              </table></div>}
          </section>
        </div>

        <section className="border-t border-border pt-8">
          <h3 className="text-lg font-medium">Close the day</h3>
          <p className="mt-1 text-sm text-muted-foreground">Count all the cash in the drawer, including the float, and enter the total.</p>
          {day.openOrders > 0 && <div className="mt-4 border-l-2 border-warning bg-warning-soft px-4 py-3 text-sm">
            <p><strong>{day.openOrders} {day.openOrders === 1 ? "order is" : "orders are"} still open.</strong> Take payment or cancel {day.openOrders === 1 ? "it" : "them"} first. <Link href="/orders" className="underline underline-offset-4">Go to orders</Link></p>
            <label className="mt-2 flex min-h-9 items-center gap-2"><input type="checkbox" className="size-4" checked={closeAnyway} onChange={(event) => setCloseAnyway(event.target.checked)} />Close the day anyway</label>
          </div>}
          <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <label htmlFor="counted" className="block text-sm font-medium">Cash counted</label>
              <Input id="counted" inputMode="decimal" placeholder={centsToInput(day.expectedCashCents)} value={counted} onChange={(event) => setCounted(event.target.value)} className="mt-2 h-14 text-2xl tabular-nums" />
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Expected {money(day.expectedCashCents)}</span>
                {difference !== null && <span className={`text-base font-semibold tabular-nums ${difference === 0 ? "text-success" : difference < 0 ? "text-destructive" : "text-warning"}`}>{difference === 0 ? "Balanced" : difference < 0 ? `Short ${money(-difference)}` : `Over ${money(difference)}`}</span>}
              </div>
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Textarea id="notes" value={notes} maxLength={500} placeholder="e.g. $5 paid out for ice" onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-14" />
            </div>
          </div>
          <Button className="mt-6 h-12 px-6" disabled={pending || !counted.trim() || (day.openOrders > 0 && !closeAnyway)} onClick={() => void close()}>{pending ? "Closing…" : "Close day"}</Button>
        </section>
      </>}

      {data.history.length > 0 && <section className="mt-14">
        <h3 className="text-sm font-semibold">Previous days</h3>
        <ul className="mt-3 divide-y divide-border border-y border-border text-sm tabular-nums">
          {data.history.map((past) => <li key={past.id}><button type="button" className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-6 py-3 text-left hover:bg-hover" onClick={() => setReport(past)}>
            <span>{when(past.closedAt ?? past.openedAt)}{past.closedBy ? <span className="text-muted-foreground"> · {past.closedBy}</span> : null}</span>
            <span className="font-medium">{money(past.totals.salesCents)}</span>
            <span className={`whitespace-nowrap text-right sm:min-w-32 ${!past.differenceCents ? "text-muted-foreground" : past.differenceCents < 0 ? "text-destructive" : "text-warning"}`}>{past.differenceCents ? `${past.differenceCents < 0 ? "Short" : "Over"} ${money(Math.abs(past.differenceCents))}` : "Balanced"}</span>
          </button></li>)}
        </ul>
      </section>}
    </div>
  </div>;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-2 text-base font-semibold" : "text-muted-foreground"}`}><dt>{label}</dt><dd className={strong ? "" : "text-foreground"}>{value}</dd></div>;
}

function FloatInput({ value, onChange, money }: { value: string; onChange: (value: string) => void; money: (cents: number) => string }) {
  return <div className="mt-6">
    <label htmlFor="float" className="block text-sm font-medium">Opening cash float</label>
    <Input id="float" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-14 max-w-xs text-2xl tabular-nums" />
    <div className="mt-3 flex flex-wrap gap-2">{FLOAT_PRESETS.map((cents) => <button key={cents} type="button" onClick={() => onChange(centsToInput(cents))} className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${parseMoneyToCents(value) === cents ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-hover"}`}>{money(cents)}</button>)}</div>
  </div>;
}

function ClosedReport({ day, money, business, onDismiss }: { day: Day; money: (cents: number) => string; business: string; onDismiss: () => void }) {
  const diff = day.differenceCents ?? 0;
  const lines: Array<[string, string]> = [
    ["Opening float", money(day.openingFloatCents)], ["Cash sales", money(day.totals.cashSalesCents)], ["Cash tips", money(day.totals.cashTipsCents)],
    ["Expected cash", money(day.expectedCashCents)], ["Counted cash", money(day.countedCashCents ?? 0)], [diff < 0 ? "Short" : diff > 0 ? "Over" : "Difference", money(Math.abs(diff))],
    ["Card sales", money(day.totals.cardSalesCents)], ["Card tips", money(day.totals.cardTipsCents)], ["Total sales", money(day.totals.salesCents)], ["Total tips", money(day.totals.tipsCents)],
  ];
  return <section className="mb-12 border border-border bg-card p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Day closed {when(day.closedAt)}{day.closedBy ? ` by ${day.closedBy}` : ""}</p>
        <h2 className="mt-1 text-2xl font-medium">{diff === 0 ? "Drawer balanced" : diff < 0 ? `Drawer short ${money(-diff)}` : `Drawer over ${money(diff)}`}</h2>
      </div>
      <div className="flex gap-2"><Button variant="outline" className="h-11" onClick={() => window.print()}><Printer /> Print</Button><Button variant="ghost" className="h-11" onClick={onDismiss}>Done</Button></div>
    </div>
    <dl className="mt-6 grid gap-x-10 gap-y-2 text-sm tabular-nums sm:grid-cols-2">{lines.map(([label, value]) => <div key={label} className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
    {day.servers.length > 0 && <p className="mt-4 text-sm text-muted-foreground">{day.servers.map((server) => `${server.name} ${money(server.salesCents)} (tips ${money(server.tipsCents)})`).join(" · ")}</p>}
    {day.notes && <p className="mt-3 text-sm">Note: {day.notes}</p>}

    {/* 80mm close-out slip for the receipt printer */}
    <div className="receipt-document hidden bg-white p-4 text-black print:block">
      <p className="text-center text-lg font-bold uppercase tracking-[0.18em]">{business}</p>
      <p className="mt-1 text-center text-xs uppercase">End of day · Demo</p>
      <p className="mt-3 text-xs">Opened {when(day.openedAt)}{day.openedBy ? ` · ${day.openedBy}` : ""}<br />Closed {when(day.closedAt)}{day.closedBy ? ` · ${day.closedBy}` : ""}</p>
      <div className="mt-3 space-y-1 border-y border-dashed border-black py-2 text-sm">{lines.map(([label, value]) => <div key={label} className="flex justify-between"><span>{label}</span><span>{value}</span></div>)}</div>
      {day.servers.length > 0 && <div className="mt-2 space-y-1 text-xs">{day.servers.map((server) => <div key={server.staffId ?? "none"} className="flex justify-between"><span>{server.name} ({server.orders})</span><span>{money(server.salesCents)} · tips {money(server.tipsCents)}</span></div>)}</div>}
      {day.notes && <p className="mt-2 text-xs">Note: {day.notes}</p>}
    </div>
  </section>;
}
