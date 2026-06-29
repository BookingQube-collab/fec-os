"use client";



import { QueryClientProvider } from "@tanstack/react-query";

import { useEffect, useState, type ReactNode } from "react";

import { useTranslation } from "react-i18next";



import { Toaster } from "@/components/ui/sonner";

import { AuthProvider } from "@/hooks/use-auth";

import { applyLanguageToDocument } from "@/i18n";

import "@/i18n";

import { createQueryClient } from "@/lib/query-client";

import { useAppStore } from "@/stores/app-store";



export function Providers({ children }: { children: ReactNode }) {

  const [queryClient] = useState(() => createQueryClient());

  const language = useAppStore((s) => s.language);

  const { i18n } = useTranslation();



  useEffect(() => {

    if (i18n.language !== language) void i18n.changeLanguage(language);

    applyLanguageToDocument(language);

  }, [language, i18n]);



  return (

    <QueryClientProvider client={queryClient}>

      <AuthProvider>

        {children}

        <Toaster richColors position="top-right" />

      </AuthProvider>

    </QueryClientProvider>

  );

}

