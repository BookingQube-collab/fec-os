"use client";

import { CategoryTrackerPage } from "./e3-tracker-category-page";

export default function E3TrackerFireAlarmPage() {
  return (
    <CategoryTrackerPage
      titleKey="e3Tracker.pages.fireAlarm.title"
      subtitleKey="e3Tracker.pages.fireAlarm.subtitle"
      categories={["Fire Alarm"]}
    />
  );
}
