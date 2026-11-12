"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useCallCenterSoftphoneOptional } from "@/components/call-center/softphone-provider";
import { FecButton as Button, FecLoader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  loadCallCenterContacts,
  removeCallCenterContact,
  saveCallCenterContact,
} from "@/lib/call-center/call-center.functions";
import { canUserDo } from "@/lib/rbac";
import { CallCenterShell } from "@/views/call-center-section-nav";

function CallCenterContactsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const softphone = useCallCenterSoftphoneOptional();
  const queryClient = useQueryClient();
  const canUse = canUserDo(
    roles.map((r) => r.role),
    "call_center.view",
  );
  const [name, setName] = useState("");
  const [e164, setE164] = useState("+974");
  const [company, setCompany] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  const bundle = useQuery({
    queryKey: ["call-center", "contacts"],
    enabled: canUse,
    queryFn: async () => {
      const result = await loadCallCenterContacts({});
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  if (!canUse) {
    return (
      <CallCenterShell titleKey="callCenter.contactsTitle" subtitleKey="callCenter.contactsSubtitle">
        <p className="text-sm text-muted-foreground">{t("callCenter.forbidden")}</p>
      </CallCenterShell>
    );
  }

  const contacts = (bundle.data?.contacts ?? []).filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.displayName.toLowerCase().includes(q) ||
      c.e164.includes(q) ||
      c.company.toLowerCase().includes(q)
    );
  });

  async function onSave() {
    setPending(true);
    try {
      const result = await saveCallCenterContact({
        displayName: name,
        e164,
        company,
        isFavorite: false,
      });
      if (!result.ok) throw new Error(result.error);
      setName("");
      setE164("+974");
      setCompany("");
      toast.success(t("callCenter.contactSaved"));
      await queryClient.invalidateQueries({ queryKey: ["call-center", "contacts"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("callCenter.loadError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <CallCenterShell titleKey="callCenter.contactsTitle" subtitleKey="callCenter.contactsSubtitle">
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border/50 bg-card/70 p-4">
          <p className="text-sm font-semibold">{t("callCenter.addContact")}</p>
          <div className="mt-3 space-y-2">
            <div>
              <Label>{t("callCenter.contactName")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("callCenter.contactPhone")}</Label>
              <Input value={e164} onChange={(e) => setE164(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("callCenter.contactCompany")}</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1" />
            </div>
            <Button type="button" disabled={pending || !name.trim() || e164.length < 4} onClick={() => void onSave()}>
              {t("callCenter.saveContact")}
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("callCenter.searchContacts")}
          />
          {bundle.isLoading ? (
            <div className="flex justify-center py-12">
              <FecLoader density="page" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("callCenter.contactsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/60">
              {contacts.map((contact) => (
                <li key={contact.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      {contact.isFavorite ? <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden /> : null}
                      {contact.displayName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {contact.e164}
                      {contact.company ? ` · ${contact.company}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!softphone?.canUse || softphone.pending}
                    onClick={() => softphone?.onDial(contact.e164)}
                  >
                    <Phone className="me-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("callCenter.call")}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("callCenter.deleteContact")}
                    onClick={() => {
                      void (async () => {
                        const result = await removeCallCenterContact({ id: contact.id });
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success(t("callCenter.contactDeleted"));
                        await queryClient.invalidateQueries({ queryKey: ["call-center", "contacts"] });
                      })();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CallCenterShell>
  );
}

export default CallCenterContactsPage;
