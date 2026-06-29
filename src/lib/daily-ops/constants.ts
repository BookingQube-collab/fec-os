import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Baby,
  CloudLightning,
  Cog,
  Flame,
  Footprints,
  Hammer,
  HeartPulse,
  MoreHorizontal,
  ShieldAlert,
  CircleStop,
  Users,
  UtensilsCrossed,
  HardHat,
} from "lucide-react";

export const DAILY_OPS_NAV_ITEMS = [
  { href: "/daily-ops", labelKey: "dailyOps.nav.dashboard" },
  { href: "/daily-ops/roster", labelKey: "dailyOps.nav.roster" },
  { href: "/daily-ops/briefings", labelKey: "dailyOps.nav.briefings" },
  { href: "/daily-ops/incidents", labelKey: "dailyOps.nav.incidents" },
  { href: "/daily-ops/inventory", labelKey: "dailyOps.nav.inventory" },
  { href: "/daily-ops/maintenance", labelKey: "dailyOps.nav.maintenance" },
  { href: "/daily-ops/complaints", labelKey: "dailyOps.nav.complaints" },
] as const;

export const STAFF_ROLES = [
  "venue_supervisor",
  "shift_lead",
  "crew",
  "technician",
  "cashier",
  "cleaner",
  "security",
  "other",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  venue_supervisor: "Venue Supervisor",
  shift_lead: "Shift Lead",
  crew: "Crew",
  technician: "Technician",
  cashier: "Cashier",
  cleaner: "Cleaner",
  security: "Security",
  other: "Other",
};

export const SHIFT_PERIODS = ["morning", "afternoon", "evening", "full_day"] as const;
export type ShiftPeriod = (typeof SHIFT_PERIODS)[number];

export const SHIFT_PERIOD_LABELS: Record<ShiftPeriod, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  full_day: "Full Day",
};

/** Common FEC family entertainment centre incident categories */
export const INCIDENT_TYPES = [
  "guest_injury_first_aid",
  "slip_trip_fall",
  "equipment_malfunction",
  "attraction_stoppage_evacuation",
  "crowd_control_queue",
  "food_beverage",
  "child_lost_found_welfare",
  "security_theft_altercation",
  "fire_smoke_emergency_alarm",
  "weather_power_outage",
  "staff_injury",
  "property_damage",
  "near_miss",
  "other",
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  guest_injury_first_aid: "Guest injury / first aid",
  slip_trip_fall: "Slip, trip, or fall",
  equipment_malfunction: "Equipment / ride malfunction",
  attraction_stoppage_evacuation: "Attraction stoppage / evacuation",
  crowd_control_queue: "Crowd control / queue issue",
  food_beverage: "Food & beverage incident",
  child_lost_found_welfare: "Child lost / found / welfare",
  security_theft_altercation: "Security / theft / altercation",
  fire_smoke_emergency_alarm: "Fire / smoke / emergency alarm",
  weather_power_outage: "Weather / power outage",
  staff_injury: "Staff injury",
  property_damage: "Property damage",
  near_miss: "Near miss",
  other: "Other",
};

/** Labels for legacy category values stored before FEC type expansion */
export const LEGACY_INCIDENT_TYPE_LABELS: Record<string, string> = {
  guest_injury: "Guest injury / first aid",
  equipment_failure: "Equipment / ride malfunction",
  safety_near_miss: "Near miss",
  security_issue: "Security / theft / altercation",
  fire_evacuation: "Fire / smoke / emergency alarm",
};

export function incidentTypeLabel(category: string): string {
  return (
    INCIDENT_TYPE_LABELS[category as IncidentType] ??
    LEGACY_INCIDENT_TYPE_LABELS[category] ??
    category.replace(/_/g, " ")
  );
}

export const INCIDENT_TYPE_ICONS: Record<IncidentType, LucideIcon> = {
  guest_injury_first_aid: HeartPulse,
  slip_trip_fall: Footprints,
  equipment_malfunction: Cog,
  attraction_stoppage_evacuation: CircleStop,
  crowd_control_queue: Users,
  food_beverage: UtensilsCrossed,
  child_lost_found_welfare: Baby,
  security_theft_altercation: ShieldAlert,
  fire_smoke_emergency_alarm: Flame,
  weather_power_outage: CloudLightning,
  staff_injury: HardHat,
  property_damage: Hammer,
  near_miss: AlertTriangle,
  other: MoreHorizontal,
};

/** Suggested default severity when a type is selected */
export const INCIDENT_TYPE_SUGGESTED_SEVERITY: Record<IncidentType, string> = {
  guest_injury_first_aid: "medium",
  slip_trip_fall: "medium",
  equipment_malfunction: "high",
  attraction_stoppage_evacuation: "high",
  crowd_control_queue: "medium",
  food_beverage: "low",
  child_lost_found_welfare: "high",
  security_theft_altercation: "high",
  fire_smoke_emergency_alarm: "critical",
  weather_power_outage: "medium",
  staff_injury: "medium",
  property_damage: "low",
  near_miss: "low",
  other: "medium",
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  reported: "Open",
  investigating: "Under Review",
  rca_complete: "Under Review",
  closed: "Closed",
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  new: "New",
  investigating: "Investigating",
  resolved: "Resolved",
  escalated: "Escalated",
  dismissed: "Dismissed",
};

export function incidentReference(id: string): string {
  return `INC-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function attendanceTone(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 85) return "text-amber-600";
  return "text-red-600";
}

export function kpiTone(key: string, value: number): string | undefined {
  if (value === 0) return "text-emerald-600";
  if (key.includes("critical") || key.includes("urgent")) return "text-red-600";
  if (key.includes("open") || key.includes("reorder")) return "text-amber-600";
  return undefined;
}
