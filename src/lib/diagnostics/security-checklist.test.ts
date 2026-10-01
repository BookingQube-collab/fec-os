import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectSecuritySnapshot } from "@/lib/diagnostics/security-checklist.server";
import {
  applyDefaultSecurityRemediation,
  blankSecuritySnapshot,
  resolveSecurityChecklist,
  type SecurityCheckResult,
  type SecuritySnapshot,
} from "@/lib/diagnostics/security-checklist";

function check(report: { checks: SecurityCheckResult[] }, id: string) {
  const row = report.checks.find((item) => item.id === id);
  if (!row) throw new Error(`missing check ${id}`);
  return row;
}

function snap(overrides: Partial<SecuritySnapshot> = {}) {
  return blankSecuritySnapshot(overrides);
}

describe("security checklist resolve contract", () => {
  it("does not mark a token-prefix session key as fixed", () => {
    const report = resolveSecurityChecklist(
      snap({
        sources: {
          auth: `function authTokenFingerprint(cookie) {\n  return cookie.value.slice(0, 48);\n}\nfunction getCachedSession() {}`,
        },
      }),
    );
    const row = check(report, "session_cache_key");
    expect(row.status).toBe("not_auto_fixable");
    expect(row.detailKey).toContain("prefix");
    expect(row.params.length).toBe("48");
    expect(row.status).not.toBe("fixed");
  });

  it("passes when the session key hashes the full cookie and is not a prefix", () => {
    const report = resolveSecurityChecklist(
      snap({
        sources: {
          auth: `function authTokenFingerprint(cookie) {\n  return createHash("sha256").update(cookie.value).digest("hex");\n}\nfunction getCachedSession() {}`,
        },
      }),
    );
    expect(check(report, "session_cache_key").status).toBe("pass");
  });

  it("passes when auth delegates to a full-token hash in the session cache module", () => {
    const report = resolveSecurityChecklist(
      snap({
        sources: {
          auth: `function authTokenFingerprint(store) {\n  return authCookiesCacheKey(store.getAll());\n}\nfunction createSupabaseClient() {}`,
          sessionCache: `export function authCookiesCacheKey(cookies) {\n  const material = cookies.map((cookie) => cookie.value).join("\\n");\n  return createHash("sha256").update(material).digest("hex");\n}`,
        },
      }),
    );
    expect(check(report, "session_cache_key").status).toBe("pass");
  });

  it("keeps a hashed key that still slices the token as not fixed", () => {
    const report = resolveSecurityChecklist(
      snap({
        sources: {
          auth: `function authTokenFingerprint(cookie) {\n  const hash = createHash("sha256").update(cookie.value.slice(0, 16)).digest("hex");\n  return hash;\n}\nfunction next() {}`,
        },
      }),
    );
    expect(check(report, "session_cache_key").status).toBe("not_auto_fixable");
  });

  it("marks a check fixed only after the re-check passes", () => {
    const report = resolveSecurityChecklist(
      snap({
        authPageReadable: true,
        uiPasswordMin: 6,
        staffPasswordMin: 12,
        identityProviderMin: 12,
        sources: { authPage: "signInWithPassword" },
      }),
      (id, current) => {
        if (id !== "password_policy") return { applied: false };
        return { applied: true, snapshot: { ...current, uiPasswordMin: 12 } };
      },
    );
    expect(check(report, "password_policy").status).toBe("fixed");
    expect(check(report, "password_policy").detailKey).toContain("pass");
  });

  it("stays failed when a remediation does not make the re-check pass", () => {
    const report = resolveSecurityChecklist(
      snap({
        authPageReadable: true,
        uiPasswordMin: 6,
        staffPasswordMin: 12,
        identityProviderMin: 12,
      }),
      (id, current) => (id === "password_policy" ? { applied: true, snapshot: current } : { applied: false }),
    );
    const row = check(report, "password_policy");
    expect(row.status).toBe("failed");
    expect(row.status).not.toBe("fixed");
  });

  it("does not rewrite the sign-in form from the default remediation", () => {
    const report = resolveSecurityChecklist(
      snap({
        authPageReadable: true,
        uiPasswordMin: 6,
        staffPasswordMin: 12,
        identityProviderMin: 12,
      }),
      applyDefaultSecurityRemediation,
    );
    const row = check(report, "password_policy");
    expect(row.status).toBe("not_auto_fixable");
    expect(row.detailKey).toContain("notWritten");
  });

  it("reports the identity-provider gap when the provider minimum is outside the repo", () => {
    const report = resolveSecurityChecklist(
      snap({
        authPageReadable: true,
        uiPasswordMin: 6,
        staffPasswordMin: 8,
        identityProviderMin: null,
      }),
    );
    const row = check(report, "password_policy");
    expect(row.status).toBe("not_auto_fixable");
    expect(row.detailKey).toContain("idpOutside");
    expect(row.params).toMatchObject({ uiMin: "6", staffMin: "8" });
  });

  it("does not treat a UI-only change as a fix when the provider still accepts 6", () => {
    let called = false;
    const report = resolveSecurityChecklist(
      snap({
        authPageReadable: true,
        uiPasswordMin: 6,
        staffPasswordMin: 8,
        identityProviderMin: 6,
      }),
      () => {
        called = true;
        return { applied: true, snapshot: snap({ authPageReadable: true, uiPasswordMin: 12, identityProviderMin: 6 }) };
      },
    );
    expect(called).toBe(false);
    expect(check(report, "password_policy").status).toBe("not_auto_fixable");
    expect(check(report, "password_policy").detailKey).toContain("serverBelow");
  });

  it("leaves process items not automatically fixable", () => {
    const report = resolveSecurityChecklist(snap(), () => ({ applied: true, snapshot: snap() }));
    for (const id of ["threat_model", "pentest", "compliance", "firewall", "intrusion_detection", "encrypted_backups", "tls_host", "rls"]) {
      expect(check(report, id).status).toBe("not_auto_fixable");
    }
  });

  it("does not copy a hardcoded service-role token into the result", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.payloadvalue.signaturevalue";
    const report = resolveSecurityChecklist(
      snap({
        env: { serviceRoleKey: "set", cronSecret: "missing", admsCommKey: "missing", fileEncryptionKey: "missing" },
        sources: { clientServer: `const KEY = "${token}";` },
      }),
    );
    expect(check(report, "service_role").status).toBe("not_auto_fixable");
    expect(check(report, "service_role").detailKey).toContain("hardcoded");
    expect(JSON.stringify(report)).not.toContain(token);
    expect(JSON.stringify(report)).not.toContain("eyJ");
  });

  it("reports missing secrets without a generated value", () => {
    const report = resolveSecurityChecklist(snap());
    expect(check(report, "cron_secret").detailKey).toContain("missing");
    expect(check(report, "adms_comm_key").detailKey).toContain("missing");
    expect(JSON.stringify(report)).not.toMatch(/generate|BEGIN |[A-Za-z0-9+/]{32,}/);
  });

  it("passes page headers only when the four declarations are present", () => {
    const present = resolveSecurityChecklist(
      snap({
        sources: {
          middleware: `matcher: ["/"]\nX-Content-Type-Options\nX-Frame-Options\nReferrer-Policy\nContent-Security-Policy\nframe-ancestors`,
        },
      }),
    );
    expect(check(present, "page_headers").status).toBe("pass");
    expect(check(present, "hsts").status).toBe("not_auto_fixable");

    const gap = resolveSecurityChecklist(snap({ sources: { middleware: "matcher: []", nextConfig: "headers() {}" } }));
    expect(check(gap, "page_headers").status).toBe("not_auto_fixable");
    expect(check(gap, "page_headers").detailKey).toContain("gap");
  });

  it("passes HSTS only when it was actually declared or seen", () => {
    const seen = resolveSecurityChecklist(snap({ hstsOnResponse: true, sources: { middleware: "matcher: []" } }));
    expect(check(seen, "hsts").status).toBe("pass");
  });

  it("flags eval in an allowlisted file without scanning a green default", () => {
    const found = resolveSecurityChecklist(
      snap({ sinkFiles: [{ name: "example.ts", text: "const x = eval('1')" }] }),
    );
    expect(check(found, "dangerous_sinks").status).toBe("not_auto_fixable");
    expect(check(found, "dangerous_sinks").params.files).toBe("example.ts");

    const clean = resolveSecurityChecklist(snap({ sinkFiles: [{ name: "example.ts", text: "const x = 1" }] }));
    expect(check(clean, "dangerous_sinks").status).toBe("pass");
  });
});

describe("security checklist against this workspace", () => {
  it("observes the repo without marking an unfixed item as fixed", async () => {
    const snapshot = await collectSecuritySnapshot();
    const report = resolveSecurityChecklist(snapshot, applyDefaultSecurityRemediation, "2026-10-01T00:00:00.000Z");
    const json = JSON.stringify(report);

    expect(check(report, "zod_actions").status).toBe("pass");
    expect(check(report, "action_auth").status).toBe("pass");
    expect(check(report, "page_headers").status).toBe("pass");
    expect(check(report, "api_headers").status).toBe("not_auto_fixable");
    expect(check(report, "hsts").status).toBe("not_auto_fixable");
    expect(check(report, "strict_csp").status).toBe("not_auto_fixable");
    expect(check(report, "dependency_audit").status).toBe("not_auto_fixable");
    expect(check(report, "threat_model").status).toBe("not_auto_fixable");
    expect(report.checks.some((row) => row.status === "fixed")).toBe(false);

    const auth = readFileSync("src/lib/server/auth.ts", "utf8");
    const sessionCache = readFileSync("src/lib/server/session-cache.ts", "utf8");
    const session = check(report, "session_cache_key");
    const prefix = /\.value\.slice\s*\(\s*0\s*,/.test(auth) || /\.value\.slice\s*\(\s*0\s*,/.test(sessionCache);
    if (prefix) expect(session.status).toBe("not_auto_fixable");
    else if (/createHash/.test(sessionCache) && /authCookiesCacheKey/.test(auth)) expect(session.status).toBe("pass");
    else expect(["pass", "not_auto_fixable"]).toContain(session.status);
    expect(session.status).not.toBe("fixed");

    for (const name of ["CRON_SECRET", "ADMS_COMM_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]) {
      const value = process.env[name];
      if (value && value.trim().length >= 8) expect(json).not.toContain(value.trim());
    }
  });
});
