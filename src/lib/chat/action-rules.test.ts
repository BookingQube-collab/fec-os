import { describe, expect, it } from "vitest";

import { chatEntityPlain } from "./entity-rules";
import { chatSearchSnippet } from "./search-rules";
import { CHAT_ACTION_DETAIL_MAX, CHAT_ACTION_TITLE_MAX, chatActionPrefill } from "./action-rules";

describe("chat action prefill", () => {
  it("clips each field to the create action max and strips markup the way chat does", () => {
    const long = `${"あ".repeat(4500)}<b>end</b>`;
    const ticket = chatActionPrefill("MAINTENANCE_TICKET", long);
    expect(ticket?.kind).toBe("MAINTENANCE_TICKET");
    if (ticket?.kind !== "MAINTENANCE_TICKET") return;
    expect(Array.from(ticket.title)).toHaveLength(CHAT_ACTION_TITLE_MAX.MAINTENANCE_TICKET);
    expect(Array.from(ticket.description)).toHaveLength(CHAT_ACTION_DETAIL_MAX.MAINTENANCE_TICKET);
    expect(ticket.title).toBe(chatEntityPlain(long, CHAT_ACTION_TITLE_MAX.MAINTENANCE_TICKET));
    expect(ticket.description).toBe(chatEntityPlain(long, CHAT_ACTION_DETAIL_MAX.MAINTENANCE_TICKET));
    expect(ticket.title).not.toMatch(/[<>]/);
    expect(ticket.description).not.toMatch(/[<>]/);
    expect(ticket.title.endsWith("…")).toBe(false);

    const marked = "<div>Hello</div> a < 3 > b <script>x</script>";
    const incident = chatActionPrefill("INCIDENT", marked);
    expect(incident?.kind).toBe("INCIDENT");
    if (incident?.kind !== "INCIDENT") return;
    expect(incident.summary).toBe(chatEntityPlain(marked, CHAT_ACTION_TITLE_MAX.INCIDENT));
    expect(incident.summary).toBe(chatSearchSnippet(marked, CHAT_ACTION_TITLE_MAX.INCIDENT));
    expect(incident.summary).not.toMatch(/[<>]/);
    expect(incident.detail).toBeNull();

    const purchaseBody = "x".repeat(500);
    const purchase = chatActionPrefill("PURCHASE_REQUEST", purchaseBody);
    expect(purchase?.kind).toBe("PURCHASE_REQUEST");
    if (purchase?.kind !== "PURCHASE_REQUEST") return;
    expect(Array.from(purchase.title)).toHaveLength(CHAT_ACTION_TITLE_MAX.PURCHASE_REQUEST);
    expect(Array.from(purchase.lineName)).toHaveLength(CHAT_ACTION_TITLE_MAX.PURCHASE_REQUEST);
    expect(Array.from(purchase.justification)).toHaveLength(500);
    expect(purchase.justification).toBe(chatEntityPlain(purchaseBody, CHAT_ACTION_DETAIL_MAX.PURCHASE_REQUEST));
    expect(purchase.lineName).toBe(purchase.title);

    const overflow = "n".repeat(2500);
    const longIncident = chatActionPrefill("INCIDENT", overflow);
    expect(longIncident?.kind).toBe("INCIDENT");
    if (longIncident?.kind !== "INCIDENT") return;
    expect(Array.from(longIncident.summary)).toHaveLength(CHAT_ACTION_TITLE_MAX.INCIDENT);
    expect(longIncident.detail).toBe(chatEntityPlain(overflow, CHAT_ACTION_DETAIL_MAX.INCIDENT));
    expect(longIncident.detail && Array.from(longIncident.detail)).toHaveLength(2500);

    expect(chatActionPrefill("MAINTENANCE_TICKET", " <br/> ")).toBeNull();
    expect(chatActionPrefill("PURCHASE_REQUEST", "<p></p>")).toBeNull();

    const task = chatActionPrefill("TASK", "x".repeat(2500));
    expect(task?.kind).toBe("TASK");
    if (task?.kind === "TASK") {
      expect(Array.from(task.title)).toHaveLength(CHAT_ACTION_TITLE_MAX.TASK);
      expect(Array.from(task.description)).toHaveLength(CHAT_ACTION_DETAIL_MAX.TASK);
    }
    const handover = chatActionPrefill("HANDOVER", "bring the keys");
    expect(handover).toEqual({ kind: "HANDOVER", note: "bring the keys" });
    const reminder = chatActionPrefill("REMINDER", "<b>Call the vendor</b>");
    expect(reminder).toEqual({ kind: "REMINDER", title: "Call the vendor", body: "Call the vendor" });
  });
});
