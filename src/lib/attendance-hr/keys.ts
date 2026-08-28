export function mappingKey(input: {
  companyId: string;
  locationId: string;
  deviceId: string;
  biometricUserId: string;
}): string {
  return [input.companyId, input.locationId, input.deviceId, input.biometricUserId.trim()].join(":");
}

export function subjectKey(staffId: string | null | undefined, deviceId: string, biometricUserId: string): string {
  if (staffId) return `staff:${staffId}`;
  return `bio:${deviceId}:${biometricUserId.trim()}`;
}
