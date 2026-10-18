/**
 * Org-assigned venues a Venue / Site Supervisor (or F&B Manager) may open on
 * attendance chips, monthly roster, team overview, and related pickers.
 *
 * Prefer `staff.location_id` + `staff_work_locations` in the database. This table
 * is the maintainable fallback / seed source when dedicated work sites are empty
 * in production. Do not expand Venue Supervisor chips from descendant punches.
 *
 * Keys are stable roster employee codes (and historical QID codes). Lookups also
 * accept a normalized full name for prod rows whose codes drifted.
 */

export type SupervisorManagedVenuePerson = {
  /** Canonical employee_code values that identify this person. */
  employeeCodes: readonly string[];
  /** Lowercase full-name needles (substring match after normalize). */
  nameNeedles: readonly string[];
  /** Active location codes this person may open (home may be included). */
  locationCodes: readonly string[];
};

/** Venue / Site Supervisors with fixed multi-site estates. */
export const SUPERVISOR_MANAGED_VENUES: readonly SupervisorManagedVenuePerson[] = [
  {
    // Ashfaq — Inflata + KDS City Center + Aspire Carousel
    employeeCodes: ["KDS-CC-VS", "29735603636"],
    nameNeedles: ["ashfaq noori"],
    locationCodes: ["INF-CC", "KDS-CC", "CAR-AP"],
  },
  {
    // Romel — Dar Al Salam Mall C&B only
    employeeCodes: ["CB-DSM-VS", "28360804725"],
    nameNeedles: ["romel chavez pusung", "romel chavez"],
    locationCodes: ["CB-DSM"],
  },
  {
    // Rosebelt — Vendome C&B only
    employeeCodes: ["CB-VM-BM2", "CB-VM-VS", "29660806855", "29660800835"],
    nameNeedles: ["rosebelt fatal"],
    locationCodes: ["CB-VM"],
  },
  {
    // Waqar — Doha Mall venues + Inflata (prior Inflata coverage)
    employeeCodes: ["UA-DM-VS", "29658611062"],
    nameNeedles: ["waqar asghar"],
    locationCodes: ["KDS-DM", "UA-DM", "INF-CC"],
  },
] as const;

/** F&B Manager (Ruben) — F&B team staff scope stays on the reporting tree. */
export const FNB_MANAGER_VENUE_CODES = ["INF-CC", "KDS-CC", "UA-DM"] as const;

export const FNB_MANAGER_PERSON: SupervisorManagedVenuePerson = {
  employeeCodes: ["FB-1"],
  nameNeedles: ["ruben yaralyan"],
  locationCodes: FNB_MANAGER_VENUE_CODES,
};

function normalizePersonKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Location codes for a known Venue Supervisor / F&B Manager when identity matches.
 * Null when this person is not in the maintainable map (use home + work_locations only).
 */
export function managedVenueCodesForPerson(input: {
  employeeCode?: string | null;
  fullName?: string | null;
}): string[] | null {
  const code = (input.employeeCode ?? "").trim().toUpperCase();
  const name = normalizePersonKey(input.fullName);
  const people = [...SUPERVISOR_MANAGED_VENUES, FNB_MANAGER_PERSON];
  for (const person of people) {
    if (code && person.employeeCodes.some((c) => c.toUpperCase() === code)) {
      return [...person.locationCodes];
    }
    if (name && person.nameNeedles.some((needle) => name.includes(needle) || needle.includes(name))) {
      return [...person.locationCodes];
    }
  }
  return null;
}

/** Union home, dedicated work sites, and any mapped estate codes resolved to ids. */
export function unionViewerManagedLocationIds(input: {
  homeLocationId?: string | null;
  workLocationIds?: readonly (string | null | undefined)[];
  /** Location ids for codes from {@link managedVenueCodesForPerson}. */
  mappedLocationIds?: readonly (string | null | undefined)[];
}): string[] {
  const ids = new Set<string>();
  if (input.homeLocationId) ids.add(input.homeLocationId);
  for (const id of input.workLocationIds ?? []) {
    if (id) ids.add(id);
  }
  for (const id of input.mappedLocationIds ?? []) {
    if (id) ids.add(id);
  }
  return [...ids].sort();
}
