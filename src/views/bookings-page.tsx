"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createBooking, updateBookingStatus } from "@/lib/bookings.functions";
import { useBookings } from "@/hooks/queries/useBookings";
import { useSites } from "@/hooks/queries/useSites";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtQar } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["quote", "deposit", "confirmed", "delivered", "cancelled", "no_show"] as const;
const KINDS = ["party", "group", "corporate", "school"] as const;

function BookingsPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Calendar className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-xs text-muted-foreground">
            Parties, groups, corporate, and school bookings — quote → deposit → confirmed → delivered.
          </p>
        </div>
      </header>
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Bookings</TabsTrigger>
          <TabsTrigger value="new">New booking</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4"><BookingsList /></TabsContent>
        <TabsContent value="new" className="mt-4"><NewBookingForm /></TabsContent>
      </Tabs>
    </div>
  );
}

function BookingsList() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const [status, setStatus] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
      const qc = useQueryClient();
  const bookingsQ = useBookings({
    locationId: locationId ?? null,
    status: status === "all" ? null : status,
    kind: kind === "all" ? null : kind,
  });
  const { data, isLoading } = bookingsQ;
  const rows = data?.items ?? [];
  const mutation = useMutation({
    mutationFn: (input: { id: string; status: (typeof STATUSES)[number] }) =>
      updateBookingStatus(input),
    onSuccess: () => {
      toast.success("Booking updated");
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Status" value={status} onChange={setStatus} options={["all", ...STATUSES]} />
        <FilterSelect label="Kind" value={kind} onChange={setKind} options={["all", ...KINDS]} />
      </div>
      {isLoading ? (
        <Empty>Loading bookings…</Empty>
      ) : rows.length === 0 ? (
        <Empty>No bookings in scope.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Pax</th>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Quote</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 font-mono text-xs">{b.reference}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{b.contact_name}</div>
                    <div className="text-[11px] text-muted-foreground">{b.contact_email ?? b.contact_phone ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs"><Badge variant="outline" className="uppercase">{b.kind}</Badge></td>
                  <td className="px-3 py-2 text-xs">{b.party_size}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(b.starts_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{b.quote_amount != null ? fmtQar(b.quote_amount) : "—"}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={b.status}
                      onValueChange={(v) => mutation.mutate({ id: b.id, status: v as (typeof STATUSES)[number] })}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewBookingForm() {
  const currentLoc = useAppStore((s) => s.currentLocationId);
      const qc = useQueryClient();
  const locsQ = useSites();
  const [form, setForm] = useState({
    location_id: currentLoc ?? "",
    kind: "party" as (typeof KINDS)[number],
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    party_size: 10,
    starts_at: "",
    quote_amount: "",
    notes: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      createBooking({
          location_id: form.location_id,
          kind: form.kind,
          contact_name: form.contact_name,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          party_size: Number(form.party_size) || 1,
          starts_at: new Date(form.starts_at).toISOString(),
          quote_amount: form.quote_amount ? Number(form.quote_amount) : null,
          notes: form.notes || null,
        }),
    onSuccess: () => {
      toast.success("Booking created as a quote");
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      setForm((f) => ({ ...f, contact_name: "", contact_email: "", contact_phone: "", notes: "", quote_amount: "" }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface/30 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.location_id || !form.contact_name || !form.starts_at) {
          toast.error("Branch, contact and start time are required");
          return;
        }
        mutation.mutate();
      }}
    >
      <Row>
        <Field label="Branch" required>
          <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {(locsQ.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kind">
          <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as never }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </Row>
      <Row>
        <Field label="Contact name" required>
          <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
        </Field>
        <Field label="Party size" required>
          <Input type="number" min={1} value={form.party_size} onChange={(e) => setForm((f) => ({ ...f, party_size: Number(e.target.value) }))} />
        </Field>
      </Row>
      <Row>
        <Field label="Email">
          <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
        </Field>
        <Field label="Phone">
          <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
        </Field>
      </Row>
      <Row>
        <Field label="Start" required>
          <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
        </Field>
        <Field label="Quote (QAR)">
          <Input type="number" min={0} value={form.quote_amount} onChange={(e) => setForm((f) => ({ ...f, quote_amount: e.target.value }))} />
        </Field>
      </Row>
      <Field label="Notes">
        <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create quote
        </Button>
      </div>
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label} {required ? <span className="text-rose-400">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default BookingsPage;
