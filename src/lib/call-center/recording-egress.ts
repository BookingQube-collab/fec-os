import "server-only";

import { getCallProvider } from "@/lib/chat/call-provider";

import { findCallByLivekitRoom, getCall, loadSettingsRow, updateCall } from "./db";
import { ensureLiveKitRoom, resolveLiveKitServerCredentials } from "./livekit-sip";
import {
  egressStatusComplete,
  egressStatusFailed,
  extractEgressRecordingLocation,
  resolveEgressS3FromEnv,
  type EgressInfoLike,
} from "./recording-egress-shared";
import {
  buildCallRecordingPublicUrl,
  hasFinishedRecordingEgress,
  isGuessedLiveKitRecordingUrl,
  isUsableRecordingUrl,
  preferPlayableRecordingUrl,
} from "./recording-url";
import type { CallCenterCall } from "./types";

export type RecordingEgressResult = {
  call: CallCenterCall;
  egressStarted: boolean;
  note: string;
};

export {
  extractEgressRecordingLocation,
  resolveEgressS3FromEnv,
  type EgressInfoLike,
} from "./recording-egress-shared";

function callMeta(call: CallCenterCall): Record<string, unknown> {
  return { ...((call.metadata as Record<string, unknown> | null) ?? {}) };
}

/**
 * True when egress already finished, or an in-flight egress is tied to the current room.
 * Inbound Telnyx PSTN bridge can delete the LiveKit room on failure while leaving
 * `recordingEnabled` + a predicted URL — those calls must be allowed to restart egress.
 */
export function hasActiveOrFinishedRecordingEgress(call: CallCenterCall): boolean {
  const meta = callMeta(call);
  if (hasFinishedRecordingEgress(meta)) return true;
  if (meta.egressStarted !== true) return false;
  const room = call.livekitRoom?.trim() ?? "";
  if (!room) return false;
  const egressRoom = typeof meta.egressRoom === "string" ? meta.egressRoom.trim() : "";
  // Legacy rows (no egressRoom) that still have a live room: treat as active to avoid
  // double-start mid-call. Bridge-failure clears livekitRoom, so re-answer retries.
  if (!egressRoom) return true;
  return egressRoom === room;
}

/**
 * Start LiveKit egress when "Record all calls" is on (default) and this CDR does not
 * already have an active/finished egress for the current room. Safe to fire-and-forget
 * from Answer / outbound / post-PSTN-bridge so media join is not blocked.
 */
export async function maybeAutoStartCallRecording(call: CallCenterCall): Promise<CallCenterCall> {
  const settings = await loadSettingsRow().catch(() => null);
  // Default ON when the setting row/column is missing (compliance-friendly).
  if (settings?.record_all_calls === false) return call;
  if (hasActiveOrFinishedRecordingEgress(call)) return call;
  try {
    const result = await startCallRecordingEgress(call);
    return result.call;
  } catch {
    return call;
  }
}

/**
 * Best-effort LiveKit room composite egress (audio-only for PSTN/IVR softphone rooms).
 *
 * - Requires LiveKit project egress + either Cloud default storage or S3 env credentials.
 * - Sets `recording_url` only when a storage base URL is configured (predicted path) or
 *   when an immediate file location is already present on the start response.
 * - Otherwise leaves URL empty / placeholder until `egress_ended` webhook (or refresh) lands.
 */
export async function startCallRecordingEgress(call: CallCenterCall): Promise<RecordingEgressResult> {
  const provider = await getCallProvider();
  const settings = await loadSettingsRow().catch(() => null);
  const storageBase = settings?.recording_storage_base_url?.trim() ?? "";
  const s3 = resolveEgressS3FromEnv();

  let recordingUrl = preferPlayableRecordingUrl({
    callId: call.id,
    storageBaseUrl: storageBase,
    existingUrl: call.recordingUrl,
  });
  if (!isUsableRecordingUrl(recordingUrl)) {
    recordingUrl = storageBase ? buildCallRecordingPublicUrl(storageBase, call.id) : "";
  }

  let egressStarted = false;
  let egressId = "";
  let note = s3
    ? "Recording flagged — LiveKit egress will upload to the configured S3/R2 bucket."
    : storageBase
      ? "Recording flagged — ensure LiveKit Cloud egress storage matches Recording storage base URL."
      : "Recording flagged — waiting for LiveKit egress file location (configure S3 env or Cloud egress storage + webhook).";

  if (provider.name === "livekit" && call.livekitRoom) {
    try {
      const credentials = await resolveLiveKitServerCredentials();
      if (credentials) {
        await ensureLiveKitRoom(call.livekitRoom);
        const { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } = await import(
          "livekit-server-sdk"
        );
        const host = credentials.serverUrl
          .replace(/^wss:\/\//, "https://")
          .replace(/^ws:\/\//, "http://");
        const egress = new EgressClient(host, credentials.apiKey, credentials.apiSecret);
        const filepath = `call-center/${call.id}.mp4`;
        const file = new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath,
          ...(s3
            ? {
                output: {
                  case: "s3" as const,
                  value: new S3Upload({
                    accessKey: s3.accessKey,
                    secret: s3.secret,
                    bucket: s3.bucket,
                    region: s3.region,
                    endpoint: s3.endpoint,
                    forcePathStyle: s3.forcePathStyle,
                  }),
                },
              }
            : {}),
        });
        const info = await egress.startRoomCompositeEgress(
          call.livekitRoom,
          { file },
          { audioOnly: true },
        );
        egressStarted = true;
        egressId = typeof info.egressId === "string" ? info.egressId : "";
        const immediate = extractEgressRecordingLocation(info as EgressInfoLike);
        recordingUrl = preferPlayableRecordingUrl({
          callId: call.id,
          storageBaseUrl: storageBase,
          location: immediate,
          existingUrl: recordingUrl,
        });
        if (isUsableRecordingUrl(recordingUrl)) {
          note = storageBase
            ? s3
              ? "LiveKit room egress started; recording_url uses your storage base URL (S3 upload)."
              : "LiveKit room egress started; recording_url uses your storage base URL."
            : "LiveKit room egress started; media URL available.";
        } else {
          recordingUrl = "";
          note =
            "LiveKit room egress started; waiting for egress_ended webhook (or Generate transcript refresh) for the media URL.";
        }
      } else {
        note = "LiveKit credentials missing — recording flagged without egress.";
      }
    } catch (e) {
      note =
        e instanceof Error
          ? `Egress failed (${e.message}) — recording flagged; configure LiveKit Cloud egress storage or LIVEKIT_EGRESS_S3_* env.`
          : "Egress failed — recording flagged; URL may stay pending.";
    }
  } else if (!call.livekitRoom) {
    note = "No LiveKit room on this call — recording flagged without media capture.";
  } else {
    note = "LiveKit provider not ready — recording flagged without egress.";
  }

  // Keep a non-playable stub only when we have nothing else, so CDR still shows "recording".
  if (!recordingUrl) {
    recordingUrl = buildCallRecordingPublicUrl(storageBase, call.id);
  }

  const updated = await updateCall(call.id, {
    recordingEnabled: true,
    recordingUrl,
    metadata: {
      ...callMeta(call),
      recordingRequested: true,
      recordingNote: note,
      egressRequestedAt: new Date().toISOString(),
      egressStarted,
      egressId: egressId || undefined,
      egressRoom: call.livekitRoom || undefined,
      // Clear stale finished markers when restarting after a failed inbound bridge.
      egressFinishedAt: egressStarted ? null : undefined,
      egressFileLocation: egressStarted ? null : undefined,
      recordingStorageBaseUrl: storageBase || undefined,
      egressS3Configured: Boolean(s3),
    },
  });

  return { call: updated, egressStarted, note };
}

async function findCallForEgress(egress: EgressInfoLike): Promise<CallCenterCall | null> {
  const room = egress.roomName?.trim() ?? "";
  if (room) {
    const byRoom = await findCallByLivekitRoom(room).catch(() => null);
    if (byRoom) return byRoom;
  }
  return null;
}

/**
 * Apply a LiveKit egress_* webhook (or listEgress row) onto the matching CDR.
 */
export async function applyLiveKitEgressInfo(egress: EgressInfoLike): Promise<{
  handled: boolean;
  note: string;
  callId?: string;
}> {
  const call = await findCallForEgress(egress);
  if (!call) return { handled: false, note: "no CDR for egress room" };

  const meta = { ...((call.metadata as Record<string, unknown> | null) ?? {}) };
  const location = extractEgressRecordingLocation(egress);
  const failed = egressStatusFailed(egress.status);
  const complete = egressStatusComplete(egress.status) || Boolean(location);

  if (failed) {
    const updated = await updateCall(call.id, {
      recordingEnabled: true,
      metadata: {
        ...meta,
        egressId: egress.egressId || meta.egressId,
        egressStarted: true,
        egressStatus: egress.status ?? "failed",
        egressError: egress.error || "egress failed",
        recordingNote: egress.error
          ? `Egress failed: ${egress.error}`
          : "Egress failed — no recording file was produced.",
        egressFinishedAt: new Date().toISOString(),
      },
    });
    return { handled: true, note: `egress_failed:${updated.id}`, callId: updated.id };
  }

  if (!location && !complete) {
    const updated = await updateCall(call.id, {
      metadata: {
        ...meta,
        egressId: egress.egressId || meta.egressId,
        egressStarted: true,
        egressStatus: egress.status ?? "active",
        recordingNote: "LiveKit egress in progress — waiting for file location.",
      },
    });
    return { handled: true, note: `egress_progress:${updated.id}`, callId: updated.id };
  }

  const settings = await loadSettingsRow().catch(() => null);
  const storageBase = settings?.recording_storage_base_url?.trim() ?? "";
  if (location?.startsWith("s3://")) {
    meta.egressS3Location = location;
  }
  const recordingUrl = preferPlayableRecordingUrl({
    callId: call.id,
    storageBaseUrl: storageBase,
    location,
    existingUrl: call.recordingUrl,
  });

  const playable = isUsableRecordingUrl(recordingUrl) && !isGuessedLiveKitRecordingUrl(recordingUrl);
  const updated = await updateCall(call.id, {
    recordingEnabled: true,
    recordingUrl: playable ? recordingUrl : call.recordingUrl || recordingUrl,
    metadata: {
      ...meta,
      egressId: egress.egressId || meta.egressId,
      egressStarted: true,
      egressStatus: egress.status ?? "complete",
      egressFileLocation: location || undefined,
      recordingNote: playable
        ? "Recording ready (LiveKit egress complete)."
        : "Egress finished but no HTTPS media URL — set Recording storage base URL or S3 public CDN.",
      egressFinishedAt: new Date().toISOString(),
    },
  });
  return {
    handled: true,
    note: playable ? `egress_complete:${updated.id}` : `egress_complete_no_https:${updated.id}`,
    callId: updated.id,
  };
}

/**
 * Best-effort: list LiveKit egress for this call's room and apply any completed file URL.
 * Used before transcript generation and on room_finished.
 */
export async function refreshCallRecordingFromEgress(call: CallCenterCall): Promise<CallCenterCall> {
  // Repair CDRs that stored a private R2/S3 API URL after Settings gained a public base.
  const settings = await loadSettingsRow().catch(() => null);
  const storageBase = settings?.recording_storage_base_url?.trim() ?? "";
  if (storageBase) {
    const rewritten = preferPlayableRecordingUrl({
      callId: call.id,
      storageBaseUrl: storageBase,
      existingUrl: call.recordingUrl,
    });
    if (
      rewritten !== call.recordingUrl.trim() &&
      isUsableRecordingUrl(rewritten) &&
      !isGuessedLiveKitRecordingUrl(rewritten)
    ) {
      const prior = callMeta(call);
      call = await updateCall(call.id, {
        recordingEnabled: true,
        recordingUrl: rewritten,
        metadata: {
          ...prior,
          recordingNote: "Recording URL rewritten to public storage base (was private object-store API).",
          recordingUrlRewrittenAt: new Date().toISOString(),
          // Private API locations only appear after LiveKit uploaded the object.
          egressFinishedAt:
            typeof prior.egressFinishedAt === "string" && prior.egressFinishedAt
              ? prior.egressFinishedAt
              : new Date().toISOString(),
        },
      });
    }
  }

  // Predicted public URLs look "usable" at egress start — still listEgress until finished,
  // otherwise inbound hangup can miss egress_ended and leave a 404 in the Calls player.
  if (
    isUsableRecordingUrl(call.recordingUrl) &&
    !isGuessedLiveKitRecordingUrl(call.recordingUrl) &&
    hasFinishedRecordingEgress(callMeta(call))
  ) {
    return call;
  }
  if (!call.livekitRoom) return call;
  const credentials = await resolveLiveKitServerCredentials();
  if (!credentials) return call;
  try {
    const { EgressClient } = await import("livekit-server-sdk");
    const host = credentials.serverUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
    const egress = new EgressClient(host, credentials.apiKey, credentials.apiSecret);
    const meta = (call.metadata as Record<string, unknown> | null) ?? {};
    const egressId = typeof meta.egressId === "string" ? meta.egressId.trim() : "";
    const listed = egressId
      ? await egress.listEgress({ egressId })
      : await egress.listEgress({ roomName: call.livekitRoom });
    let latest: CallCenterCall = call;
    for (const info of listed) {
      const result = await applyLiveKitEgressInfo(info as EgressInfoLike);
      if (result.callId) {
        latest = (await getCall(result.callId)) ?? latest;
      }
    }
    return latest;
  } catch {
    return call;
  }
}
