"use client";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerThirdPartyCertificationPage() {
  return (
    <CategoryTrackerPage
      titleKey="e3Tracker.pages.thirdParty.title"
      subtitleKey="e3Tracker.pages.thirdParty.subtitle"
      categories={["Third Party Certification"]}
    />
  );
}
