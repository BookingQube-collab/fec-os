import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { ingestOmniInboundHandoff } from "@/lib/call-center/omni-bridge";
import {
  loadSettingsRow,
  resolveM365SettingsClientSecret,
  resolveM365SettingsClientState,
  resolveM365SettingsMailbox,
} from "@/lib/call-center/db";
import { getM365PublicStatus, parseGraphValidationToken } from "@/lib/call-center/omni";
import {
  fetchM365MessageById,
  resolveM365GraphConfig,
} from "@/lib/call-center/m365-graph";
import { secretsEqual } from "@/lib/server/secret-equal";

export const runtime = "nodejs";

function verifyOptionalHmac(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!secret) return true;
  if (!signatureHeader) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return secretsEqual(provided, expected);
  }
}

/**
 * Microsoft 365 / Graph mail change-notification webhook.
 *
 * GET/POST validationToken echo for Graph subscription handshake.
 * POST notifications → fetch full message (when credentials set) → omni tickets/messages.
 * Demo: POST ?demo=1 with { from, subject, body, id, conversationId }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const validation = parseGraphValidationToken(url);
  if (validation) {
    return new NextResponse(validation, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (url.searchParams.get("status") === "1") {
    const settings = await loadSettingsRow().catch(() => null);
    return NextResponse.json({
      ok: true,
      channel: "microsoft365_email",
      status: getM365PublicStatus({
        enabled: settings?.m365_enabled,
        mailbox: settings?.m365_mailbox,
        tenantId: settings?.m365_tenant_id,
        clientId: settings?.m365_client_id,
        clientSecret: settings?.m365_client_secret,
        clientState: settings?.m365_webhook_client_state,
      }),
      subscriptionId: settings?.m365_subscription_id || null,
      subscriptionExpiresAt: settings?.m365_subscription_expires_at || null,
    });
  }

  return NextResponse.json({ ok: true, channel: "microsoft365_email" });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const validation = parseGraphValidationToken(url);
  if (validation) {
    return new NextResponse(validation, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const isDemo = url.searchParams.get("demo") === "1";
  const rawBody = await request.text();
  const settings = await loadSettingsRow().catch(() => null);
  const clientStateExpected = resolveM365SettingsClientState(settings);
  const mailbox = resolveM365SettingsMailbox(settings);
  const graphConfig = resolveM365GraphConfig({
    tenantId: settings?.m365_tenant_id,
    clientId: settings?.m365_client_id,
    clientSecret: settings?.m365_client_secret,
    mailbox: settings?.m365_mailbox,
    clientState: settings?.m365_webhook_client_state,
  });

  if (!isDemo) {
    const hmacOk = verifyOptionalHmac(
      rawBody,
      request.headers.get("x-fec-m365-signature"),
      process.env.M365_WEBHOOK_HMAC_SECRET?.trim() || "",
    );
    if (!hmacOk) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  type InboundMail = {
    id: string;
    conversationId: string;
    from: string;
    fromName: string;
    subject: string;
    body: string;
  };

  const mails: InboundMail[] = [];

  if (isDemo) {
    const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const id = String(root.id ?? `m365.DEMO_${Date.now()}`);
    mails.push({
      id,
      conversationId: String(root.conversationId ?? id),
      from: String(root.from ?? root.email ?? "customer@example.com").trim(),
      fromName: String(root.fromName ?? "").trim(),
      subject: String(root.subject ?? "Demo Microsoft 365 email").trim(),
      body: String(root.body ?? root.text ?? "Hello from M365 demo").trim(),
    });
  } else {
    const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const value = Array.isArray(root.value) ? root.value : [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const n = item as Record<string, unknown>;
      const clientState = String(n.clientState ?? "").trim();
      if (clientStateExpected && clientState && !secretsEqual(clientState, clientStateExpected)) {
        continue;
      }
      const resourceData =
        n.resourceData && typeof n.resourceData === "object"
          ? (n.resourceData as Record<string, unknown>)
          : {};
      const id = String(resourceData.id ?? "").trim();
      if (id && graphConfig) {
        try {
          const full = await fetchM365MessageById(graphConfig, id);
          if (full) {
            mails.push({
              id: full.id,
              conversationId: full.conversationId,
              from: full.fromEmail,
              fromName: full.fromName,
              subject: full.subject,
              body: full.bodyText || full.bodyPreview,
            });
            continue;
          }
        } catch {
          // Fall through to stub ticket.
        }
      }
      const resource = String(n.resource ?? "").trim();
      const stubId = id || resource || `graph_${Date.now()}`;
      mails.push({
        id: stubId,
        conversationId: stubId,
        from: "unknown@graph",
        fromName: "",
        subject: "Microsoft 365 email notification",
        body: resource || "Graph notification (message fetch pending credentials).",
      });
    }

    if (mails.length === 0 && (root.from || root.subject || root.body)) {
      const id = String(root.id ?? `m365_${Date.now()}`);
      mails.push({
        id,
        conversationId: String(root.conversationId ?? id),
        from: String(root.from ?? "").trim(),
        fromName: String(root.fromName ?? "").trim(),
        subject: String(root.subject ?? "Inbound email").trim(),
        body: String(root.body ?? root.text ?? "").trim(),
      });
    }
  }

  let tickets = 0;
  const errors: string[] = [];

  for (const mail of mails) {
    try {
      await ingestOmniInboundHandoff({
        source: "microsoft365_email",
        channel: "email",
        eventTitle: "inbound_email",
        externalThreadId: mail.conversationId || mail.id,
        externalMessageId: mail.id,
        customerEmail: mail.from,
        customerName: mail.fromName || mail.from.split("@")[0] || mail.from,
        summary: mail.subject || "Microsoft 365 inbound",
        subject: mail.subject,
        lastMessage: mail.body,
        metadata: {
          mailbox: mailbox || null,
          graphConfigured: Boolean(graphConfig),
          demo: isDemo,
        },
      });
      tickets += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "ticket_failed");
    }
  }

  return NextResponse.json({
    ok: true,
    demo: isDemo || undefined,
    received: mails.length,
    tickets,
    errors: errors.slice(0, 5),
    graphConfigured: Boolean(graphConfig),
  });
}
