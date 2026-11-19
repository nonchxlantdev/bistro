import { Suspense } from "react";
import { DemoAccessScreen } from "@/components/access/demo-access-screen";
export default function WelcomePage() { return <Suspense fallback={<main className="min-h-dvh bg-sidebar" />}><DemoAccessScreen step="welcome" /></Suspense>; }
