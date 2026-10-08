"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  chatPreparedAttachment,
  type ChatAttachmentIssue,
} from "@/lib/chat/attachment-rules";

const ACCEPT = [
  ".pdf",
  ".txt",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".m4a",
  ".wav",
].join(",");

export type PickedAttachment = {
  clientAttachmentId: string;
  file: File;
  filename: string;
  mimeType: string;
  byteSize: number;
  previewUrl: string | null;
};

async function inspect(file: File): Promise<{ ok: true; mimeType: string; filename: string } | { ok: false; issue: ChatAttachmentIssue }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return chatPreparedAttachment({ fileType: file.type, bytes, filename: file.name || "file" });
}

export async function acceptChatFiles(
  files: File[],
  count: number,
): Promise<{ accepted: PickedAttachment[]; issue: ChatAttachmentIssue | "many" | null }> {
  const room = CHAT_ATTACHMENT_MAX_PER_MESSAGE - count;
  if (room <= 0) return { accepted: [], issue: "many" };
  const accepted: PickedAttachment[] = [];
  let issue: ChatAttachmentIssue | "many" | null = files.length > room ? "many" : null;
  for (const file of files.slice(0, room)) {
    const checked = await inspect(file);
    if (!checked.ok) {
      issue = checked.issue;
      continue;
    }
    const previewUrl = checked.mimeType.startsWith("image/") ? URL.createObjectURL(file) : null;
    accepted.push({
      clientAttachmentId: crypto.randomUUID(),
      file,
      filename: checked.filename,
      mimeType: checked.mimeType,
      byteSize: file.size,
      previewUrl,
    });
  }
  return { accepted, issue };
}

export function AttachmentPicker({
  disabled,
  count,
  onAdd,
  onReject,
}: {
  disabled: boolean;
  count: number;
  onAdd: (files: PickedAttachment[]) => void;
  onReject: (issue: ChatAttachmentIssue | "many") => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  async function take(list: File[]) {
    const result = await acceptChatFiles(list, count);
    if (result.issue) onReject(result.issue);
    if (result.accepted.length > 0) onAdd(result.accepted);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPT}
        multiple
        disabled={disabled}
        aria-label={t("chat.attach")}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length === 0) return;
          void take(files);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 text-muted-foreground"
        disabled={disabled}
        aria-label={t("chat.attach")}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-4 w-4" aria-hidden />
      </Button>
    </>
  );
}
