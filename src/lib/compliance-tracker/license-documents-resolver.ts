import type { E3ComplianceItemRow } from "@/lib/compliance-tracker/constants";
import {
  LICENSE_DOCUMENTS_TREE,
  LICENSE_DOC_LOCATION_TREE_MAP,
  LICENSE_DOC_NODE_INDEX,
} from "@/lib/compliance-tracker/license-documents-config";
import type {
  LicenseDocMatch,
  LicenseDocNode,
  LicenseDocResolverContext,
  LicenseDocumentsResult,
  ResolvedLicenseDocNode,
} from "@/lib/compliance-tracker/license-documents-types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function rowMatches(row: E3ComplianceItemRow, match: LicenseDocMatch): boolean {
  if (row.location !== match.location) return false;
  if (match.area && row.area !== match.area) return false;
  if (match.category && row.category !== match.category) return false;
  if (match.item && normalize(row.item) !== normalize(match.item)) return false;
  if (match.itemContains && !normalize(row.item).includes(normalize(match.itemContains))) return false;
  if (match.vendorContains && !normalize(row.vendor).includes(normalize(match.vendorContains))) return false;
  return true;
}

function findMatchingRow(rows: E3ComplianceItemRow[], match: LicenseDocMatch): E3ComplianceItemRow | null {
  const candidates = rows.filter((row) => rowMatches(row, match));
  if (!candidates.length) return null;
  return candidates.find((row) => row.drive_link) ?? candidates[0] ?? null;
}

function countDocuments(nodes: ResolvedLicenseDocNode[]): {
  totalDocuments: number;
  linkedDocuments: number;
  missingDocuments: number;
} {
  let totalDocuments = 0;
  let linkedDocuments = 0;
  let missingDocuments = 0;

  function walk(node: ResolvedLicenseDocNode) {
    if (node.type === "document") {
      totalDocuments += 1;
      if (node.driveLink) linkedDocuments += 1;
      else missingDocuments += 1;
      return;
    }
    node.children?.forEach(walk);
  }

  nodes.forEach(walk);
  return { totalDocuments, linkedDocuments, missingDocuments };
}

function resolveNode(node: LicenseDocNode, ctx: LicenseDocResolverContext): ResolvedLicenseDocNode {
  const cached = ctx.resolvedCache.get(node.id);
  if (cached) return cached;

  if (node.sameAs) {
    const ref = ctx.nodeById.get(node.sameAs);
    if (!ref) {
      const empty: ResolvedLicenseDocNode = {
        id: node.id,
        label: node.label,
        labelAr: node.labelAr,
        type: "folder",
        driveLink: null,
        matchItemId: null,
        computedStatus: null,
        sameAsRef: node.sameAs,
        children: [],
      };
      ctx.resolvedCache.set(node.id, empty);
      return empty;
    }

    const resolvedRef = resolveNode(ref, ctx);
    const cloned: ResolvedLicenseDocNode = {
      ...resolvedRef,
      id: node.id,
      label: node.label,
      labelAr: node.labelAr ?? resolvedRef.labelAr,
      sameAsRef: node.sameAs,
      children: resolvedRef.children?.map((child) => ({
        ...child,
        id: `${node.id}__${child.id}`,
      })),
    };
    ctx.resolvedCache.set(node.id, cloned);
    return cloned;
  }

  if (node.children?.length) {
    const resolved: ResolvedLicenseDocNode = {
      id: node.id,
      label: node.label,
      labelAr: node.labelAr,
      type: "folder",
      driveLink: null,
      matchItemId: null,
      computedStatus: null,
      sameAsRef: null,
      children: node.children.map((child) => resolveNode(child, ctx)),
    };
    ctx.resolvedCache.set(node.id, resolved);
    return resolved;
  }

  const match = node.match;
  const row = match ? findMatchingRow(ctx.rows, match) : null;
  const resolved: ResolvedLicenseDocNode = {
    id: node.id,
    label: node.label,
    labelAr: node.labelAr,
    type: "document",
    driveLink: row?.drive_link ?? null,
    matchItemId: row?.id ?? null,
    computedStatus: row?.computed_status ?? (row?.drive_link ? "Compliant" : null),
    sameAsRef: null,
  };
  ctx.resolvedCache.set(node.id, resolved);
  return resolved;
}

export function resolveLicenseDocumentsTree(rows: E3ComplianceItemRow[]): LicenseDocumentsResult {
  const ctx: LicenseDocResolverContext = {
    rows,
    nodeById: LICENSE_DOC_NODE_INDEX,
    resolvedCache: new Map(),
  };

  const tree = LICENSE_DOCUMENTS_TREE.map((node) => resolveNode(node, ctx));
  return {
    tree,
    stats: countDocuments(tree),
    updatedAt: new Date().toISOString(),
  };
}

/** Filter resolved tree by E3 location and/or top-level field (Compliances vs Contractors). */
export function filterLicenseDocumentsTree(
  result: LicenseDocumentsResult,
  locationFilter: string,
  fieldFilter = "All",
): LicenseDocumentsResult {
  let tree = result.tree;

  if (locationFilter && locationFilter !== "All") {
    const treeId = LICENSE_DOC_LOCATION_TREE_MAP[locationFilter];
    if (treeId) {
      tree = tree.filter((node) => node.id === treeId);
    }
  }

  if (fieldFilter && fieldFilter !== "All") {
    tree = tree
      .map((node) => pruneLicenseDocTreeByField(node, fieldFilter))
      .filter((node): node is ResolvedLicenseDocNode => node !== null);
  }

  return { ...result, tree, stats: countDocuments(tree) };
}

function pruneLicenseDocTreeByField(
  node: ResolvedLicenseDocNode,
  field: string,
): ResolvedLicenseDocNode | null {
  if (node.type === "document") return node;

  const label = node.label.toLowerCase();
  const id = node.id;

  if (field === "E3 Compliances") {
    if (label === "contractors" || id.endsWith("-contractors")) return null;
  } else if (field === "Contractors") {
    if (label === "e3 compliances" || id.endsWith("-e3")) return null;
    if (
      label.includes("qcdd") ||
      label.includes("municipality") ||
      label.includes("civil defense") ||
      label.includes("civil defence")
    ) {
      return null;
    }
  }

  const children = (node.children ?? [])
    .map((child) => pruneLicenseDocTreeByField(child, field))
    .filter((child): child is ResolvedLicenseDocNode => child !== null);

  if (!children.length) return null;

  return { ...node, children };
}

export function openDriveLink(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
