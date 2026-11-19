"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { SettlementWorkspace } from "@/components/orders/settlement-workspace";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TableDto } from "@/types/api";

export function TableOrderDialog({ table, currency, onClose, initialView = "order" }: { table: TableDto; currency: string; onClose: () => void; initialView?: "order" | "bill" | "split" | "checkout" }) {
  const router = useRouter();
  const flags = useRef({ busy: false, dirty: false });
  function dismiss() {
    if (flags.current.busy || (flags.current.dirty && !window.confirm("Discard unsaved allocation changes and close checkout? Saved payments will be kept."))) return false;
    onClose(); return true;
  }
  return <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
    <DialogContent className="checkout-modal" showCloseButton={false}>
      <DialogHeader className="sr-only"><DialogTitle>{table.name} checkout</DialogTitle><DialogDescription>Review the table, take one payment or split the bill, then explicitly close the table when paid.</DialogDescription></DialogHeader>
      <SettlementWorkspace orderId={table.order!.id} currency={currency} initialMode={initialView === "split" ? "split" : "one"} initialReceipt={initialView === "bill"} onDismiss={dismiss} onClosed={onClose} onEditOrder={() => { if (dismiss()) router.push("/pos?orderId=" + table.order!.id); }} onDirtyChange={(dirty) => { flags.current.dirty = dirty; }} onBusyChange={(busy) => { flags.current.busy = busy; }} />
    </DialogContent>
  </Dialog>;
}

