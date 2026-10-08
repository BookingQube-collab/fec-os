import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");

const CLIENT_ROOTS = [
  "src/components/chat",
  "src/hooks/queries/useChat.ts",
  "src/views/admin-livekit-page.tsx",
  "app/(protected)/chat",
  "app/(protected)/admin/livekit",
];

function filesUnder(relativePath: string): string[] {
  const full = path.join(repoRoot, relativePath);
  if (!statSync(full).isDirectory()) return [full];
  const found: string[] = [];
  for (const name of readdirSync(full)) {
    const child = path.join(full, name);
    if (statSync(child).isDirectory()) {
      found.push(...filesUnder(path.relative(repoRoot, child)));
    } else if (/\.(ts|tsx|js)$/.test(name)) {
      found.push(child);
    }
  }
  return found;
}

describe("chat browser entrypoints", () => {
  const sources = CLIENT_ROOTS.flatMap((root) => filesUnder(root));

  it("does not import the admin client, call provider, or attachment skip RPC", () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const source = readFileSync(file, "utf8");
      const label = path.relative(repoRoot, file);
      expect(source, label).not.toMatch(/client\.server/);
      expect(source, label).not.toMatch(/supabaseAdmin/);
      expect(source, label).not.toMatch(/call-provider/);
      expect(source, label).not.toMatch(/from ["']@\/lib\/chat\/livekit-settings["']/);
      expect(source, label).not.toMatch(/from ["']@\/lib\/chat\/push-settings["']/);
      expect(source, label).not.toMatch(/from ["']web-push["']/);
      expect(source, label).not.toMatch(/chat_livekit_settings/);
      expect(source, label).not.toMatch(/chat_push_settings/);
      expect(source, label).not.toMatch(/VAPID_PRIVATE_KEY/);
      expect(source, label).not.toMatch(/chat_mark_attachment_skipped/);
      expect(source, label).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(source, label).not.toMatch(/LIVEKIT_API_SECRET/);
    }
  });

  it("keeps the admin client and call provider on the server module", () => {
    const actions = readFileSync(path.join(repoRoot, "src/lib/chat.functions.ts"), "utf8");
    const provider = readFileSync(path.join(repoRoot, "src/lib/chat/call-provider.ts"), "utf8");
    expect(actions.startsWith('"use server"')).toBe(true);
    expect(actions).toMatch(/chat_mark_attachment_skipped/);
    expect(actions).not.toMatch(/export (async )?function markAttachmentSkipped|export \{[^}]*markAttachmentSkipped/);
    expect(provider).toMatch(/import ["']server-only["']/);
    expect(provider).toMatch(/new AccessToken\(/);
    expect(provider).toMatch(/toJwt\(\)/);
    expect(provider).not.toMatch(/token:\s*["']/);
    expect(provider).not.toMatch(/token:\s*["']placeholder["']/);
    expect(provider).not.toMatch(/NEXT_PUBLIC_LIVEKIT/);
    const settings = readFileSync(path.join(repoRoot, "src/lib/chat/livekit-settings.ts"), "utf8");
    expect(settings).toMatch(/import ["']server-only["']/);
    expect(settings).not.toMatch(/NEXT_PUBLIC_LIVEKIT/);
    const push = readFileSync(path.join(repoRoot, "src/lib/chat/push-settings.ts"), "utf8");
    expect(push).toMatch(/import ["']server-only["']/);
    expect(push).not.toMatch(/NEXT_PUBLIC_VAPID/);
    const delivery = readFileSync(path.join(repoRoot, "src/lib/chat/push-delivery.ts"), "utf8");
    expect(delivery).toMatch(/import ["']server-only["']/);
    expect(delivery).toMatch(/sendNotification/);
  });
});

describe("chat service worker", () => {
  it("does not cache message bodies or signed urls", () => {
    const source = readFileSync(path.join(repoRoot, "public/sw.js"), "utf8");
    expect(source).toMatch(/url\.origin !== self\.location\.origin/);
    expect(source).toMatch(/url\.pathname\.startsWith\("\/api\/"\)/);
    expect(source).toMatch(/if \(!isIcon\) return/);
    expect(source).not.toMatch(/chat_messages|signedUrl|storage\/v1/);
  });
});
