"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import i18n from "@/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] global error", error);
  }, [error]);

  return (
    <html lang={i18n.language?.startsWith("ar") ? "ar-QA" : "en"} dir={i18n.language?.startsWith("ar") ? "rtl" : "ltr"}>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold">{i18n.t("errors.somethingWrong")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {error.message || i18n.t("errors.unexpected")}
          </p>
          <Button onClick={reset}>{i18n.t("common.tryAgain")}</Button>
        </div>
      </body>
    </html>
  );
}
