"use client";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerPestControlPage() {
  return (
    <CategoryTrackerPage
      titleKey="e3Tracker.pages.pestControl.title"
      subtitleKey="e3Tracker.pages.pestControl.subtitle"
      categories={["Pest Control"]}
    />
  );
}
