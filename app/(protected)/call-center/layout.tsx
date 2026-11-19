/**
 * Softphone / incoming poll mounts in the protected AppShell
 * (`CallCenterShellSoftphone`) so agents ring on any route.
 * Keep maxDuration here for answer → PSTN bridge server actions.
 */
/** completePstnBridge: agent mic wait + LiveKit outbound dial (~25s ring). */
export const maxDuration = 60;

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
