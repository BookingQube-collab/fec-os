import type { E3ComplianceItemRow } from "@/lib/compliance-tracker/constants";

/** DB lookup criteria for a license document leaf node. */
export type LicenseDocMatch = {
  location: string;
  area?: string;
  category?: string;
  item?: string;
  itemContains?: string;
  vendorContains?: string;
};

export type LicenseDocNode = {
  id: string;
  label: string;
  labelAr?: string;
  children?: LicenseDocNode[];
  /** Leaf match against e3_compliance_items. */
  match?: LicenseDocMatch;
  /** Reuse documents from another node id (e.g. "same as above"). */
  sameAs?: string;
};

export type ResolvedLicenseDocNode = {
  id: string;
  label: string;
  labelAr?: string;
  type: "folder" | "document";
  driveLink: string | null;
  matchItemId: string | null;
  computedStatus: string | null;
  sameAsRef: string | null;
  children?: ResolvedLicenseDocNode[];
};

export type LicenseDocumentsResult = {
  tree: ResolvedLicenseDocNode[];
  stats: {
    totalDocuments: number;
    linkedDocuments: number;
    missingDocuments: number;
  };
  updatedAt: string;
};

export type LicenseDocResolverContext = {
  rows: E3ComplianceItemRow[];
  nodeById: Map<string, LicenseDocNode>;
  resolvedCache: Map<string, ResolvedLicenseDocNode>;
};
