import { Suspense } from "react";
import { StaffSignIn } from "@/components/access/staff-sign-in";
export default function StaffPage() { return <Suspense fallback={<main className="min-h-dvh bg-background" />}><StaffSignIn /></Suspense>; }
