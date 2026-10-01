/** Operational sites are `locations.status = 'active'`. Inactive is stored as `closed`. */
export const OPERATIONAL_LOCATION_STATUS = "active" as const;
export const INACTIVE_LOCATION_STATUS = "closed" as const;

export function isOperationalLocationStatus(status: string | null | undefined): boolean {
  return status === OPERATIONAL_LOCATION_STATUS;
}

/** Active switch on → active. Off → closed, which operational pickers already exclude. */
export function locationStatusForActiveFlag(active: boolean): "active" | "closed" {
  return active ? OPERATIONAL_LOCATION_STATUS : INACTIVE_LOCATION_STATUS;
}
