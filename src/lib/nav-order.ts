import { NAV_DEPARTMENTS, type NavDepartmentId } from "@/lib/nav-config";
import { canUserDo, type AppRole } from "@/lib/rbac";

/** Same gate as other platform settings: Administration capability and CEO/COO level. */
export const SIDEBAR_NAV_ORDER_AUTH = {
  capability: "admin.view" as const,
  minRoleLevel: 95,
};

const EN_LABELS: Record<NavDepartmentId, string> = {
  operations: "Operations & Command",
  people: "People & HR",
  commercial: "PR & Commercial",
  guest: "Guest Experience",
  maintenance: "Maintenance & Facilities",
  arcade: "Arcade Technical",
  compliance: "Compliance & Safety",
  utilities: "Utilities & Resources",
  admin: "Administration",
  procurement: "Procurement",
  events: "Project Management",
  training: "Training",
};

const AR_LABELS: Record<NavDepartmentId, string> = {
  operations: "العمليات والقيادة",
  people: "الموارد البشرية",
  commercial: "التجاري والعلاقات العامة",
  guest: "تجربة الضيوف",
  maintenance: "الصيانة والمرافق",
  arcade: "الفني للألعاب",
  compliance: "الامتثال والسلامة",
  utilities: "المرافق والموارد",
  admin: "الإدارة",
  procurement: "المشتريات",
  events: "إدارة المشاريع",
  training: "التدريب",
};

const ALIASES: Record<NavDepartmentId, readonly string[]> = {
  operations: ["operations & command", "operations and command", "operations", EN_LABELS.operations, AR_LABELS.operations, "العمليات"],
  people: ["people & hr", "people and hr", "people", EN_LABELS.people, AR_LABELS.people],
  commercial: ["pr & commercial", "commercial", EN_LABELS.commercial, AR_LABELS.commercial],
  guest: ["guest experience", "guest", EN_LABELS.guest, AR_LABELS.guest],
  maintenance: ["maintenance & facilities", "maintenance", EN_LABELS.maintenance, AR_LABELS.maintenance, "الصيانة"],
  arcade: ["arcade technical", "arcade", EN_LABELS.arcade, AR_LABELS.arcade],
  compliance: ["compliance & safety", "compliance", EN_LABELS.compliance, AR_LABELS.compliance, "الامتثال"],
  utilities: ["utilities & resources", "utilities", EN_LABELS.utilities, AR_LABELS.utilities],
  admin: ["administration", "admin", EN_LABELS.admin, AR_LABELS.admin],
  procurement: ["procurement", EN_LABELS.procurement, AR_LABELS.procurement],
  events: ["project management", "events", EN_LABELS.events, AR_LABELS.events, "إدارة المشاريع"],
  training: ["training", EN_LABELS.training, AR_LABELS.training],
};

export function defaultNavDepartmentOrder(): NavDepartmentId[] {
  return NAV_DEPARTMENTS.map((dept) => dept.id);
}

export function canReorderSidebarNav(
  roles: readonly { role: AppRole; role_level: number }[],
): boolean {
  return (
    canUserDo(
      roles.map((role) => role.role),
      SIDEBAR_NAV_ORDER_AUTH.capability,
    ) && roles.some((role) => role.role_level >= SIDEBAR_NAV_ORDER_AUTH.minRoleLevel)
  );
}

export function normalizeNavDepartmentOrder(
  saved: readonly string[] | null | undefined,
  known: readonly NavDepartmentId[] = defaultNavDepartmentOrder(),
): NavDepartmentId[] {
  const knownSet = new Set(known);
  const seen = new Set<NavDepartmentId>();
  const next: NavDepartmentId[] = [];
  for (const id of saved ?? []) {
    if (!knownSet.has(id as NavDepartmentId) || seen.has(id as NavDepartmentId)) continue;
    seen.add(id as NavDepartmentId);
    next.push(id as NavDepartmentId);
  }
  for (const id of known) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

/** Move one department onto another's slot. Items inside a department are not touched. */
export function moveNavDepartment(
  order: readonly string[],
  activeId: string,
  overId: string,
  known: readonly NavDepartmentId[] = defaultNavDepartmentOrder(),
): NavDepartmentId[] {
  const base = normalizeNavDepartmentOrder(order, known);
  const from = base.indexOf(activeId as NavDepartmentId);
  const to = base.indexOf(overId as NavDepartmentId);
  if (from < 0 || to < 0 || from === to) return base;
  const next = [...base];
  const [item] = next.splice(from, 1);
  if (!item) return base;
  next.splice(to, 0, item);
  return next;
}

export function orderDepartments<T extends { id: NavDepartmentId }>(
  items: readonly T[],
  order: readonly string[] | null | undefined,
): T[] {
  const rank = new Map(normalizeNavDepartmentOrder(order).map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(item.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

export function orderPrimaryRail<T extends { departmentId: NavDepartmentId }>(
  items: readonly T[],
  order: readonly string[] | null | undefined,
): T[] {
  const rank = new Map(normalizeNavDepartmentOrder(order).map((id, index) => [id, index]));
  return items
    .map((item, index) => ({
      item,
      index,
      rank: rank.get(item.departmentId) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/** Stable identity for one sidebar link. Label plus href, because some paths are shared. */
export function navItemOrderKey(item: { labelKey: string; href: string }): string {
  return `${item.labelKey}|${item.href}`;
}

export type SidebarItemOrders = Record<string, string[]>;

export type SidebarItemLabel = {
  bucket: string;
  key: string;
  en: string;
  ar: string;
};

function itemBucket(departmentId: string, groupId?: string) {
  return groupId ? `${departmentId}:${groupId}` : departmentId;
}

export function defaultItemOrders(): SidebarItemOrders {
  const orders: SidebarItemOrders = {};
  for (const dept of NAV_DEPARTMENTS) {
    orders[dept.id] = dept.items.map(navItemOrderKey);
    for (const group of dept.groups ?? []) {
      orders[itemBucket(dept.id, group.id)] = group.items.map(navItemOrderKey);
    }
  }
  return orders;
}

export function normalizeItemOrders(saved: unknown): SidebarItemOrders {
  const defaults = defaultItemOrders();
  const raw =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {};
  const next: SidebarItemOrders = {};
  for (const [bucket, known] of Object.entries(defaults)) {
    const incoming = Array.isArray(raw[bucket])
      ? raw[bucket].filter((id): id is string => typeof id === "string")
      : [];
    const knownSet = new Set(known);
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of incoming) {
      if (!knownSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
    for (const id of known) {
      if (seen.has(id)) continue;
      let insertAt = ordered.length;
      const knownIndex = known.indexOf(id);
      for (let index = knownIndex - 1; index >= 0; index -= 1) {
        const previous = known[index];
        if (!previous) continue;
        const at = ordered.indexOf(previous);
        if (at >= 0) {
          insertAt = at + 1;
          break;
        }
      }
      ordered.splice(insertAt, 0, id);
      seen.add(id);
    }
    next[bucket] = ordered;
  }
  return next;
}

export function orderNavItems<T extends { labelKey: string; href: string }>(
  items: readonly T[],
  orderedKeys: readonly string[] | null | undefined,
): T[] {
  const rank = new Map((orderedKeys ?? []).map((id, index) => [id, index]));
  return items
    .map((item, index) => ({
      item,
      index,
      rank: rank.get(navItemOrderKey(item)) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

export function applySidebarItemOrder<
  T extends {
    id: string;
    items: readonly { labelKey: string; href: string }[];
    groups?: readonly { id: string; items: readonly { labelKey: string; href: string }[] }[] | undefined;
  },
>(departments: readonly T[], itemOrders: SidebarItemOrders | null | undefined): T[] {
  const orders = normalizeItemOrders(itemOrders);
  return departments.map((dept) => ({
    ...dept,
    items: orderNavItems(dept.items, orders[dept.id]),
    groups: dept.groups
      ? dept.groups.map((group) => ({
          ...group,
          items: orderNavItems(group.items, orders[itemBucket(dept.id, group.id)]),
        }))
      : dept.groups,
  }));
}

/** Drag one link onto another inside the same department or group. */
export function moveNavItem(
  orders: SidebarItemOrders,
  bucket: string,
  activeKey: string,
  overKey: string,
): SidebarItemOrders {
  const base = normalizeItemOrders(orders);
  const list = base[bucket];
  if (!list) return base;
  const next = [...list];
  const from = next.indexOf(activeKey);
  const to = next.indexOf(overKey);
  if (from < 0 || to < 0 || from === to) return base;
  const [item] = next.splice(from, 1);
  if (!item) return base;
  next.splice(to, 0, item);
  return { ...base, [bucket]: next };
}

function placeNavItem(
  orders: SidebarItemOrders,
  bucket: string,
  movingKey: string,
  where: "before" | "after" | "start" | "end",
  anchorKey?: string,
): SidebarItemOrders {
  const base = normalizeItemOrders(orders);
  const list = base[bucket];
  if (!list || !list.includes(movingKey)) return base;
  const rest = list.filter((id) => id !== movingKey);
  let at = 0;
  if (where === "end") at = rest.length;
  else if (where === "before" || where === "after") {
    const index = anchorKey ? rest.indexOf(anchorKey) : -1;
    if (index < 0) return base;
    at = where === "before" ? index : index + 1;
  }
  rest.splice(at, 0, movingKey);
  return { ...base, [bucket]: rest };
}

export function sidebarItemLabelCatalog(
  enNav: Record<string, unknown>,
  arNav: Record<string, unknown>,
): SidebarItemLabel[] {
  const text = (bag: Record<string, unknown>, labelKey: string) => {
    const short = labelKey.startsWith("nav.") ? labelKey.slice(4) : labelKey;
    const value = bag[short];
    return typeof value === "string" ? value.trim() : "";
  };
  const rows: SidebarItemLabel[] = [];
  const push = (bucket: string, item: { labelKey: string; href: string }) => {
    rows.push({
      bucket,
      key: navItemOrderKey(item),
      en: text(enNav, item.labelKey),
      ar: text(arNav, item.labelKey),
    });
  };
  for (const dept of NAV_DEPARTMENTS) {
    for (const item of dept.items) push(dept.id, item);
    for (const group of dept.groups ?? []) {
      for (const item of group.items) push(itemBucket(dept.id, group.id), item);
    }
  }
  return rows;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasIndex(haystack: string, alias: string): number {
  if (/[\u0600-\u06FF]/.test(alias)) return haystack.indexOf(alias);
  const match = new RegExp(`(?<![a-z0-9])${escapeRegExp(alias.toLowerCase())}(?![a-z0-9])`, "i").exec(
    haystack,
  );
  return match?.index ?? -1;
}

function findMentions(instruction: string): NavDepartmentId[] {
  const hits: { id: NavDepartmentId; index: number; length: number }[] = [];
  for (const id of defaultNavDepartmentOrder()) {
    for (const alias of ALIASES[id]) {
      const index = aliasIndex(instruction, alias);
      if (index >= 0) hits.push({ id, index, length: alias.length });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const used = new Set<NavDepartmentId>();
  const mentions: NavDepartmentId[] = [];
  let occupiedUntil = -1;
  for (const hit of hits) {
    if (used.has(hit.id) || hit.index < occupiedUntil) continue;
    used.add(hit.id);
    occupiedUntil = hit.index + hit.length;
    mentions.push(hit.id);
  }
  return mentions;
}

function keywordIndex(instruction: string, pattern: RegExp): number {
  const match = pattern.exec(instruction);
  return match?.index ?? -1;
}

function placeLead(order: readonly NavDepartmentId[], lead: readonly NavDepartmentId[], where: "start" | "end") {
  const leadSet = new Set(lead);
  const rest = order.filter((id) => !leadSet.has(id));
  return where === "start" ? [...lead, ...rest] : [...rest, ...lead];
}

function placeRelative(
  order: readonly NavDepartmentId[],
  moving: NavDepartmentId,
  anchor: NavDepartmentId,
  where: "before" | "after",
): NavDepartmentId[] {
  const rest = order.filter((id) => id !== moving);
  const index = rest.indexOf(anchor);
  if (index < 0) return [...order];
  const at = where === "before" ? index : index + 1;
  rest.splice(at, 0, moving);
  return rest;
}

/**
 * Read a short department reorder instruction.
 * Returns null when it does not name a department change. Link moves are separate.
 */
export function interpretNavOrderInstruction(
  order: readonly string[],
  instruction: string,
): NavDepartmentId[] | null {
  const text = instruction.trim().toLowerCase();
  if (text.length < 2) return null;
  const base = normalizeNavDepartmentOrder(order);
  const mentions = findMentions(text);
  const alphabeticalAt = keywordIndex(text, /alphabetical|alphabetic|a to z|a-z|sort by name|أبجدي/);
  const reverseAt = keywordIndex(text, /reverse|backwards|flip|عكس/);
  if (mentions.length === 0 && alphabeticalAt >= 0) {
    const arabic = /[\u0600-\u06FF]/.test(instruction);
    const labels = arabic ? AR_LABELS : EN_LABELS;
    return [...base].sort((a, b) => labels[a].localeCompare(labels[b], arabic ? "ar" : "en"));
  }
  if (mentions.length === 0 && reverseAt >= 0) return [...base].reverse();

  const beforeAt = keywordIndex(text, /before|above|قبل/);
  const afterAt = keywordIndex(text, /after|below|بعد/);
  const topAt = keywordIndex(text, /top|first|start|beginning|الأول|أولاً|اولا|الأعلى|بداية/);
  const bottomAt = keywordIndex(text, /bottom|last|end|الأخير|النهاية|أسفل/);

  if (mentions.length >= 2 && (beforeAt >= 0 || afterAt >= 0)) {
    const before = afterAt < 0 || (beforeAt >= 0 && beforeAt <= afterAt);
    const moving = mentions[0]!;
    const anchor = mentions[1]!;
    return placeRelative(base, moving, anchor, before ? "before" : "after");
  }
  if (mentions.length >= 1 && topAt >= 0 && (bottomAt < 0 || topAt <= bottomAt)) {
    return placeLead(base, mentions, "start");
  }
  if (mentions.length >= 1 && bottomAt >= 0) return placeLead(base, mentions, "end");
  if (mentions.length >= 2) return placeLead(base, mentions, "start");
  return null;
}

export function navOrderFromAiPayload(
  payload: unknown,
  known: readonly NavDepartmentId[] = defaultNavDepartmentOrder(),
): NavDepartmentId[] | null {
  if (!payload || typeof payload !== "object") return null;
  const order = (payload as { order?: unknown }).order;
  if (!Array.isArray(order)) return null;
  const ids = order.filter((id): id is string => typeof id === "string");
  const knownSet = new Set<string>(known);
  const recognized = ids.filter((id) => knownSet.has(id));
  if (new Set(recognized).size < 2) return null;
  return normalizeNavDepartmentOrder(recognized, known);
}

export function navOrderLabelsForPrompt(): string {
  return defaultNavDepartmentOrder()
    .map((id) => `${id}: ${EN_LABELS[id]} / ${AR_LABELS[id]}`)
    .join("\n");
}

function findItemMentions(instruction: string, catalog: readonly SidebarItemLabel[]) {
  const hits: { bucket: string; key: string; index: number; length: number }[] = [];
  for (const row of catalog) {
    for (const alias of [row.en, row.ar]) {
      if (alias.length < 2) continue;
      const index = aliasIndex(instruction, alias);
      if (index >= 0) hits.push({ bucket: row.bucket, key: row.key, index, length: alias.length });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const mentions: { bucket: string; key: string }[] = [];
  const used = new Set<string>();
  let occupiedUntil = -1;
  for (const hit of hits) {
    if (hit.index < occupiedUntil) continue;
    const span = hits.filter(
      (other) =>
        other.index === hit.index &&
        other.length === hit.length &&
        !used.has(`${other.bucket}\0${other.key}`),
    );
    const unique = new Map<string, { bucket: string; key: string }>();
    for (const rival of span) unique.set(`${rival.bucket}\0${rival.key}`, rival);
    let chosen = [...unique.values()];
    if (chosen.length > 1) {
      const pages = chosen.filter((rival) => !rival.key.includes("#"));
      if (pages.length === 1) chosen = pages;
    }
    if (chosen.length > 1) {
      const buckets = new Set(mentions.map((mention) => mention.bucket));
      const narrowed = chosen.filter((rival) => buckets.has(rival.bucket));
      if (narrowed.length !== 1) return null;
      chosen = narrowed;
    }
    const pick = chosen[0];
    if (!pick) continue;
    used.add(`${pick.bucket}\0${pick.key}`);
    occupiedUntil = hit.index + hit.length;
    mentions.push({ bucket: pick.bucket, key: pick.key });
  }
  return mentions;
}

/**
 * Move one named link inside its department.
 * "move Engagement under Leave" places that link after Leave. Cross-department moves are ignored.
 */
export function interpretNavItemInstruction(
  orders: SidebarItemOrders,
  instruction: string,
  catalog: readonly SidebarItemLabel[],
): SidebarItemOrders | null {
  const text = instruction.trim().toLowerCase();
  if (text.length < 2) return null;
  const mentions = findItemMentions(text, catalog);
  if (!mentions || mentions.length === 0) return null;
  const beforeAt = keywordIndex(text, /before|above|قبل/);
  const afterAt = keywordIndex(text, /after|below|under|بعد|تحت/);
  const topAt = keywordIndex(text, /top|first|start|beginning|الأول|أولاً|اولا|الأعلى|بداية/);
  const bottomAt = keywordIndex(text, /bottom|last|end|الأخير|النهاية|أسفل/);
  const moving = mentions[0];
  if (!moving) return null;

  if (mentions.length >= 2 && (beforeAt >= 0 || afterAt >= 0)) {
    const anchor = mentions[1];
    if (!anchor || moving.bucket !== anchor.bucket || moving.key === anchor.key) return null;
    const before = afterAt < 0 || (beforeAt >= 0 && beforeAt <= afterAt);
    return placeNavItem(orders, moving.bucket, moving.key, before ? "before" : "after", anchor.key);
  }
  if (mentions.length === 1 && topAt >= 0 && (bottomAt < 0 || topAt <= bottomAt)) {
    return placeNavItem(orders, moving.bucket, moving.key, "start");
  }
  if (mentions.length === 1 && bottomAt >= 0) {
    return placeNavItem(orders, moving.bucket, moving.key, "end");
  }
  return null;
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function navPlanFromAiPayload(
  payload: unknown,
  currentDepartments: readonly string[],
  currentItems: SidebarItemOrders,
): { departmentIds: NavDepartmentId[]; itemOrders: SidebarItemOrders } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { order?: unknown; items?: unknown };
  const departmentIds = Array.isArray(record.order) ? navOrderFromAiPayload({ order: record.order }) : null;
  const baseItems = normalizeItemOrders(currentItems);
  let itemOrders: SidebarItemOrders | null = null;
  if (record.items && typeof record.items === "object" && !Array.isArray(record.items)) {
    const overlay: Record<string, string[]> = { ...baseItems };
    for (const [bucket, value] of Object.entries(record.items as Record<string, unknown>)) {
      if (!baseItems[bucket] || !Array.isArray(value)) continue;
      overlay[bucket] = value.filter((id): id is string => typeof id === "string");
    }
    itemOrders = normalizeItemOrders(overlay);
  }
  const currentDepartmentIds = normalizeNavDepartmentOrder(currentDepartments);
  const deptChanged = Boolean(departmentIds && !sameStringList(departmentIds, currentDepartmentIds));
  const itemsChanged = Boolean(
    itemOrders &&
      Object.keys(baseItems).some((bucket) => !sameStringList(itemOrders?.[bucket] ?? [], baseItems[bucket] ?? [])),
  );
  if (!deptChanged && !itemsChanged) return null;
  return {
    departmentIds: departmentIds ?? currentDepartmentIds,
    itemOrders: itemOrders ?? baseItems,
  };
}
