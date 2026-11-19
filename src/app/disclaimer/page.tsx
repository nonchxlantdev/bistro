import { Suspense } from "react";
import { DemoAccessScreen } from "@/components/access/demo-access-screen";
export default function DisclaimerPage() { return <Suspense fallback={<main className="min-h-dvh bg-background" />}><DemoAccessScreen step="disclaimer" /></Suspense>; }
