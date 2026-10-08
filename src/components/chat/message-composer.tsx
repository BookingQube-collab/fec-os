"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BarChart3, Mic, MoreHorizontal, Pause, Play, Send, Share2, Square, X } from "lucide-react";

import { AttachmentPicker, acceptChatFiles, type PickedAttachment } from "@/components/chat/attachment-picker";
import { PollDialog, type PollDraft } from "@/components/chat/poll-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ShareRecordDialog } from "@/components/chat/share-record-dialog";
import { AttachmentPreview } from "@/components/chat/attachment-preview";
import { formatChatVoiceClock, useVoiceRecorder, type VoiceRecorderIssue } from "@/components/chat/use-voice-recorder";
import { VoiceMessage } from "@/components/chat/voice-message";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { chatAttachmentCaptionIssue, type ChatAttachmentIssue } from "@/lib/chat/attachment-rules";
import {
  activeMentionQuery,
  applyMentionChoice,
  composerMentionsFromUnknown,
  filterMentionCandidates,
  mentionIdsForSend,
  pruneComposerMentions,
  type ChatMentionCandidate,
  type ComposerMention,
} from "@/lib/chat/mention-rules";
import { chatTextBodyIssue } from "@/lib/chat/message-rules";

const DRAFT_PREFIX = "fec-chat-draft:";
const MENTION_DRAFT_PREFIX = "fec-chat-mention-draft:";

export type ComposerReply = {
  id: string;
  senderName: string;
  body: string | null;
};

export type ComposerSend = {
  body: string;
  clientMessageId: string;
  replyToMessageId?: string;
  attachments: PickedAttachment[];
  voiceNote?: boolean;
  requireAcknowledgement?: boolean;
  mentionUserIds: string[];
};

function readMentionDraft(conversationId: string): ComposerMention[] {
  if (typeof window === "undefined") return [];
  const raw = sessionStorage.getItem(MENTION_DRAFT_PREFIX + conversationId);
  if (!raw) return [];
  try {
    return composerMentionsFromUnknown(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function revokePreviews(items: PickedAttachment[]) {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
}

function mergeAttachments(current: PickedAttachment[], accepted: PickedAttachment[]): PickedAttachment[] {
  const ids = new Set(current.map((item) => item.clientAttachmentId));
  const next = [...current];
  for (const item of accepted) {
    if (ids.has(item.clientAttachmentId) || next.length >= 5) continue;
    ids.add(item.clientAttachmentId);
    next.push(item);
  }
  return next;
}

export function MessageComposer({
  conversationId,
  canPost,
  canAttach,
  announcement = false,
  reply,
  mentionMembers = [],
  mentionsReady,
  onCancelReply,
  onActivity,
  onSend,
  onShare,
  onCreatePoll,
}: {
  conversationId: string;
  canPost: boolean;
  canAttach: boolean;
  announcement?: boolean;
  reply: ComposerReply | null;
  mentionMembers?: readonly ChatMentionCandidate[];
  mentionsReady: boolean;
  onCancelReply: () => void;
  onActivity: (active: boolean) => void;
  onSend: (input: ComposerSend) => void;
  onShare: (input: { entityType: string; entityId: string; note?: string; clientMessageId: string }) => Promise<void>;
  onCreatePoll?: (input: PollDraft) => Promise<void>;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const fieldId = useId();
  const listId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const highlightedRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState("");
  const [mentions, setMentions] = useState<ComposerMention[]>([]);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [requireAck, setRequireAck] = useState(true);
  const [dragging, setDragging] = useState(false);
  const voice = useVoiceRecorder(conversationId);
  const onActivityRef = useRef(onActivity);
  const filesRef = useRef(files);
  onActivityRef.current = onActivity;
  filesRef.current = files;

  useEffect(() => {
    const stored = typeof window === "undefined" ? "" : (sessionStorage.getItem(DRAFT_PREFIX + conversationId) ?? "");
    setValue(stored);
    setMentions(pruneComposerMentions(stored, readMentionDraft(conversationId)));
    setCaret(stored.length);
    setActiveIndex(0);
    setDismissedKey(null);
    setReadyId(conversationId);
    setRequireAck(true);
    setPollOpen(false);
    setNotice(null);
    setFiles((current) => {
      revokePreviews(current);
      return [];
    });
  }, [conversationId]);

  useEffect(() => {
    return () => {
      revokePreviews(filesRef.current);
    };
  }, []);

  useEffect(() => {
    if (readyId !== conversationId || typeof window === "undefined") return;
    if (value) sessionStorage.setItem(DRAFT_PREFIX + conversationId, value);
    else sessionStorage.removeItem(DRAFT_PREFIX + conversationId);
    const live = pruneComposerMentions(value, mentions);
    if (live.length > 0) sessionStorage.setItem(MENTION_DRAFT_PREFIX + conversationId, JSON.stringify(live));
    else sessionStorage.removeItem(MENTION_DRAFT_PREFIX + conversationId);
    onActivityRef.current(value.trim().length > 0);
  }, [conversationId, mentions, readyId, value]);

  useEffect(() => {
    if (!mentionsReady || readyId !== conversationId) return;
    const allowed = new Set(mentionMembers.map((member) => member.userId.toLowerCase()));
    setMentions((current) => {
      const next = current.filter((mention) => allowed.has(mention.userId.toLowerCase()));
      return next.length === current.length ? current : next;
    });
  }, [conversationId, mentionMembers, mentionsReady, readyId]);

  const activeMention = voice.phase === "idle" && canPost ? activeMentionQuery(value, caret) : null;
  const mentionKey = activeMention ? `${activeMention.start}:${activeMention.query}` : null;
  const mentionCandidates = activeMention ? filterMentionCandidates(mentionMembers, activeMention.query) : [];
  const pickerOpen = activeMention != null && dismissedKey !== mentionKey;
  const highlighted = mentionCandidates.length === 0 ? 0 : Math.min(activeIndex, mentionCandidates.length - 1);
  const highlightedId = pickerOpen && mentionCandidates[highlighted] ? `${listId}-${mentionCandidates[highlighted].userId}` : undefined;

  useEffect(() => {
    setActiveIndex(0);
  }, [mentionKey]);

  useEffect(() => {
    if (!pickerOpen) return;
    highlightedRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted, pickerOpen]);

  const captionIssue = chatAttachmentCaptionIssue(value);
  const textIssue = files.length === 0 ? chatTextBodyIssue(value) : captionIssue;
  const canSubmit = canPost && readyId === conversationId && textIssue == null && (value.trim().length > 0 || files.length > 0);

  function reject(issue: ChatAttachmentIssue | "many") {
    const key =
      issue === "many"
        ? "chat.attachmentTooMany"
        : issue === "large"
          ? "chat.attachmentTooLarge"
          : issue === "magic"
            ? "chat.attachmentMismatch"
            : issue === "empty"
              ? "chat.attachmentEmpty"
              : "chat.attachmentType";
    setNotice(t(key));
  }

  function removeFile(clientAttachmentId: string) {
    setFiles((current) => {
      const target = current.find((item) => item.clientAttachmentId === clientAttachmentId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.clientAttachmentId !== clientAttachmentId);
    });
  }

  async function addFiles(list: File[]) {
    if (!canAttach || voice.phase !== "idle") return;
    const result = await acceptChatFiles(list, filesRef.current.length);
    if (result.issue) reject(result.issue);
    if (result.accepted.length > 0) {
      setNotice(null);
      setFiles((current) => mergeAttachments(current, result.accepted));
    }
  }

  function voiceIssueMessage(issue: VoiceRecorderIssue): string {
    if (issue === "large") return t("chat.voiceTooLarge");
    if (issue === "unsupported") return t("chat.voiceUnsupported");
    if (issue === "permission") return t("chat.voicePermission");
    if (issue === "empty") return t("chat.attachmentEmpty");
    if (issue === "magic") return t("chat.attachmentMismatch");
    return t("chat.voiceFailed");
  }

  function mentionIdsForBody(body: string): string[] | null {
    const selected = mentionsReady
      ? mentions.filter((mention) =>
          mentionMembers.some((member) => member.userId.toLowerCase() === mention.userId.toLowerCase()),
        )
      : mentions;
    const decision = mentionIdsForSend({
      text: body,
      mentions: selected,
      requested: selected.map((mention) => mention.userId),
    });
    if (!decision.ok) {
      setNotice(t("chat.mentionLimit"));
      return null;
    }
    return decision.ids;
  }

  function chooseMention(member: ChatMentionCandidate) {
    const result = applyMentionChoice({
      text: value,
      caret,
      label: member.label,
      userId: member.userId,
      mentions,
    });
    if (!result.ok) {
      if (result.reason === "limit") setNotice(t("chat.mentionLimit"));
      return;
    }
    setNotice(null);
    setValue(result.text);
    setMentions(result.mentions);
    setCaret(result.caret);
    setDismissedKey(null);
    requestAnimationFrame(() => {
      const field = fieldRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(result.caret, result.caret);
    });
  }

  function sendVoice() {
    if (!canPost || voice.phase !== "preview") return;
    const ready = voice.consumePreview();
    if (!ready) return;
    const mentionUserIds = mentionIdsForBody("");
    if (!mentionUserIds) return;
    const replyToMessageId = reply?.id;
    onSend({
      body: "",
      clientMessageId: ready.clientMessageId,
      voiceNote: true,
      mentionUserIds,
      attachments: [
        {
          clientAttachmentId: ready.clientAttachmentId,
          file: ready.file,
          filename: ready.filename,
          mimeType: ready.mimeType,
          byteSize: ready.byteSize,
          previewUrl: null,
        },
      ],
      ...(replyToMessageId ? { replyToMessageId } : {}),
    });
    URL.revokeObjectURL(ready.objectUrl);
  }

  function send() {
    if (voice.phase !== "idle" || !canSubmit) return;
    const body = value.trim();
    const mentionUserIds = mentionIdsForBody(body);
    if (!mentionUserIds) return;
    const clientMessageId = crypto.randomUUID();
    const replyToMessageId = reply?.id;
    const attachments = files;
    setValue("");
    setMentions([]);
    setCaret(0);
    setFiles([]);
    setNotice(null);
    sessionStorage.removeItem(DRAFT_PREFIX + conversationId);
    sessionStorage.removeItem(MENTION_DRAFT_PREFIX + conversationId);
    onActivityRef.current(false);
    onSend({
      body,
      clientMessageId,
      attachments,
      mentionUserIds,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(announcement ? { requireAcknowledgement: requireAck } : {}),
    });
    revokePreviews(attachments);
  }

  return (
    <form
      className={`relative z-30 flex max-h-[50%] shrink-0 flex-col overflow-hidden border-t border-border bg-card p-3 ${dragging ? "ring-2 ring-inset ring-primary" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      onDragOver={(event) => {
        if (!canAttach || voice.phase !== "idle") return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!canAttach || voice.phase !== "idle") return;
        event.preventDefault();
        setDragging(false);
        void addFiles([...(event.dataTransfer.files ?? [])]);
      }}
    >
      {canPost ? null : (
        <p className="mb-2 text-xs text-muted-foreground">
          {announcement ? t("chat.announcementReadOnly") : t("chat.cannotPost")}
        </p>
      )}
      {announcement && canPost ? (
        <label className="mb-2 flex items-center gap-2 text-xs">
          <Checkbox checked={requireAck} onCheckedChange={(value) => setRequireAck(value === true)} />
          {t("chat.requireAcknowledgement")}
        </label>
      ) : null}
      {dragging ? <p className="mb-2 text-xs text-muted-foreground">{t("chat.dropFiles")}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
      {reply ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <p className="min-w-0 flex-1">
            <span className="block font-medium">{t("chat.replyingTo", { name: reply.senderName })}</span>
            <span className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground">
              {reply.body ?? t("chat.deleted")}
            </span>
          </p>
          <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-3" aria-label={t("chat.cancelReply")} onClick={onCancelReply}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}
      {voice.phase === "idle" ? <AttachmentPreview items={files} onRemove={removeFile} /> : null}
      {voice.issue || notice ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {voice.issue ? voiceIssueMessage(voice.issue) : notice}
        </p>
      ) : null}
      </div>
      {pickerOpen ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t("chat.mentionList")}
          className="mb-2 max-h-48 shrink-0 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-md"
        >
          {mentionCandidates.length === 0 ? (
            <p role="status" className="min-h-11 px-3 py-3 text-sm text-muted-foreground">
              {t("chat.mentionEmpty")}
            </p>
          ) : (
            mentionCandidates.map((member, index) => (
              <button
                key={member.userId}
                id={`${listId}-${member.userId}`}
                ref={index === highlighted ? highlightedRef : undefined}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm ${index === highlighted ? "bg-accent text-accent-foreground" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseMention(member)}
              >
                <span className="truncate font-medium">{member.label}</span>
                {member.employeeCode && member.employeeCode !== member.label ? (
                  <span className="truncate text-xs text-muted-foreground">{member.employeeCode}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
      <div className="flex shrink-0 items-end gap-2">
        {canAttach && voice.phase === "idle" ? (
          <AttachmentPicker
            disabled={!canPost}
            count={files.length}
            onAdd={(accepted) => {
              setNotice(null);
              setFiles((current) => mergeAttachments(current, accepted));
            }}
            onReject={reject}
          />
        ) : null}
        {canPost && voice.phase === "idle" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={t("chat.composerMore")}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canAttach && files.length === 0 ? (
                <DropdownMenuItem
                  onSelect={() => {
                    void voice.start();
                  }}
                >
                  <Mic aria-hidden />
                  {t("chat.recordVoice")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                <Share2 aria-hidden />
                {t("chat.shareRecord")}
              </DropdownMenuItem>
              {onCreatePoll ? (
                <DropdownMenuItem onSelect={() => setPollOpen(true)}>
                  <BarChart3 aria-hidden />
                  {t("chat.poll")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {voice.phase === "recording" || voice.phase === "paused" ? (
          <div role="group" aria-label={t("chat.recordingVoice")} className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="min-w-[3.25rem] tabular-nums text-sm font-medium">{formatChatVoiceClock(voice.elapsedMs)}</span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={voice.phase === "paused" ? t("chat.resumeRecording") : t("chat.pauseRecording")}
              aria-pressed={voice.phase === "paused"}
              onClick={() => (voice.phase === "paused" ? voice.resume() : voice.pause())}
            >
              {voice.phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            </Button>
            <Button type="button" size="icon" variant="outline" aria-label={t("chat.previewVoice")} onClick={() => voice.stopForPreview()}>
              <Square aria-hidden />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label={t("chat.cancelRecording")} onClick={() => voice.cancel()}>
              <X aria-hidden />
            </Button>
          </div>
        ) : null}
        {voice.phase === "preview" && voice.preview ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <VoiceMessage attachmentId={null} src={voice.preview.objectUrl} refreshable={false} mine={false} />
            </div>
            <Button type="button" variant="ghost" className="min-h-11 px-3" aria-label={t("chat.cancelRecording")} onClick={() => voice.cancel()}>
              {t("common.cancel")}
            </Button>
            <Button type="button" className="min-h-11" aria-label={t("chat.sendVoice")} onClick={sendVoice}>
              {t("chat.send")}
            </Button>
          </div>
        ) : null}
        {voice.phase === "idle" ? (
          <>
            <label id={labelId} htmlFor={fieldId} className="sr-only">
              {t("chat.composerLabel")}
            </label>
            <Textarea
              ref={fieldRef}
              id={fieldId}
              aria-labelledby={labelId}
              aria-describedby={`${fieldId}-hint`}
              aria-expanded={pickerOpen}
              aria-controls={pickerOpen ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={highlightedId}
              rows={1}
              value={value}
              disabled={!canPost}
              placeholder={announcement ? t("chat.announcementPlaceholder") : t("chat.composerPlaceholder")}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-full px-4 py-2.5"
              onChange={(event) => {
                const next = event.target.value;
                setValue(next);
                setMentions((current) => pruneComposerMentions(next, current));
                setCaret(event.target.selectionStart ?? next.length);
              }}
              onClick={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
              onPaste={(event) => {
                if (!canAttach) return;
                const images = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
                if (images.length === 0) return;
                event.preventDefault();
                void addFiles(images);
              }}
              onKeyDown={(event) => {
                if (pickerOpen && event.key === "Escape") {
                  event.preventDefault();
                  setDismissedKey(mentionKey);
                  return;
                }
                if (pickerOpen && mentionCandidates.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();
                  const last = mentionCandidates.length - 1;
                  setActiveIndex((current) => {
                    const index = Math.min(current, last);
                    return event.key === "ArrowDown" ? Math.min(index + 1, last) : Math.max(index - 1, 0);
                  });
                  return;
                }
                if (
                  pickerOpen &&
                  mentionCandidates.length > 0 &&
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  const member = mentionCandidates[highlighted];
                  if (member) chooseMention(member);
                  return;
                }
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                send();
              }}
            />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-full" disabled={!canSubmit} aria-label={t("chat.send")}>
              <Send aria-hidden />
            </Button>
          </>
        ) : null}
      </div>
      {voice.phase === "idle" ? (
        <p id={`${fieldId}-hint`} className="px-1 pt-1.5 text-[11px] text-muted-foreground">
          {t("chat.composerHint")}
        </p>
      ) : null}
      <ShareRecordDialog open={shareOpen} onOpenChange={setShareOpen} onShare={onShare} />
      {onCreatePoll ? <PollDialog open={pollOpen} onOpenChange={setPollOpen} onCreate={onCreatePoll} /> : null}
    </form>
  );
}
