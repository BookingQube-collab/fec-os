/** True when LiveKit/Telnyx SIP fails because the line is still clearing or capacity is tight. */
export function isTransientPstnBusy(message: string): boolean {
  return /486|busy|503|service unavailable|failed_precondition|temporarily unavailable/i.test(
    message,
  );
}
