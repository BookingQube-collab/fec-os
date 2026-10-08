"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { ChatSharedEntity } from "@/lib/chat.functions";

export function EntityCard({ entity }: { entity: ChatSharedEntity | null }) {
  const { t } = useTranslation();
  const typeLabel =
    entity && entity.access
      ? t(`chat.entityTypes.${entity.entityType}`, { defaultValue: t("chat.entityShared") })
      : t("chat.entityShared");

  if (!entity?.access) {
    return (
      <div className="mt-2 rounded-xl border border-current/20 px-3 py-2">
        <p className="text-xs font-medium">{t("chat.entityShared")}</p>
        <p>{t("chat.entityNoAccess")}</p>
      </div>
    );
  }

  const meta = [entity.status, entity.priority].filter((value): value is string => Boolean(value));

  return (
    <div className="mt-2 rounded-xl border border-current/20 px-3 py-2">
      <p className="text-xs font-medium">{typeLabel}</p>
      {entity.code ? <p className="text-xs opacity-80">{entity.code}</p> : null}
      <p className="font-medium">{entity.title}</p>
      {entity.jobTitle ? <p className="text-xs">{entity.jobTitle}</p> : null}
      {entity.locationName ? <p className="text-xs">{entity.locationName}</p> : null}
      {meta.length > 0 ? <p className="text-xs">{meta.join(" · ")}</p> : null}
      {entity.href ? (
        <Link href={entity.href} className="mt-1 inline-flex min-h-11 items-center underline underline-offset-2">
          {t("chat.entityOpen")}
        </Link>
      ) : null}
    </div>
  );
}
