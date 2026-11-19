"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { DEMO_NOTICES, safeDemoDestination } from "@/lib/demo-policy";
import { resetFirstUseTips } from "@/lib/first-use-tips";

export function DemoAccessScreen({ step }: { step: "login" | "disclaimer" | "welcome" }) {
  const params = useSearchParams();
  const next = safeDemoDestination(params.get("next"));
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step !== "welcome") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => window.location.replace(next), reduce ? 350 : 2400);
    return () => window.clearTimeout(timer);
  }, [step, next]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (step === "disclaimer" && !accepted)) return;
    setPending(true); setError("");
    try {
      await api("/api/demo-access", { method: "POST", body: JSON.stringify(step === "login" ? { action: "login", password } : { action: "accept", accepted }) });
      setPassword("");
      if (step === "login") resetFirstUseTips();
      window.location.replace(`${step === "login" ? "/disclaimer" : "/welcome"}?next=${encodeURIComponent(next)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not continue. Please try again."); setPending(false); }
  }

  if (step === "welcome") return <main className="demo-welcome flex min-h-dvh flex-col items-center justify-center bg-sidebar px-6 py-12 text-center text-sidebar-foreground">
    <div className="welcome-mark"><BrandLogo wordmark className="h-auto w-[min(64vw,360px)]" /></div>
    <div className="welcome-copy mt-9"><p className="text-sm text-brass">The Salud Bistro experience</p><h1 className="mt-3 text-3xl sm:text-4xl">Welcome to the demo.</h1><p className="mt-4 text-sm text-sidebar-foreground/75">Your table is ready. Explore at your own pace.</p></div>
    <div aria-hidden="true" className="welcome-track mt-10 h-0.5 w-32 overflow-hidden bg-sidebar-border"><span className="block h-full bg-brass" /></div>
    <p className="mt-12 text-xs text-sidebar-foreground/65">Demo environment · Powered by Vision Forge Studio</p>
  </main>;

  return <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
    <aside className="flex flex-col justify-between bg-sidebar px-7 py-7 text-sidebar-foreground sm:px-12 lg:min-h-dvh lg:px-14 lg:py-12">
      <div className="flex items-center justify-between gap-6 lg:block"><BrandLogo wordmark className="h-auto w-36 lg:w-[min(100%,280px)]" /><p className="text-xs text-brass lg:mt-6">Restaurant & Café · Demo</p></div>
      <div className="my-12 hidden max-w-sm lg:block"><p className="font-serif text-4xl leading-tight">A feel for a<br />smoother service.</p><p className="mt-5 text-sm leading-relaxed text-sidebar-foreground/75">From the first order to the final check. Discover Salud Bistro’s restaurant experience.</p></div>
      <p className="mt-5 hidden text-xs text-sidebar-foreground/65 lg:block">Powered by Vision Forge Studio</p>
    </aside>
    <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14 lg:py-12">
      <div className={`w-full ${step === "login" ? "max-w-md" : "max-w-xl"}`}>
        <ol aria-label="Demo access steps" className="mb-8 flex gap-6 text-xs"><li aria-current={step === "login" ? "step" : undefined} className={step === "login" ? "font-semibold" : "text-muted-foreground"}>01 · Demo access</li><li aria-current={step === "disclaimer" ? "step" : undefined} className={step === "disclaimer" ? "font-semibold" : "text-muted-foreground"}>02 · Before you enter</li></ol>
        <h1 className="text-3xl font-medium">{step === "login" ? "Step inside Salud Bistro." : "A demo, for exploration."}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step === "login" ? "Enter the demo password shared by your host to continue." : "Please read and accept these terms before exploring the system."}</p>
        <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-6">
          {step === "login" ? <div><label htmlFor="demo-password" className="mb-2 block text-sm font-medium">Demo password</label><div className="relative"><Input id="demo-password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} className="h-12 pr-14" aria-describedby={error ? "access-error" : undefined} aria-invalid={Boolean(error)} /><Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 size-10" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff /> : <Eye />}</Button></div></div> : <>
            <div className="space-y-5">{DEMO_NOTICES.map((notice) => <section key={notice.title}><h2 className="font-sans text-sm font-semibold tracking-normal">{notice.title}</h2><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{notice.text}</p></section>)}</div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed"><input type="checkbox" required checked={accepted} disabled={pending} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 size-4 shrink-0" /><span>I have read and accept this disclaimer. I understand this is solely a demo and not a final product.</span></label>
          </>}
          {error && <p id="access-error" role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full justify-between px-5" disabled={pending || (step === "disclaimer" && !accepted)}>{pending ? "Please wait…" : step === "login" ? "Continue" : "Accept & enter demo"}<ArrowRight /></Button>
        </form>
        <p className="mt-6 flex items-center gap-2 text-xs leading-relaxed text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />{step === "login" ? "Private demo access · No account required" : "Your acceptance applies to this demo session."}</p>
        <p className="mt-10 text-center text-xs text-muted-foreground lg:hidden">Powered by Vision Forge Studio</p>
      </div>
    </section>
  </main>;
}
