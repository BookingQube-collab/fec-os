"use client";

import { E3_KITCHEN_CATEGORIES } from "@/lib/compliance-tracker/constants";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerKitchenCompliancePage() {
  return (
    <CategoryTrackerPage
      title="Kitchen Compliance"
      subtitle="Kitchen hood cleaning, kitchen maintenance, and waste management."
      categories={E3_KITCHEN_CATEGORIES}
    />
  );
}
