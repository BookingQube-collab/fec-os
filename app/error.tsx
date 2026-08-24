"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">{t("errors.somethingWrong")}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{error.message || t("errors.unexpected")}</p>
      <Button onClick={reset}>{t("common.tryAgain")}</Button>
    </div>
  );
}
