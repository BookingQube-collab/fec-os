import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMAIL_FROM,
  applySmtpPreset,
  formatFromHeader,
  keepSecret,
  resolveOutboundEmailConfig,
  secretLast4,
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
    expect(pub.webhookSet).toBe(true);
    expect(pub.webhookHint).toBe("hooks.example.com");
    expect(JSON.stringify(pub)).not.toContain("re_secret_9999");
    expect(JSON.stringify(pub)).not.toContain("app_password_8888");
    expect(JSON.stringify(pub)).not.toContain("/hook");
  });
});
