/** Corporate-deals MoM / unmap rows share weekly_review_actions but are owned by /operations/corporate-deals. */
export function isCorporateDealsActionModule(source_module: unknown): boolean {
  return typeof source_module === "string" && source_module.startsWith("corporate_deals_");
}
