"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">{t("errors.notFound")}</h2>
      <p className="text-sm text-muted-foreground">{t("errors.notFoundBody")}</p>
      <Button asChild>
        <Link href="/">{t("errors.returnHome")}</Link>
      </Button>
    </div>
  );
}
