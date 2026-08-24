"use client";

import { E3_KITCHEN_CATEGORIES } from "@/lib/compliance-tracker/constants";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerKitchenCompliancePage() {
  return (
    <CategoryTrackerPage
      titleKey="e3Tracker.pages.kitchen.title"
      subtitleKey="e3Tracker.pages.kitchen.subtitle"
      categories={E3_KITCHEN_CATEGORIES}
    />
  );
}
