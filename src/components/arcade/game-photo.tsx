"use client";

import { useQuery } from "@tanstack/react-query";
import { Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getArcadeFileUrls } from "@/lib/arcade.functions";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const SIGNED_URL_STALE_MS = 8 * 60 * 1000;
const SIGNED_URL_BATCH = 60;

export function useArcadePhotoUrls(paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))].sort().slice(0, SIGNED_URL_BATCH);
  return useQuery({
    queryKey: queryKeys.arcade.photos(unique),
    queryFn: () => getArcadeFileUrls({ paths: unique }),
    enabled: unique.length > 0,
    staleTime: SIGNED_URL_STALE_MS,
  });
}

export function GamePhoto({
  src,
  alt,
  missingLabel,
  className,
}: {
  src?: string | null;
  alt: string;
  missingLabel: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const show = Boolean(src) && !broken;
  if (!show) {
    return (
      <div
        className={cn("grid place-items-center overflow-hidden bg-muted text-muted-foreground", className)}
        role="img"
        aria-label={missingLabel}
      >
        <Gamepad2 className="h-8 w-8" strokeWidth={1.5} aria-hidden />
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <img src={src ?? ""} alt={alt} className="absolute inset-0 h-full w-full object-cover" onError={() => setBroken(true)} />
    </div>
  );
}
