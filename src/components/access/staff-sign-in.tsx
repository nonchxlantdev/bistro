"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Delete } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { api } from "@/lib/api-client";
import { safeDemoDestination } from "@/lib/demo-policy";

type Person = { id: string; name: string; role: string };
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const DEMO_PINS: Record<string, string> = { staff_maria: "1234", staff_daniel: "1111", staff_ana: "2222", staff_luis: "3333" };

export function StaffSignIn() {
  const next = safeDemoDestination(useSearchParams().get("next"));
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [current, setCurrent] = useState<Person | null>(null);
  const [chosen, setChosen] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ staff: Person[]; current: Person | null }>("/api/staff").then((data) => { setStaff(data.staff); setCurrent(data.current); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load staff."));
  }, []);

  const submit = useCallback(async (value: string) => {
    if (!chosen || pending) return;
    setPending(true); setError("");
    try {
      await api("/api/staff", { method: "POST", body: JSON.stringify({ action: "login", staffId: chosen.id, pin: value }) });
      window.location.replace(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); setPin(""); setPending(false); }
  }, [chosen, pending, next]);

  const press = useCallback((key: string) => {
    if (pending) return;
    setError("");
    setPin((value) => {
      if (key === "back") return value.slice(0, -1);
      if (key === "clear") return "";
      if (value.length >= 4) return value;
      const updated = value + key;
      if (updated.length === 4) void submit(updated);
      return updated;
    });
  }, [pending, submit]);

  useEffect(() => {
    if (!chosen) return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") press("back");
      else if (event.key === "Escape") { setChosen(null); setPin(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chosen, press]);

  return <main className="flex min-h-dvh flex-col bg-background">
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <BrandLogo wordmark className="h-auto w-24 text-foreground" />
      <p className="text-xs text-muted-foreground">Staff sign-in</p>
    </header>
    <section className="flex flex-1 items-start justify-center px-5 py-10 sm:items-center">
      {!chosen ? <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-medium">Who&rsquo;s working?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tap your name, then enter your 4-digit PIN.</p>
        {current && <p className="mt-4 text-sm">Signed in as <strong>{current.name}</strong>. <button type="button" className="underline underline-offset-4" onClick={() => window.location.replace(next)}>Continue</button></p>}
        {error && <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {(staff ?? []).map((person) => <li key={person.id}>
            <button type="button" onClick={() => { setChosen(person); setPin(""); setError(""); }} className="flex w-full flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-6 transition-colors hover:border-foreground/30 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-primary text-lg font-medium text-primary-foreground">{initials(person.name)}</span>
              <span className="text-base font-medium">{person.name}</span>
              <span className="text-xs text-muted-foreground">{person.role === "MANAGER" ? "Manager" : "Server"}</span>
            </button>
          </li>)}
          {staff === null && !error && Array.from({ length: 4 }, (_, index) => <li key={index} className="h-[150px] rounded-lg border border-border bg-card/60" />)}
        </ul>
        {staff && staff.some((person) => DEMO_PINS[person.id]) && <p className="mt-8 text-xs text-muted-foreground">Demo PINs · {staff.filter((person) => DEMO_PINS[person.id]).map((person) => `${person.name} ${DEMO_PINS[person.id]}`).join(" · ")}</p>}
      </div>
      : <div className="w-full max-w-xs text-center">
        <button type="button" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setChosen(null); setPin(""); setError(""); }}><ArrowLeft className="size-4" /> Not {chosen.name}?</button>
        <span aria-hidden className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-xl font-medium text-primary-foreground">{initials(chosen.name)}</span>
        <h1 className="mt-4 text-2xl font-medium">{chosen.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter your PIN</p>
        <div className="mt-6 flex justify-center gap-4" aria-label={`${pin.length} of 4 digits entered`} role="status">
          {[0, 1, 2, 3].map((index) => <span key={index} className={`size-3.5 rounded-full border ${index < pin.length ? "border-foreground bg-foreground" : "border-foreground/40"}`} />)}
        </div>
        <p role="alert" className="mt-4 min-h-5 text-sm text-destructive">{error}</p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((key) =>
            <button key={key} type="button" disabled={pending} onClick={() => press(key)} aria-label={key === "back" ? "Delete digit" : key === "clear" ? "Clear PIN" : key}
              className={`flex h-16 items-center justify-center rounded-lg text-2xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 ${key === "clear" || key === "back" ? "text-sm text-muted-foreground hover:bg-hover" : "border border-border bg-card hover:bg-hover active:bg-secondary"}`}>
              {key === "back" ? <Delete className="size-5" /> : key === "clear" ? "Clear" : key}
            </button>)}
        </div>
      </div>}
    </section>
  </main>;
}
