// Scans app/api route handlers and regenerates src/lib/api-catalog.ts
// Run: node scripts/generate-api-catalog.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const API_DIR = join(ROOT, "app", "api");
const OUT = join(ROOT, "src", "lib", "api-catalog.ts");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const CATEGORY_RULES = [
  { id: "public", label: "Public & Cron", prefix: "/api/public/" },
  { id: "auth", label: "Auth", prefix: "/api/auth/" },
  { id: "dashboard", label: "Dashboard", prefix: "/api/dashboard/" },
  { id: "compliance", label: "Compliance", prefix: "/api/compliance/" },
  { id: "daily-ops", label: "Daily Ops", prefix: "/api/daily-ops/" },
  { id: "revenue", label: "Revenue", prefix: "/api/revenue/" },
  { id: "amc", label: "AMC", prefix: "/api/amc/" },
  { id: "maintenance", label: "Maintenance", prefix: "/api/maintenance/" },
  { id: "people", label: "People", prefix: "/api/people/" },
  { id: "operations", label: "Operations", prefix: "/api/operations/" },
  { id: "occ", label: "OCC", prefix: "/api/occ/" },
  { id: "admin", label: "Admin", prefix: "/api/admin/" },
  { id: "ceo", label: "CEO", prefix: "/api/ceo/" },
  { id: "inventory", label: "Inventory", prefix: "/api/inventory" },
  { id: "vendors", label: "Vendors", prefix: "/api/vendors" },
  { id: "weekly-reports", label: "Weekly Reports", prefix: "/api/weekly-reports/" },
  { id: "tasks", label: "Tasks", prefix: "/api/tasks" },
  { id: "snags", label: "Snags", prefix: "/api/snags" },
  { id: "issues", label: "Issues", prefix: "/api/issues" },
  { id: "bookings", label: "Bookings", prefix: "/api/bookings" },
  { id: "customer", label: "Customer", prefix: "/api/customer/" },
  { id: "notifications", label: "Notifications", prefix: "/api/notifications" },
  { id: "facility", label: "Facility", prefix: "/api/facility/" },
  { id: "assets", label: "Assets", prefix: "/api/assets" },
  { id: "utilities", label: "Utilities", prefix: "/api/utilities" },
  { id: "sites", label: "Sites", prefix: "/api/sites" },
  { id: "inspections", label: "Inspections", prefix: "/api/inspections" },
  { id: "work-orders", label: "Work Orders", prefix: "/api/work-orders" },
  { id: "risk", label: "Risk", prefix: "/api/risk" },
  { id: "branches", label: "Branches", prefix: "/api/branches" },
];

/** @param {string} dir */
function walkRouteFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walkRouteFiles(full));
    else if (entry === "route.ts") files.push(full);
  }
  return files;
}

/** @param {string} filePath */
function fileToApiPath(filePath) {
  const rel = relative(API_DIR, filePath).replace(/\\/g, "/");
  const segments = rel.replace(/\/route\.ts$/, "").split("/");
  const parts = segments.map((s) => (s.startsWith("[") && s.endsWith("]") ? `{${s.slice(1, -1)}}` : s));
  return `/api/${parts.join("/")}`;
}

/** @param {string} content */
function extractMethods(content) {
  /** @type {string[]} */
  const methods = [];
  for (const m of HTTP_METHODS) {
    if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(content)) methods.push(m);
    if (new RegExp(`export\\s+const\\s+${m}\\s*=`).test(content)) methods.push(m);
  }
  return [...new Set(methods)];
}

/** @param {string} content @param {string} method */
function extractAuth(content, method, apiPath) {
  if (apiPath.startsWith("/api/public/attendance-ingest")) {
    return { authType: "api_key", authDetail: "ATTENDANCE_INGEST_API_KEY (Bearer or X-API-Key)" };
  }
  if (apiPath.startsWith("/api/public/")) {
    return { authType: "cron_secret", authDetail: "CRON_SECRET (Bearer or x-cron-secret)" };
  }
  if (apiPath.startsWith("/api/auth/")) {
    return { authType: "session", authDetail: "Session cookie (optional — 401 returns empty session)" };
  }
  if (content.includes("validateCronRequest")) {
    return { authType: "cron_secret", authDetail: "CRON_SECRET (Bearer or x-cron-secret)" };
  }

  const fnStart = content.indexOf(`function ${method}`);
  const exportStart = content.indexOf(`export async function ${method}`);
  const anchor = fnStart >= 0 ? fnStart : exportStart;
  const slice = anchor >= 0 ? content.slice(anchor, anchor + 2500) : content;

  const capMatch = slice.match(/capability:\s*"([^"]+)"/);
  if (capMatch) return { authType: "session", authDetail: `Session + capability: ${capMatch[1]}` };

  const anyMatch = slice.match(/anyCapability:\s*\[([^\]]+)\]/);
  if (anyMatch) {
    const caps = anyMatch[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
    return { authType: "session", authDetail: `Session + any of: ${caps.join(", ")}` };
  }

  if (content.includes("withAuthRouteRequest") || content.includes("withAuthRoute")) {
    return { authType: "session", authDetail: "Session cookie" };
  }

  return { authType: "none", authDetail: "None" };
}

/** @param {string} content */
function extractDescription(content, apiPath) {
  const block = content.match(/\/\*\*([\s\S]*?)\*\//);
  if (block) {
    const lines = block[1]
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").trim())
      .filter((l) => l && !l.startsWith("@"));
    const line = lines.find((l) => !l.match(/^(GET|POST|PUT|PATCH|DELETE)\s+\/api\//));
    if (line) return line.slice(0, 200);
  }
  const segment = apiPath.split("/").filter(Boolean).slice(1).join(" / ");
  return `FEC-OS API: ${segment}`;
}

/** @param {string} path */
function categorize(path) {
  for (const rule of CATEGORY_RULES) {
    if (path.startsWith(rule.prefix) || path === rule.prefix.replace(/\/$/, "")) {
      return { id: rule.id, label: rule.label };
    }
  }
  return { id: "other", label: "Other" };
}

const MANUAL_EXAMPLES = {
  "POST /api/public/attendance-ingest": {
    headers: { "Content-Type": "application/json", "X-API-Key": "<ATTENDANCE_INGEST_API_KEY>" },
    body: {
      records: [
        {
          location: "Urban Arena - Doha Mall",
          user_name: "Waqar",
          date: "23-06-2026",
          first_check_in: "2:27:51 PM",
          last_check_out: null,
          total_hours_worked: 0,
          overtime: false,
          overtime_hours: 0,
          status: "Missing Punch",
        },
      ],
    },
  },
  "POST /api/public/attendance-sync": {
    headers: { "Content-Type": "application/json", Authorization: "Bearer <CRON_SECRET>" },
    body: {
      location_id: "<uuid>",
      device_code: "ZK-001",
      records: [{ biometric_user_id: "1001", punch_at: "2026-06-29T09:00:00Z", punch_type: "in" }],
    },
  },
  "POST /api/public/bookingqube-sync": {
    headers: { Authorization: "Bearer <CRON_SECRET>" },
    body: { from: "2026-06-01", to: "2026-06-30" },
  },
};

/** @type {import('../src/lib/api-catalog').ApiEndpoint[]} */
const endpoints = [];

for (const file of walkRouteFiles(API_DIR)) {
  const content = readFileSync(file, "utf8");
  const path = fileToApiPath(file);
  const methods = extractMethods(content);
  const { id: categoryId, label: categoryLabel } = categorize(path);
  const description = extractDescription(content, path);

  for (const method of methods) {
    const { authType, authDetail } = extractAuth(content, method, path);
    const key = `${method} ${path}`;
    const example = MANUAL_EXAMPLES[key];
    endpoints.push({
      id: key.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase(),
      method,
      path,
      description,
      categoryId,
      categoryLabel,
      authType,
      authDetail,
      ...(example ? { exampleRequest: example } : {}),
    });
  }
}

endpoints.sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const categories = [...new Map(endpoints.map((e) => [e.categoryId, e.categoryLabel])).entries()]
  .map(([id, label]) => ({ id, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

const out = `/**
 * FEC-OS API catalog — auto-generated by scripts/generate-api-catalog.mjs
 * Regenerate: node scripts/generate-api-catalog.mjs
 * Last generated: ${new Date().toISOString()}
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiAuthType = "session" | "api_key" | "cron_secret" | "none";

export interface ApiExampleRequest {
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  description: string;
  categoryId: string;
  categoryLabel: string;
  authType: ApiAuthType;
  authDetail: string;
  exampleRequest?: ApiExampleRequest;
}

export interface ApiCategory {
  id: string;
  label: string;
}

export const API_CATEGORIES: ApiCategory[] = ${JSON.stringify(categories, null, 2)};

export const API_ENDPOINTS: ApiEndpoint[] = ${JSON.stringify(endpoints, null, 2)};

export const API_ENDPOINT_COUNT = ${endpoints.length};
`;

writeFileSync(OUT, out, "utf8");
console.log(`Wrote ${endpoints.length} endpoints to ${relative(ROOT, OUT)}`);
