"use client";
import { SettlementWorkspace } from "@/components/orders/settlement-workspace";

export function SplitBillScreen({ orderId, onBack, onClosed, onDirtyChange, onBusyChange }: { orderId: string; onBack?: () => void; onClosed?: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  return <SettlementWorkspace orderId={orderId} initialMode="split" onDismiss={onBack} onClosed={onClosed} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange} />;
}

