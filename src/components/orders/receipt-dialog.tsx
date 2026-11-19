"use client";

import { ReceiptScreen } from "@/components/orders/receipt-screen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ReceiptDialog({ orderId, guestId, open, onOpenChange }: { orderId: string; guestId?: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-receipt-dialog className="max-h-[90dvh] overflow-y-auto bg-background sm:max-w-lg">
      <DialogHeader className="receipt-controls pr-8">
        <DialogTitle>{guestId ? "Guest bill" : "Receipt"}</DialogTitle>
        <DialogDescription>Review the receipt before printing.</DialogDescription>
      </DialogHeader>
      {open && <ReceiptScreen orderId={orderId} guestId={guestId} embedded />}
      <div className="receipt-controls space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2"><Button type="button" disabled>Send to printer</Button><Button type="button" variant="outline" onClick={() => window.print()}>Print with browser</Button></div>
        <p className="text-xs text-muted-foreground">Direct printer connection is not configured yet.</p>
      </div>
    </DialogContent>
  </Dialog>;
}
