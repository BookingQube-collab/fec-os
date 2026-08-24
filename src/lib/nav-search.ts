import { getAllVisibleNavItems } from "@/lib/nav-config";
import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";

export interface NavSearchHit {
  href: string;
  labelKey: string;
  aliases: string[];
  capability: Capability;
}

/** Extra routes that live under a module but are not primary nav rows. */
const EXTRA_SEARCH_ITEMS: NavSearchHit[] = [
  {
    href: "/compliance/amc-contracts",
    labelKey: "nav.amcContracts",
    aliases: ["amc", "amc contracts", "contracts"],
    capability: "amc.view",
  },
  {
    href: "/people/attendance/roster",
    labelKey: "nav.attendanceRoster",
    aliases: ["roster", "attendance", "attendance roster"],
    capability: "attendance.view",
  },
];

const NAV_SEARCH_ALIASES: Record<string, string[]> = {
  "/compliance/amc-dashboard": ["amc", "amc dashboard", "contracts"],
  "/compliance/amc-schedule": ["amc", "inspections", "amc schedule"],
  "/compliance/amc-contracts": ["amc", "amc contracts", "contracts"],
  "/people": ["people", "staff", "roster"],
  "/people/import": ["roster", "import roster", "import"],
  "/people/attendance": ["attendance", "roster", "time"],
  "/people/attendance/roster": ["roster", "attendance", "attendance roster"],
  "/daily-ops": ["roster", "daily ops", "ops"],
};

const PREFERRED_HREFS = [
  "/compliance/amc-dashboard",
  "/compliance/amc-contracts",
  "/people/attendance",
  "/people",
];

export function buildNavSearchIndex(roles: AppRole[]): NavSearchHit[] {
  const seen = new Set<string>();
  const out: NavSearchHit[] = [];

  for (const item of getAllVisibleNavItems(roles)) {
    seen.add(item.href);
    out.push({
      href: item.href,
      labelKey: item.labelKey,
      aliases: NAV_SEARCH_ALIASES[item.href] ?? [],
      capability: item.capability,
    });
  }

  for (const extra of EXTRA_SEARCH_ITEMS) {
    if (seen.has(extra.href)) continue;
    if (!canUserDo(roles, extra.capability)) continue;
    seen.add(extra.href);
    out.push({
      ...extra,
      aliases: extra.aliases.length > 0 ? extra.aliases : (NAV_SEARCH_ALIASES[extra.href] ?? []),
    });
  }

  return out;
}

function preferredRank(href: string): number {
  const idx = PREFERRED_HREFS.indexOf(href);
  return idx === -1 ? PREFERRED_HREFS.length : idx;
}

export function searchNav(
  query: string,
  index: NavSearchHit[],
  translate: (key: string) => string,
  limit = 8,
): NavSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { item: NavSearchHit; score: number }[] = [];

  for (const item of index) {
    const label = translate(item.labelKey).toLowerCase();
    const href = item.href.toLowerCase();
    const pathBits = href.replace(/[-/]/g, " ");
    let score = 0;

    for (const alias of item.aliases) {
      const a = alias.toLowerCase();
      if (a === q) score = Math.max(score, 100);
      else if (a.startsWith(q)) score = Math.max(score, 80);
      else if (a.includes(q)) score = Math.max(score, 60);
    }

    if (label === q) score = Math.max(score, 95);
    else if (label.startsWith(q)) score = Math.max(score, 75);
    else if (label.includes(q)) score = Math.max(score, 55);

    if (href.includes(`/${q}`) || href.endsWith(q) || pathBits.includes(q)) {
      score = Math.max(score, 50);
    }

    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pref = preferredRank(a.item.href) - preferredRank(b.item.href);
    if (pref !== 0) return pref;
    return a.item.href.localeCompare(b.item.href);
  });

  return scored.slice(0, limit).map((row) => row.item);
}
