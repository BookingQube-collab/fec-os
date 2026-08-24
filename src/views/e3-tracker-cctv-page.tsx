"use client";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerCctvPage() {
  return (
    <CategoryTrackerPage
      titleKey="e3Tracker.pages.cctv.title"
      subtitleKey="e3Tracker.pages.cctv.subtitle"
      categories={["CCTV"]}
    />
  );
}
