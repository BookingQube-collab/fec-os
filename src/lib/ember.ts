/**
 * Team Chat module — Ember-like shell on FEC Vercel + Supabase Chat Hub.
 * No Cloudflare. Messaging uses existing chat_* tables; UI is EmberWorkspaceShell.
 */

export type EmberTabId =
  | "workspace"
  | "rooms"
  | "newRoom"
  | "dms"
  | "activity"
  | "search"
  | "files"
  | "bots"
  | "agents"
  | "profile"
  | "push"
  | "settings"
  | "styles";

export type EmberNativeSurface =
  | {
      kind: "chat";
      surface: "all" | "rooms" | "dms" | "activity";
      autoOpenCreate?: boolean;
      autoOpenCompose?: boolean;
      autoOpenSearch?: boolean;
    }
  | { kind: "files" }
  | { kind: "settings" }
  | { kind: "push" }
  | { kind: "profile" }
  | { kind: "bots" }
  | { kind: "agents" }
  | { kind: "styles" };

export interface EmberTabDef {
  id: EmberTabId;
  href: string;
  navKey: string;
  copyKey: EmberTabId;
  capability: "ember.view" | "ember.manage";
  native: EmberNativeSurface;
}

/** Feature tabs mapped to native FEC Chat Hub / admin surfaces (Vercel only). */
export const EMBER_TABS: readonly EmberTabDef[] = [
  {
    id: "workspace",
    href: "/ember",
    navKey: "workspace",
    copyKey: "workspace",
    capability: "ember.view",
    native: { kind: "chat", surface: "all" },
  },
  {
    id: "rooms",
    href: "/ember/rooms",
    navKey: "rooms",
    copyKey: "rooms",
    capability: "ember.view",
    native: { kind: "chat", surface: "rooms" },
  },
  {
    id: "newRoom",
    href: "/ember/new-room",
    navKey: "newRoom",
    copyKey: "newRoom",
    capability: "ember.view",
    native: { kind: "chat", surface: "rooms", autoOpenCreate: true },
  },
  {
    id: "dms",
    href: "/ember/dms",
    navKey: "dms",
    copyKey: "dms",
    capability: "ember.view",
    native: { kind: "chat", surface: "dms", autoOpenCompose: true },
  },
  {
    id: "activity",
    href: "/ember/activity",
    navKey: "activity",
    copyKey: "activity",
    capability: "ember.view",
    native: { kind: "chat", surface: "activity" },
  },
  {
    id: "search",
    href: "/ember/search",
    navKey: "search",
    copyKey: "search",
    capability: "ember.view",
    native: { kind: "chat", surface: "all", autoOpenSearch: true },
  },
  {
    id: "files",
    href: "/ember/files",
    navKey: "files",
    copyKey: "files",
    capability: "ember.view",
    native: { kind: "files" },
  },
  {
    id: "bots",
    href: "/ember/bots",
    navKey: "bots",
    copyKey: "bots",
    capability: "ember.manage",
    native: { kind: "bots" },
  },
  {
    id: "agents",
    href: "/ember/agents",
    navKey: "agents",
    copyKey: "agents",
    capability: "ember.manage",
    native: { kind: "agents" },
  },
  {
    id: "profile",
    href: "/ember/profile",
    navKey: "profile",
    copyKey: "profile",
    capability: "ember.view",
    native: { kind: "profile" },
  },
  {
    id: "push",
    href: "/ember/push",
    navKey: "push",
    copyKey: "push",
    capability: "ember.view",
    native: { kind: "push" },
  },
  {
    id: "settings",
    href: "/ember/settings",
    navKey: "settings",
    copyKey: "settings",
    capability: "ember.manage",
    native: { kind: "settings" },
  },
  {
    id: "styles",
    href: "/ember/styles",
    navKey: "styles",
    copyKey: "styles",
    capability: "ember.manage",
    native: { kind: "styles" },
  },
] as const;

export function emberTabById(id: EmberTabId): EmberTabDef {
  const tab = EMBER_TABS.find((t) => t.id === id);
  if (!tab) throw new Error(`Unknown Ember tab: ${id}`);
  return tab;
}
