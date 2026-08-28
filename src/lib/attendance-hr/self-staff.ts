/** Staff GPS / face check-in may only run as the linked employee, never on behalf of someone else. */
export function resolveSelfStaffId(args: {
  linkedStaffId: string | null | undefined;
  requestedStaffId?: string | null;
}): string {
  const linked = args.linkedStaffId?.trim() || null;
  if (!linked) {
    throw new Error("Your login is not linked to a staff record, so GPS check-in is not available.");
  }
  const requested = args.requestedStaffId?.trim() || null;
  if (requested && requested !== linked) {
    throw new Error("You can only check in as yourself.");
  }
  return linked;
}
