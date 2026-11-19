import { Suspense } from "react";
import { PosScreen } from "@/components/pos/pos-screen";
import { LoadingState } from "@/components/states/loading-state";

export default function PosPage() {
  return (
    <Suspense fallback={<LoadingState label="Opening the register" />}>
      <PosScreen />
    </Suspense>
  );
}
