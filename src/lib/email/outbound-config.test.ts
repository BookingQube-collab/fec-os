import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMAIL_FROM,
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
};

function row(partial: Partial<EmailSettingsRow>): EmailSettingsRow {
  return {
    managed: false,
    enabled: false,
    from_address: "",
    resend_api_key: "",
    webhook_url: "",
    ...partial,
  };
}

describe("resolveOutboundEmailConfig", () => {
  it("uses env when row is missing", () => {
    expect(resolveOutboundEmailConfig(null, env)).toEqual({
      resendApiKey: "env_resend_key_xxxx",
      webhookUrl: "https://hooks.env.example/email",
      fromAddress: "env@fec.qa",
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
          resend_api_key: "ui_resend",
          webhook_url: "https://hooks.ui.example/email",
        }),
        env,
      ),
    ).toEqual({
      resendApiKey: "ui_resend",
      webhookUrl: "https://hooks.ui.example/email",
      fromAddress: "ui@fec.qa",
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
      resendApiKey: "env_resend_key_xxxx",
      webhookUrl: "https://hooks.env.example/email",
      fromAddress: "env@fec.qa",
      source: "ui",
    });
  });

  it("returns null when nothing is configured", () => {
    expect(
      resolveOutboundEmailConfig(null, { resendApiKey: "", webhookUrl: "", fromAddress: "" }),
    ).toBeNull();
  });

  it("defaults from address", () => {
    expect(
      resolveOutboundEmailConfig(null, {
        resendApiKey: "k",
        webhookUrl: "",
        fromAddress: "",
      })?.fromAddress,
    ).toBe(DEFAULT_EMAIL_FROM);
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
        from_address: "ops@fec.qa",
        resend_api_key: "re_secret_9999",
        webhook_url: "https://hooks.example.com/hook",
      }),
      env,
    );
    expect(pub.resendKeyLast4).toBe("9999");
    expect(pub.resendKeySet).toBe(true);
    expect(pub.webhookSet).toBe(true);
    expect(pub.webhookHint).toBe("hooks.example.com");
    expect(JSON.stringify(pub)).not.toContain("re_secret_9999");
    expect(JSON.stringify(pub)).not.toContain("/hook");
  });
});
