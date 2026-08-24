"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type PwaInstallState = {
  isStandalone: boolean;
  isIos: boolean;
  canPrompt: boolean;
  showInstall: boolean;
  iosHelpOpen: boolean;
  setIosHelpOpen: (open: boolean) => void;
  promptInstall: () => Promise<void>;
};

const PwaInstallContext = createContext<PwaInstallState | null>(null);

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = "standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const classic = /iPhone|iPad|iPod/i.test(ua);
  const iPadOs = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return classic || iPadOs;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
    setIsIos(isIosDevice());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
      setIosHelpOpen(false);
    };
    const onDisplayMode = () => setIsStandalone(isStandaloneDisplay());

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", onDisplayMode);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  const value = useMemo<PwaInstallState>(
    () => ({
      isStandalone,
      isIos,
      canPrompt: Boolean(deferred),
      showInstall: !isStandalone && (Boolean(deferred) || isIos),
      iosHelpOpen,
      setIosHelpOpen,
      promptInstall,
    }),
    [deferred, iosHelpOpen, isIos, isStandalone, promptInstall],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall(): PwaInstallState {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }
  return ctx;
}
