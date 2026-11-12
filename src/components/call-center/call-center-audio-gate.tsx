"use client";

import { useEffect, useRef } from "react";

import {
  unlockSoftphoneAudio,
} from "@/lib/call-center/softphone-audio";

/**
 * Primes Call Center AudioContext on first pointer/key gesture anywhere under /call-center.
 * Renders children unchanged.
 */
export function CallCenterAudioGate({ children }: { children: React.ReactNode }) {
  const primed = useRef(false);

  useEffect(() => {
    const unlock = () => {
      if (primed.current) return;
      primed.current = true;
      void unlockSoftphoneAudio().then((ok) => {
        if (!ok) primed.current = false;
      });
    };
    // Capture so status Select / Test ring / Answer all unlock before handlers run.
    window.addEventListener("pointerdown", unlock, { capture: true, once: false });
    window.addEventListener("keydown", unlock, { capture: true, once: false });
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  return <>{children}</>;
}
