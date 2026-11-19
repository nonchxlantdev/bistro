import { Suspense } from "react";
import { DemoAccessScreen } from "@/components/access/demo-access-screen";
export default function LoginPage() { return <Suspense fallback={<main className="min-h-dvh bg-background" />}><DemoAccessScreen step="login" /></Suspense>; }
