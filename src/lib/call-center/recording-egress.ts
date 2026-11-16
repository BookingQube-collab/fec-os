import "server-only";

import { getCallProvider } from "@/lib/chat/call-provider";

import { loadSettingsRow, updateCall } from "./db";
import { resolveLiveKitServerCredentials } from "./livekit-sip";
import type { CallCenterCall } from "./types";

export type RecordingEgressResult = {
  call: CallCenterCall;
  egressStarted: boolean;
  note: string;
};

/**
 * Start LiveKit egress when "Record all calls" is on (default) and this CDR is not
 * already flagged. Safe to fire-and-forget from Answer / outbound so media join is not blocked.
 */
export async function maybeAutoStartCallRecording(call: CallCenterCall): Promise<CallCenterCall> {
  if (call.recordingEnabled) return call;
  const settings = await loadSettingsRow().catch(() => null);
  // Default ON when the setting row/column is missing (compliance-friendly).
  if (settings?.record_all_calls === false) return call;
  try {
    const result = await startCallRecordingEgress(call);
    return result.call;
  } catch {
    return call;
  }
}

/**
 * Best-effort LiveKit room composite egress. Flags recording on the CDR even when
 * egress cannot start (credentials missing / room empty) so agents see the intent.
 */
export async function startCallRecordingEgress(call: CallCenterCall): Promise<RecordingEgressResult> {
  const provider = await getCallProvider();
  let recordingUrl =
    call.recordingUrl.trim() || `https://recordings.example/fec/cc/${call.id}.mp4`;
  let egressStarted = false;
  let note = "Recording flagged — LiveKit egress URL fills when media capture is wired.";

  if (provider.name === "livekit" && call.livekitRoom) {
    try {
      const credentials = await resolveLiveKitServerCredentials();
      if (credentials) {
        const { EgressClient, EncodedFileOutput, EncodedFileType } = await import(
          "livekit-server-sdk"
        );
        const host = credentials.serverUrl.replace(/^wss:\/\//, "https://");
        const egress = new EgressClient(host, credentials.apiKey, credentials.apiSecret);
        await egress.startRoomCompositeEgress(call.livekitRoom, {
          file: new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: `call-center/${call.id}.mp4`,
          }),
        });
        recordingUrl = `${host}/recordings/call-center/${call.id}.mp4`;
        egressStarted = true;
        note = "LiveKit room egress started.";
      } else {
        note = "LiveKit credentials missing — recording flagged without egress.";
      }
    } catch (e) {
      note =
        e instanceof Error
          ? `Egress failed (${e.message}) — recording flagged; URL may stay pending.`
          : "Egress failed — recording flagged; URL may stay pending.";
    }
  } else if (!call.livekitRoom) {
    note = "No LiveKit room on this call — recording flagged without media capture.";
  } else {
    note = "LiveKit provider not ready — recording flagged without egress.";
  }

  const updated = await updateCall(call.id, {
    recordingEnabled: true,
    recordingUrl,
    metadata: {
      ...((call.metadata as Record<string, unknown> | null) ?? {}),
      recordingRequested: true,
      recordingNote: note,
      egressRequestedAt: new Date().toISOString(),
      egressStarted,
    },
  });

  return { call: updated, egressStarted, note };
}
