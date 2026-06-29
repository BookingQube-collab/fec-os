"use client";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerPestControlPage() {
  return (
    <CategoryTrackerPage
      title="Pest Control Tracker"
      subtitle="Monthly pest control AMC across cafe, playground, and whole-area scopes."
      categories={["Pest Control"]}
    />
  );
}
