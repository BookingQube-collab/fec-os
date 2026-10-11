import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/locales/en.json";
import shell from "@/i18n/locales/en-shell.json";
import { ENGLISH_SHELL_NAMESPACES, ENGLISH_SHELL_SLICES } from "@/i18n/shell-namespaces";
import i18n, { isEnglishCatalogLoaded, loadEnglishCatalog } from "@/i18n";

describe("english catalog split", () => {
  it("keeps the shared shell aligned with en.json", () => {
    const expectedKeys = [...ENGLISH_SHELL_NAMESPACES, ...Object.keys(ENGLISH_SHELL_SLICES)].sort();
    expect(Object.keys(shell).sort()).toEqual(expectedKeys);

    for (const ns of ENGLISH_SHELL_NAMESPACES) {
      expect(shell[ns]).toEqual(en[ns]);
    }

    for (const [ns, keys] of Object.entries(ENGLISH_SHELL_SLICES)) {
      const shellNs = shell[ns as keyof typeof shell] as Record<string, unknown>;
      const enNs = en[ns as keyof typeof en] as Record<string, unknown>;
      expect(Object.keys(shellNs).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(shellNs[key]).toEqual(enNs[key]);
      }
    }
  });

  it("does not statically import the full English dictionary from the i18n entry", () => {
    const source = readFileSync(path.join(process.cwd(), "src/i18n/index.ts"), "utf8");
    expect(source).not.toMatch(/import\s+\w+\s+from\s+["']\.\/locales\/en\.json["']/);
    expect(source).toMatch(/import\(\s*\/\*[^*]*\*\/\s*["']\.\/locales\/en\.json["']\s*\)/);
    expect(source).toMatch(/locales\/en-shell\.json/);
  });

  it("paints shell copy immediately and fills the rest from the catalog chunk", async () => {
    expect(i18n.t("auth.signIn")).toBe("Sign in");
    expect(i18n.t("trainingVerify.title")).toBe("Certificate verification");
    expect(isEnglishCatalogLoaded()).toBe(false);
    expect(i18n.t("people.title")).toBe("people.title");

    vi.stubGlobal("window", globalThis);
    try {
      await loadEnglishCatalog();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(isEnglishCatalogLoaded()).toBe(true);
    expect(i18n.t("auth.signIn")).toBe("Sign in");
    expect(i18n.t("people.title")).toBe("People");
    expect(i18n.t("trainingCertificates.title")).toBe("Certificates");
    expect(i18n.t("trainingCertificates.statuses.VALID")).toBe("Valid");
  });
});
