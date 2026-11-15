import { describe, expect, it } from "vitest";

import {
  buildE3AiSystemPrompt,
  E3_CENTER_GREETING_EN,
  E3_LANG_GREETING_EN,
  E3_SERVICE_GREETING_EN,
} from "./e3-ivr-prompt";
import { buildFecVenuesTemplate, simulateDigitPath } from "./ivr-flow";
import { CALL_CENTER_VENUE_QUEUE_IDS } from "./types";

describe("E3 IVR spoken prompts", () => {
  it("covers language, center, and service scripts", () => {
    expect(E3_LANG_GREETING_EN).toMatch(/press 1/i);
    expect(E3_LANG_GREETING_EN).toMatch(/اضغط 2/);
    expect(E3_CENTER_GREETING_EN).toMatch(/Inflata Park/i);
    expect(E3_CENTER_GREETING_EN).toMatch(/Kids Driving School/i);
    expect(E3_CENTER_GREETING_EN).toMatch(/Urban Arena/i);
    expect(E3_CENTER_GREETING_EN).toMatch(/press 0/i);
    expect(E3_SERVICE_GREETING_EN).toMatch(/birthday/i);
    expect(E3_SERVICE_GREETING_EN).toMatch(/press 0/i);
  });

  it("builds a center-aware AI system prompt", () => {
    const prompt = buildE3AiSystemPrompt("inflatapark");
    expect(prompt).toMatch(/E3/);
    expect(prompt).toMatch(/Inflata Park/);
    expect(prompt).toMatch(/Never invent/);
    expect(prompt).toMatch(/human agent/i);
  });
});

describe("buildFecVenuesTemplate E3 path", () => {
  const flow = buildFecVenuesTemplate();

  it("routes English Inflata bookings to AI", () => {
    const sim = simulateDigitPath(flow, ["1", "1", "1"]);
    expect(sim.status).toBe("ok");
    expect(sim.aiAnswered).toBe(true);
    expect(sim.language).toBe("en");
    expect(sim.queueId).toBe(CALL_CENTER_VENUE_QUEUE_IDS.inflatapark);
  });

  it("routes English Inflata birthday to Birthday enquiry queue", () => {
    const sim = simulateDigitPath(flow, ["1", "1", "2"]);
    expect(sim.status).toBe("ok");
    expect(sim.aiAnswered).toBe(false);
    expect(sim.queueId).toBe(CALL_CENTER_VENUE_QUEUE_IDS.birthday);
  });

  it("routes English Inflata human (0) to Inflata queue", () => {
    const sim = simulateDigitPath(flow, ["1", "1", "0"]);
    expect(sim.status).toBe("ok");
    expect(sim.queueId).toBe(CALL_CENTER_VENUE_QUEUE_IDS.inflatapark);
  });

  it("routes English KDS and Urban Arena correctly", () => {
    expect(simulateDigitPath(flow, ["1", "2", "0"]).queueId).toBe(
      CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving,
    );
    expect(simulateDigitPath(flow, ["1", "3", "0"]).queueId).toBe(
      CALL_CENTER_VENUE_QUEUE_IDS.urbanArena,
    );
  });

  it("routes English general support (center 0)", () => {
    const sim = simulateDigitPath(flow, ["1", "0", "0"]);
    expect(sim.status).toBe("ok");
    expect(sim.queueId).toBe(CALL_CENTER_VENUE_QUEUE_IDS.general);
  });

  it("routes Arabic Inflata bookings to AI", () => {
    const sim = simulateDigitPath(flow, ["2", "1", "1"]);
    expect(sim.status).toBe("ok");
    expect(sim.aiAnswered).toBe(true);
    expect(sim.language).toBe("ar");
  });
});
