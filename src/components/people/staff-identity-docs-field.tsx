"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractStaffIdentityDocument } from "@/lib/hr-documents.functions";
import {
  fileToBase64,
  IDENTITY_FILE_ACCEPT,
  IDENTITY_FILE_MAX_BYTES,
  identityFileContentType,
} from "@/lib/hr/identity-file";
import {
  applyIdentityExtraction,
  type IdentityDocType,
  type IdentityFieldKey,
  type IdentityFormFields,
  type IdentitySuggestions,
} from "@/lib/hr/identity-document-parse";

export type StaffIdentityDraft = {
  qidExpiry: string;
  passportNumber: string;
  passportExpiry: string;
  visaNumber: string;
  visaExpiry: string;
  contractNumber: string;
  contractExpiry: string;
  files: Partial<Record<IdentityDocType, File>>;
  suggestions: IdentitySuggestions;
  manual: Partial<Record<IdentityDocType, boolean>>;
};

function shown(value: string | null | undefined, date = false): string {
  if (!value || value.includes("•")) return "";
  return date ? value.slice(0, 10) : value;
}

export function emptyIdentityDraft(staff?: {
  qid_expiry?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  visa_number?: string | null;
  visa_expiry?: string | null;
  contract_end?: string | null;
} | null): StaffIdentityDraft {
  return {
    qidExpiry: shown(staff?.qid_expiry, true),
    passportNumber: shown(staff?.passport_number),
    passportExpiry: shown(staff?.passport_expiry, true),
    visaNumber: shown(staff?.visa_number),
    visaExpiry: shown(staff?.visa_expiry, true),
    contractNumber: "",
    contractExpiry: shown(staff?.contract_end, true),
    files: {},
    suggestions: {},
    manual: {},
  };
}

type DraftTextKey = Exclude<IdentityFieldKey, "fullName" | "qid">;

const BLOCKS: Array<{
  docType: IdentityDocType;
  fileKey: string;
  fields: Array<{ key: DraftTextKey; labelKey: string; date?: boolean }>;
}> = [
  {
    docType: "qid",
    fileKey: "people.staff.qidFile",
    fields: [{ key: "qidExpiry", labelKey: "people.staff.qidExpiry", date: true }],
  },
  {
    docType: "passport",
    fileKey: "people.staff.passportFile",
    fields: [
      { key: "passportNumber", labelKey: "people.staff.passportNumber" },
      { key: "passportExpiry", labelKey: "people.staff.passportExpiry", date: true },
    ],
  },
  {
    docType: "visa",
    fileKey: "people.staff.visaFile",
    fields: [
      { key: "visaNumber", labelKey: "people.staff.visaNumber" },
      { key: "visaExpiry", labelKey: "people.staff.visaExpiry", date: true },
    ],
  },
  {
    docType: "contract",
    fileKey: "people.staff.contractFile",
    fields: [
      { key: "contractNumber", labelKey: "people.staff.contractNumber" },
      { key: "contractExpiry", labelKey: "people.staff.contractExpiry", date: true },
    ],
  },
];

export function StaffIdentityDocsField({
  fullName,
  qid,
  draft,
  onDraft,
  onApplyFields,
  disabled,
}: {
  fullName: string;
  qid: string;
  draft: StaffIdentityDraft;
  onDraft: (next: StaffIdentityDraft) => void;
  onApplyFields: (patch: { fullName?: string; qid?: string }) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [reading, setReading] = useState<IdentityDocType | null>(null);
  const draftRef = useRef(draft);
  const nameRef = useRef(fullName);
  const qidRef = useRef(qid);
  draftRef.current = draft;
  nameRef.current = fullName;
  qidRef.current = qid;

  function fieldsFrom(current: StaffIdentityDraft, name: string, qidValue: string): IdentityFormFields {
    return {
      fullName: name,
      qid: qidValue,
      qidExpiry: current.qidExpiry,
      passportNumber: current.passportNumber,
      passportExpiry: current.passportExpiry,
      visaNumber: current.visaNumber,
      visaExpiry: current.visaExpiry,
      contractNumber: current.contractNumber,
      contractExpiry: current.contractExpiry,
    };
  }

  function draftFromFields(current: StaffIdentityDraft, fields: IdentityFormFields, suggestions: IdentitySuggestions): StaffIdentityDraft {
    return {
      ...current,
      qidExpiry: fields.qidExpiry,
      passportNumber: fields.passportNumber,
      passportExpiry: fields.passportExpiry,
      visaNumber: fields.visaNumber,
      visaExpiry: fields.visaExpiry,
      contractNumber: fields.contractNumber,
      contractExpiry: fields.contractExpiry,
      suggestions,
    };
  }

  function setText(key: DraftTextKey, value: string) {
    const suggestions = { ...draft.suggestions };
    delete suggestions[key];
    onDraft({ ...draft, [key]: value, suggestions });
  }

  function accept(field: IdentityFieldKey) {
    const value = draft.suggestions[field];
    if (!value) return;
    const suggestions = { ...draft.suggestions };
    delete suggestions[field];
    if (field === "fullName") {
      onApplyFields({ fullName: value });
      onDraft({ ...draft, suggestions });
      return;
    }
    if (field === "qid") {
      onApplyFields({ qid: value });
      onDraft({ ...draft, suggestions });
      return;
    }
    onDraft({ ...draft, [field]: value, suggestions });
  }

  async function onFile(docType: IdentityDocType, file: File | undefined) {
    if (!file || disabled) return;
    const contentType = identityFileContentType(file);
    if (!contentType) {
      toast.error(t("people.staff.fileType"));
      return;
    }
    if (file.size > IDENTITY_FILE_MAX_BYTES) {
      toast.error(t("people.staff.fileTooLarge"));
      return;
    }
    const current = draftRef.current;
    const withFile: StaffIdentityDraft = {
      ...current,
      files: { ...current.files, [docType]: file },
      manual: { ...current.manual, [docType]: false },
    };
    onDraft(withFile);
    setReading(docType);
    try {
      const data_base64 = await fileToBase64(file);
      const result = await extractStaffIdentityDocument({
        docType,
        filename: file.name,
        data_base64,
        content_type: contentType,
      });
      const latest = draftRef.current;
      const applied = applyIdentityExtraction(
        fieldsFrom(latest, nameRef.current, qidRef.current),
        docType,
        result.parsed,
        latest.suggestions,
      );
      onApplyFields({ fullName: applied.fields.fullName, qid: applied.fields.qid });
      onDraft({
        ...draftFromFields(latest, applied.fields, applied.suggestions),
        files: { ...latest.files, [docType]: file },
        manual: { ...latest.manual, [docType]: result.manual },
      });
    } catch (error) {
      const latest = draftRef.current;
      onDraft({
        ...latest,
        files: { ...latest.files, [docType]: file },
        manual: { ...latest.manual, [docType]: true },
      });
      toast.message((error as Error).message || t("people.staff.extractManual"));
    } finally {
      setReading(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">{t("people.staff.identityTitle")}</p>
        <p className="text-[11px] text-muted-foreground">{t("people.staff.identityHint")}</p>
      </div>
      {BLOCKS.map((block) => {
        const file = draft.files[block.docType];
        const suggestionFields: IdentityFieldKey[] =
          block.docType === "qid" ? ["fullName", "qid", "qidExpiry"] : block.fields.map((field) => field.key);
        return (
          <div key={block.docType} className="space-y-2 border-t border-border pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {block.fields.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`identity-${field.key}`}>{t(field.labelKey)}</Label>
                  <Input
                    id={`identity-${field.key}`}
                    type={field.date ? "date" : "text"}
                    value={draft[field.key]}
                    className={field.date ? undefined : "font-mono"}
                    disabled={disabled || reading === block.docType}
                    onChange={(event) => setText(field.key, event.target.value)}
                  />
                </div>
              ))}
            </div>
            <div>
              <Label htmlFor={`identity-file-${block.docType}`}>{t(block.fileKey)}</Label>
              <Input
                id={`identity-file-${block.docType}`}
                type="file"
                accept={IDENTITY_FILE_ACCEPT}
                disabled={disabled || reading != null}
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  void onFile(block.docType, picked);
                }}
              />
              {reading === block.docType ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{t("people.staff.readingDocument")}</p>
              ) : null}
              {file ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] text-muted-foreground">{file.name}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={disabled}
                    onClick={() =>
                      onDraft({
                        ...draft,
                        files: { ...draft.files, [block.docType]: undefined },
                        manual: { ...draft.manual, [block.docType]: false },
                      })
                    }
                  >
                    {t("people.staff.photoRemove")}
                  </Button>
                </div>
              ) : null}
              {draft.manual[block.docType] ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{t("people.staff.extractManual")}</p>
              ) : null}
              {suggestionFields.map((field) =>
                draft.suggestions[field] ? (
                  <button
                    key={field}
                    type="button"
                    className="mt-1 block text-left text-xs text-primary underline"
                    onClick={() => accept(field)}
                  >
                    {t("people.staff.useExtracted", { value: draft.suggestions[field] })}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
