"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

type Person = { id: string; name: string; role: string; active: boolean };
const pinOk = (pin: string) => /^\d{4}$/.test(pin);

/** Team list for the tap-name + PIN sign-in. Only managers can make changes. */
export function StaffSettings() {
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "SERVER", pin: "" });
  const [pending, setPending] = useState(false);
  const manager = me?.role === "MANAGER";

  async function load() {
    const [list, session] = await Promise.all([api<Person[]>("/api/staff/manage"), api<{ current: { id: string; role: string } | null }>("/api/staff")]);
    setStaff(list); setMe(session.current);
  }
  useEffect(() => {
    let active = true;
    Promise.all([api<Person[]>("/api/staff/manage"), api<{ current: { id: string; role: string } | null }>("/api/staff")])
      .then(([list, session]) => { if (active) { setStaff(list); setMe(session.current); } })
      .catch(() => { if (active) setStaff([]); });
    return () => { active = false; };
  }, []);

  function begin(person: Person | null) {
    setEditing(person?.id ?? "new");
    setForm({ name: person?.name ?? "", role: person?.role ?? "SERVER", pin: "" });
  }
  async function save() {
    if (!form.name.trim()) { toast.error("Enter a name."); return; }
    if ((editing === "new" || form.pin) && !pinOk(form.pin)) { toast.error("PIN must be exactly 4 digits."); return; }
    setPending(true);
    try {
      if (editing === "new") await api("/api/staff/manage", { method: "POST", body: JSON.stringify(form) });
      else await api(`/api/staff/manage/${editing}`, { method: "PATCH", body: JSON.stringify({ name: form.name, role: form.role, ...(form.pin ? { pin: form.pin } : {}) }) });
      toast.success(editing === "new" ? `${form.name.trim()} added` : "Saved"); setEditing(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save."); }
    finally { setPending(false); }
  }
  async function toggle(person: Person) {
    setPending(true);
    try { await api(`/api/staff/manage/${person.id}`, { method: "PATCH", body: JSON.stringify({ active: !person.active }) }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update."); }
    finally { setPending(false); }
  }

  const editor = <div className="grid gap-3 border-b border-border bg-muted/40 px-4 py-4 sm:grid-cols-[1fr_140px_120px_auto] sm:items-end">
    <label className="text-sm">Name<Input className="mt-1.5 h-11" value={form.name} maxLength={40} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label className="text-sm">Role<select className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="SERVER">Server</option><option value="MANAGER">Manager</option></select></label>
    <label className="text-sm">{editing === "new" ? "PIN" : "New PIN"}<Input className="mt-1.5 h-11 tracking-[0.3em]" inputMode="numeric" maxLength={4} placeholder={editing === "new" ? "4 digits" : "Keep"} value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
    <div className="flex gap-2"><Button className="h-11" disabled={pending} onClick={() => void save()}>Save</Button><Button variant="ghost" className="h-11" onClick={() => setEditing(null)}>Cancel</Button></div>
  </div>;

  return <section className="service-panel">
    <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
      <div><h3 className="font-semibold">Staff</h3><p className="mt-1 text-sm text-muted-foreground">People who sign in with their name and a 4-digit PIN. Sales and tips are recorded per person.</p></div>
      {manager && editing !== "new" && <Button variant="outline" className="h-11" onClick={() => begin(null)}>Add staff</Button>}
    </div>
    {!manager && me && <p className="px-5 pb-4 text-xs text-muted-foreground">Only a manager can add staff or change PINs.</p>}
    {editing === "new" && editor}
    <ul className="border-t border-border">
      {(staff ?? []).map((person) => <li key={person.id} className="border-b border-border last:border-0">
        {editing === person.id ? editor : <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <span aria-hidden className={`flex size-9 items-center justify-center rounded-full text-xs font-medium ${person.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className={`font-medium ${person.active ? "" : "text-muted-foreground line-through"}`}>{person.name}{person.id === me?.id ? <span className="ml-2 text-xs font-normal text-muted-foreground">You</span> : null}</p><p className="text-xs text-muted-foreground">{person.role === "MANAGER" ? "Manager" : "Server"}{person.active ? "" : " · Inactive"}</p></div>
          {manager && <div className="flex gap-1"><Button variant="ghost" className="h-10" disabled={pending} onClick={() => begin(person)}>Edit</Button><Button variant="ghost" className="h-10 text-muted-foreground" disabled={pending || person.id === me?.id} onClick={() => void toggle(person)}>{person.active ? "Deactivate" : "Reactivate"}</Button></div>}
        </div>}
      </li>)}
    </ul>
  </section>;
}
