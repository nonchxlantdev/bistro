"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TableGrid } from "@/components/tables/table-grid";
import { TableOrderDialog } from "@/components/tables/table-order-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { SettingsDto, TableDto } from "@/types/api";

export function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<TableDto[] | null>(null);
  const [currency, setCurrency] = useState("BZD");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableDto | null>(null);
  const [initialView, setInitialView] = useState<"order" | "bill" | "split" | "checkout">("order");
  const [filter, setFilter] = useState<"ALL" | TableDto["status"]>("ALL");

  async function load() {
    try {
      const [nextTables, settings] = await Promise.all([
        api<TableDto[]>("/api/tables"),
        api<SettingsDto>("/api/settings"),
      ]);
      setTables(nextTables);
      setCurrency(settings.currency);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load tables.");
    }
  }

  useEffect(() => {
    let ignore = false;
    Promise.all([api<TableDto[]>("/api/tables"), api<SettingsDto>("/api/settings")])
      .then(([nextTables, settings]) => {
        if (ignore) return;
        setTables(nextTables);
        setCurrency(settings.currency);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "Could not load tables.");
      });
    const kick = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      ignore = true;
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, []);

  function openTable(table: TableDto) {
    if (table.status === "RESERVED") {
      toast.error("This table is reserved.");
      return;
    }
    if (table.order) {
      setInitialView("order");
      setSelectedTable(table);
      return;
    }
    router.push(`/pos?tableId=${table.id}`);
  }

  async function reserve(table: TableDto) {
    setPendingId(table.id);
    try {
      const updated = await api<TableDto>(`/api/tables/${table.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isReserved: !table.isReserved }),
      });
      setTables((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? null);
      toast.success(updated.isReserved ? `${updated.name} reserved` : `${updated.name} is available`);
    } catch (reserveError) {
      toast.error(reserveError instanceof Error ? reserveError.message : "Could not update the table.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tables ? `${tables.length} tables · Select a table to manage its check` : "Loading floor"}
        </p>
        <Button type="button" variant="outline" className="h-11" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{(["ALL", "AVAILABLE", "OCCUPIED", "RESERVED"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`flex min-h-16 items-center justify-between gap-2 rounded-xl border px-4 text-sm ${filter === value ? "border-sage bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"}`}><span>{value === "ALL" ? "All tables" : value[0] + value.slice(1).toLowerCase()}</span><strong className="text-xl font-medium">{tables ? tables.filter((table) => value === "ALL" || table.status === value).length : "—"}</strong></button>)}</div>
      {error ? <p className="mb-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {!tables && !error ? <LoadingState label="Loading tables" /> : null}
      {tables && tables.length === 0 ? (
        <EmptyState title="No tables yet" description="Seed the database to create the demo floor." />
      ) : null}
      {tables && tables.length > 0 ? (
        <TableGrid tables={tables.filter((table) => filter === "ALL" || table.status === filter)} currency={currency} now={now} pendingId={pendingId} onOpen={openTable} onReserve={(table) => void reserve(table)} onAction={(table, action) => { setInitialView(action); setSelectedTable(table); }} />
      ) : null}
      {tables && tables.length > 0 && !tables.some((table) => filter === "ALL" || table.status === filter) && <p className="service-panel p-5 text-sm text-muted-foreground">No tables in this view.</p>}
      {selectedTable?.order && <TableOrderDialog table={selectedTable} initialView={initialView} currency={currency} onClose={() => { setSelectedTable(null); void load(); }} />}
    </div>
  );
}
