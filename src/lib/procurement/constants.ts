export const PR_PAYMENT_STRUCTURES = ["full_advance", "milestones", "post_delivery"] as const;
export type PrPaymentStructure = (typeof PR_PAYMENT_STRUCTURES)[number];

export const PR_DOC_TYPES = ["quotation", "scope", "comparison", "clearance", "other"] as const;
export type PrDocType = (typeof PR_DOC_TYPES)[number];

export const PR_MILESTONE_STATUSES = ["pending", "cleared", "paid", "cancelled"] as const;
export type PrMilestoneStatus = (typeof PR_MILESTONE_STATUSES)[number];

export const PR_VENDOR_ENTITY_TYPES = ["company", "freelancer"] as const;
export type PrVendorEntityType = (typeof PR_VENDOR_ENTITY_TYPES)[number];

export const PR_ENGAGEMENT_TYPES = ["permanent", "one_off", "retainer", "amc", "project"] as const;
export type PrEngagementType = (typeof PR_ENGAGEMENT_TYPES)[number];

export const PR_COMPLIANCE_DEADLINE_DAYS = [7, 14, 30] as const;

export const PR_ATTACHMENT_BUCKET = "pr-attachments";
export const PR_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PR_MAX_FILES = 8;

export const PR_ATTACHMENT_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
] as const;

export const PR_PURPOSE_CATEGORIES = [
  "fnb",
  "maintenance",
  "attractions",
  "it",
  "uniforms",
  "cleaning",
  "marketing",
  "services",
  "general",
] as const;
