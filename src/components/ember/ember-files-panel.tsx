"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { SearchPanel } from "@/components/chat/search-panel";
import { openDirect } from "@/lib/chat.functions";
import type { ChatDirectoryPerson, ChatSearchFile, ChatSearchMessage } from "@/lib/chat.functions";
import { toast } from "sonner";

/** Files search over Supabase chat-attachments (Vercel / Chat Hub). */
export function EmberFilesPanel() {
  const { t } = useTranslation();
  const router = useRouter();

  function openConversation(id: string, focus?: { messageId?: string }) {
    const params = new URLSearchParams();
    params.set("c", id);
    if (focus?.messageId) params.set("m", focus.messageId);
    router.push(`/ember?${params.toString()}`);
  }

  async function choosePerson(person: ChatDirectoryPerson) {
    if (!person.userId) {
      toast.error(t("chat.noLoginTitle"));
      return;
    }
    const result = await openDirect({ otherUserId: person.userId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    openConversation(result.data.conversationId);
  }

  function openMessage(message: ChatSearchMessage) {
    openConversation(message.conversationId, { messageId: message.id });
  }

  function openFile(file: ChatSearchFile) {
    openConversation(file.conversationId, { messageId: file.messageId });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm text-muted-foreground">{t("ember.filesNativeHint")}</p>
      <SearchPanel
        conversationId={null}
        canFilterDepartments
        onOpenConversation={(id) => openConversation(id)}
        onOpenMessage={openMessage}
        onOpenPerson={(person) => void choosePerson(person)}
        onOpenFile={openFile}
      />
    </div>
  );
}
