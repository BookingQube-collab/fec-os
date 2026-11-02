import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMAIL_FROM,
  applySmtpPreset,
  formatFromHeader,
  isSmtpAuthFailure,
  keepSecret,
  mailgunAlternateSmtpHost,
  mailgunPresetForHost,
  mailgunRegionHint,
  mailgunSmtpPasswordHint,
  mailgunUsernameHint,
  nodemailerSecureOptions,
  resolveOutboundEmailConfig,
  resolveSmtpConfig,
  secretLast4,
  smtpAuthDiagnostics,
  smtpMissingReason,
  toPublicEmailSettings,
  webhookHostHint,
  type EmailEnv,
  type EmailSettingsRow,
} from "./outbound-config";

const env: EmailEnv = {
  resendApiKey: "env_resend_key_xxxx",
  webhookUrl: "https://hooks.env.example/email",
  fromAddress: "env@fec.qa",
  fromName: "Env Sender",
  smtpHost: "",
  smtpPort: 587,
  smtpEncryption: "tls",
  smtpUsername: "",
  smtpPassword: "",
};

function row(partial: Partial<EmailSettingsRow>): EmailSettingsRow {
  return {
    managed: false,
    enabled: false,
    provider: "resend",
    from_address: "",
    from_name: "",
    resend_api_key: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_encryption: "tls",
    smtp_username: "",
    smtp_password: "",
    smtp_preset: "custom",
    webhook_url: "",
    ...partial,
  };
}

describe("resolveOutboundEmailConfig", () => {
  it("uses env when row is missing", () => {
    expect(resolveOutboundEmailConfig(null, env)).toEqual({
      provider: "resend",
      resendApiKey: "env_resend_key_xxxx",
      smtp: null,
      webhookUrl: "https://hooks.env.example/email",
      fromAddress: "env@fec.qa",
      fromName: "Env Sender",
      source: "env",
    });
  });

  it("uses env when seed row is unmanaged", () => {
    expect(resolveOutboundEmailConfig(row({ managed: false, enabled: false }), env)?.source).toBe("env");
  });

  it("turns email off when managed and disabled", () => {
    expect(
      resolveOutboundEmailConfig(
        row({
          managed: true,
          enabled: false,
          resend_api_key: "ui_key",
          webhook_url: "https://hooks.ui.example/email",
        }),
        env,
      ),
    ).toBeNull();
  });

  it("prefers UI secrets when managed and enabled", () => {
    expect(
      resolveOutboundEmailConfig(
        row({
          managed: true,
          enabled: true,
          from_address: "ui@fec.qa",
          from_name: "UI",
          resend_api_key: "ui_resend",
          webhook_url: "https://hooks.ui.example/email",
        }),
        env,
      ),
    ).toEqual({
      provider: "resend",
      resendApiKey: "ui_resend",
      smtp: null,
      webhookUrl: "https://hooks.ui.example/email",
      fromAddress: "ui@fec.qa",
      fromName: "UI",
      source: "ui",
    });
  });

  it("fills empty UI fields from env when managed and enabled", () => {
    expect(
      resolveOutboundEmailConfig(
        row({
          managed: true,
          enabled: true,
          from_address: "",
          resend_api_key: "",
          webhook_url: "",
        }),
        env,
      ),
    ).toEqual({
      provider: "resend",
      resendApiKey: "env_resend_key_xxxx",
      smtp: null,
      webhookUrl: "https://hooks.env.example/email",
      fromAddress: "env@fec.qa",
      fromName: "Env Sender",
      source: "ui",
    });
  });

  it("resolves SMTP provider with Mailgun-style credentials", () => {
    const resolved = resolveOutboundEmailConfig(
      row({
        managed: true,
        enabled: true,
        provider: "smtp",
        from_address: "no-reply@bookingqube.com",
        from_name: "BookingQube",
        smtp_host: "smtp.eu.mailgun.org",
        smtp_port: 587,
        smtp_encryption: "tls",
        smtp_username: "admin@noreply.bookingqube.com",
        smtp_password: "secret",
        smtp_preset: "mailgun_eu",
        resend_api_key: "",
        webhook_url: "",
      }),
      { ...env, resendApiKey: "", webhookUrl: "" },
    );
    expect(resolved).toMatchObject({
      provider: "smtp",
      fromAddress: "no-reply@bookingqube.com",
      fromName: "BookingQube",
      source: "ui",
      smtp: {
        host: "smtp.eu.mailgun.org",
        port: 587,
        encryption: "tls",
        username: "admin@noreply.bookingqube.com",
        password: "secret",
      },
    });
  });

  it("returns null when nothing is configured", () => {
    expect(
      resolveOutboundEmailConfig(null, {
        resendApiKey: "",
        webhookUrl: "",
        fromAddress: "",
        fromName: "",
        smtpHost: "",
        smtpPort: 587,
        smtpEncryption: "tls",
        smtpUsername: "",
        smtpPassword: "",
      }),
    ).toBeNull();
  });

  it("defaults from address", () => {
    expect(
      resolveOutboundEmailConfig(null, {
        resendApiKey: "k",
        webhookUrl: "",
        fromAddress: "",
        fromName: "",
        smtpHost: "",
        smtpPort: 587,
        smtpEncryption: "tls",
        smtpUsername: "",
        smtpPassword: "",
      })?.fromAddress,
    ).toBe(DEFAULT_EMAIL_FROM);
  });
});

describe("SMTP presets and helpers", () => {
  it("fills Mailgun EU / Gmail hosts", () => {
    expect(applySmtpPreset("mailgun_eu")).toEqual({
      host: "smtp.eu.mailgun.org",
      port: 587,
      encryption: "tls",
    });
    expect(applySmtpPreset("gmail")).toEqual({
      host: "smtp.gmail.com",
      port: 587,
      encryption: "tls",
    });
    expect(applySmtpPreset("custom")).toBeNull();
  });

  it("formats From header with sender name", () => {
    expect(formatFromHeader("no-reply@fec.qa", "FEC")).toBe("FEC <no-reply@fec.qa>");
    expect(formatFromHeader("no-reply@fec.qa", "")).toBe("no-reply@fec.qa");
  });
});

describe("resolveSmtpConfig (Test SMTP draft)", () => {
  const emptyEnv: EmailEnv = {
    resendApiKey: "",
    webhookUrl: "",
    fromAddress: "",
    fromName: "",
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "tls",
    smtpUsername: "",
    smtpPassword: "",
  };

  it("reports which field is missing", () => {
    expect(smtpMissingReason("h", "u", "")).toBe("smtp_password_missing");
    expect(smtpMissingReason("h", "", "p")).toBe("smtp_username_missing");
    expect(smtpMissingReason("", "u", "p")).toBe("smtp_host_missing");
    expect(smtpMissingReason("h", "u", "p")).toBeNull();
  });

  it("uses form draft password even when DB/env have none", () => {
    const result = resolveSmtpConfig(
      {
        host: "smtp.mailgun.org",
        port: 587,
        encryption: "tls",
        username: "admin@noreply.bookingqube.com",
        password: "mg-secret",
      },
      null,
      emptyEnv,
    );
    expect(result.reason).toBeNull();
    expect(result.smtp).toEqual({
      host: "smtp.mailgun.org",
      port: 587,
      encryption: "tls",
      username: "admin@noreply.bookingqube.com",
      password: "mg-secret",
    });
  });

  it("falls back to saved password when draft password is blank", () => {
    const result = resolveSmtpConfig(
      {
        host: "smtp.mailgun.org",
        username: "admin@noreply.bookingqube.com",
        password: "",
      },
      row({
        managed: true,
        enabled: true,
        provider: "smtp",
        smtp_host: "smtp.mailgun.org",
        smtp_username: "admin@noreply.bookingqube.com",
        smtp_password: "saved-secret",
      }),
      emptyEnv,
    );
    expect(result.smtp?.password).toBe("saved-secret");
  });

  it("returns smtp_password_missing when host/user set but no password anywhere", () => {
    const result = resolveSmtpConfig(
      {
        host: "smtp.mailgun.org",
        username: "admin@noreply.bookingqube.com",
        password: "",
      },
      row({
        managed: true,
        enabled: true,
        provider: "smtp",
        smtp_host: "smtp.mailgun.org",
        smtp_username: "admin@noreply.bookingqube.com",
        smtp_password: "",
      }),
      emptyEnv,
    );
    expect(result.smtp).toBeNull();
    expect(result.reason).toBe("smtp_password_missing");
  });
});

describe("secret helpers", () => {
  it("keeps blank submissions", () => {
    expect(keepSecret("stored", "")).toBe("stored");
    expect(keepSecret("stored", "  new  ")).toBe("new");
  });

  it("masks last4 and webhook host", () => {
    expect(secretLast4("re_abcd1234")).toBe("1234");
    expect(secretLast4("ab")).toBe("");
    expect(webhookHostHint("https://hooks.example.com/path?token=x")).toBe("hooks.example.com");
  });

  it("never exposes full secrets in public shape", () => {
    const pub = toPublicEmailSettings(
      row({
        managed: true,
        enabled: true,
        provider: "smtp",
        from_address: "ops@fec.qa",
        from_name: "Ops",
        resend_api_key: "re_secret_9999",
        smtp_password: "app_password_8888",
        webhook_url: "https://hooks.example.com/hook",
      }),
      env,
    );
    expect(pub.resendKeyLast4).toBe("9999");
    expect(pub.resendKeySet).toBe(true);
    expect(pub.smtpPasswordSet).toBe(true);
    expect(pub.smtpPasswordLast4).toBe("8888");
    expect(pub.smtpPasswordLength).toBe("app_password_8888".length);
    expect(pub.webhookSet).toBe(true);
    expect(pub.webhookHint).toBe("hooks.example.com");
    expect(JSON.stringify(pub)).not.toContain("re_secret_9999");
    expect(JSON.stringify(pub)).not.toContain("app_password_8888");
    expect(JSON.stringify(pub)).not.toContain("/hook");
  });
});

describe("SMTP auth diagnostics helpers", () => {
  it("exposes length and last4 only", () => {
    expect(
      smtpAuthDiagnostics({
        host: "smtp.eu.mailgun.org",
        port: 587,
        encryption: "tls",
        username: "postmaster@noreply.example.com",
        password: "abc774a",
      }),
    ).toEqual({
      host: "smtp.eu.mailgun.org",
      port: 587,
      encryption: "tls",
      username: "postmaster@noreply.example.com",
      passwordLength: 7,
      passwordLast4: "774a",
    });
  });

  it("detects Mailgun 535 auth failures", () => {
    expect(isSmtpAuthFailure("Invalid login: 535 Authentication failed")).toBe(true);
    expect(isSmtpAuthFailure("connection timeout")).toBe(false);
  });

  it("hints Mailgun username and region", () => {
    expect(mailgunUsernameHint("postmaster@mg.x.com", "smtp.eu.mailgun.org")).toBe("");
    expect(mailgunUsernameHint("admin@noreply.bookingqube.com", "smtp.eu.mailgun.org")).toBe(
      "mailgun_username_unusual",
    );
    expect(mailgunUsernameHint("plainuser", "smtp.mailgun.org")).toBe("mailgun_username_need_at");
    expect(mailgunRegionHint("smtp.eu.mailgun.org")).toBe("eu");
    expect(mailgunRegionHint("smtp.mailgun.org")).toBe("us");
    expect(mailgunAlternateSmtpHost("smtp.eu.mailgun.org")).toBe("smtp.mailgun.org");
    expect(mailgunAlternateSmtpHost("smtp.mailgun.org")).toBe("smtp.eu.mailgun.org");
    expect(mailgunPresetForHost("smtp.eu.mailgun.org")).toBe("mailgun_eu");
    expect(mailgunPresetForHost("smtp.mailgun.org")).toBe("mailgun_us");
  });

  it("maps encryption to nodemailer secure/requireTLS correctly", () => {
    expect(nodemailerSecureOptions("tls", 587)).toEqual({ secure: false, requireTLS: true });
    expect(nodemailerSecureOptions("starttls", 587)).toEqual({ secure: false, requireTLS: true });
    expect(nodemailerSecureOptions("ssl", 465)).toEqual({ secure: true });
    expect(nodemailerSecureOptions("none", 587)).toEqual({ secure: false });
  });

  it("warns when SMTP password looks like Mailgun API Security secrets", () => {
    const host = "smtp.eu.mailgun.org";
    // Prefix-only samples so scanners do not treat fixtures as live credentials.
    const fakePrivateApiKey = `key-${"0".repeat(32)}`;
    const fakePubkey = `pubkey-${"a".repeat(32)}`;
    expect(mailgunSmtpPasswordHint(fakePrivateApiKey, host)).toBe(
      "mailgun_password_looks_like_api_key",
    );
    expect(mailgunSmtpPasswordHint(fakePubkey, host)).toBe("mailgun_password_looks_like_pubkey");
    expect(
      mailgunSmtpPasswordHint(`${"a".repeat(32)}-${"b".repeat(8)}-${"c".repeat(8)}`, host),
    ).toBe("mailgun_password_looks_like_webhook_signing");
    expect(mailgunSmtpPasswordHint(`${"b".repeat(8)}-${"c".repeat(8)}`, host)).toBe(
      "mailgun_password_looks_like_webhook_signing",
    );
    expect(mailgunSmtpPasswordHint("real-smtp-password-from-domain", host)).toBe("");
    expect(mailgunSmtpPasswordHint(fakePrivateApiKey, "smtp.gmail.com")).toBe("");
    expect(
      smtpAuthDiagnostics({
        host,
        port: 587,
        encryption: "tls",
        username: "postmaster@example.com",
        password: fakePrivateApiKey,
      }).passwordHint,
    ).toBe("mailgun_password_looks_like_api_key");
  });
});
