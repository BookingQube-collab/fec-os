/** Raised when a PSTN / SIP step needs credentials that are not configured yet. */
export class CarrierNotConfiguredError extends Error {
  readonly code = "CARRIER_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "CarrierNotConfiguredError";
  }
}

/** Telnyx REST call failed (non-2xx). `status` is the HTTP status. */
export class TelnyxApiError extends Error {
  readonly code = "TELNYX_API_ERROR" as const;

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TelnyxApiError";
  }
}
