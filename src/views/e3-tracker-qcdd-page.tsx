"use client";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerQcddPage() {
  return (
    <CategoryTrackerPage
      titleKey="e3Tracker.pages.qcdd.title"
      subtitleKey="e3Tracker.pages.qcdd.subtitle"
      categories={["QCDD"]}
    />
  );
}
