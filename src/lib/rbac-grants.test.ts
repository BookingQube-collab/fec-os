import { describe, expect, it } from "vitest";

import { canUserDo, codeDefaultAllowed } from "@/lib/rbac";
import { grantKey, setActiveCapabilityGrants, toGrantMap } from "@/lib/rbac-grants";

describe("capability grant overrides", () => {
  it("defaults to CAPABILITIES when no override map", () => {
    setActiveCapabilityGrants(null);
    expect(canUserDo(["technician"], "admin.view")).toBe(false);
    expect(canUserDo(["ceo"], "admin.view")).toBe(true);
    expect(codeDefaultAllowed("technician", "admin.view")).toBe(false);
  });

  it("honors allow override for a role that code denies", () => {
    const grants = toGrantMap([
      { role: "technician", capability: "admin.view", allowed: true },
    ]);
    expect(canUserDo(["technician"], "admin.view", grants)).toBe(true);
    expect(canUserDo(["technician"], "admin.view")).toBe(false); // active cache still null
  });

  it("honors deny override for a role that code allows", () => {
    const grants = toGrantMap([
      { role: "coo", capability: "admin.view", allowed: false },
    ]);
    expect(canUserDo(["coo"], "admin.view", grants)).toBe(false);
    expect(codeDefaultAllowed("coo", "admin.view")).toBe(true);
  });

  it("installs active cache used by canUserDo without explicit map", () => {
    setActiveCapabilityGrants(
      toGrantMap([{ role: "hr", capability: "revenue.view", allowed: true }]),
    );
    expect(canUserDo(["hr"], "revenue.view")).toBe(true);
    setActiveCapabilityGrants(null);
    expect(canUserDo(["hr"], "revenue.view")).toBe(false);
  });

  it("builds stable grant keys", () => {
    expect(grantKey("ceo", "admin.manage_roles")).toBe("ceo\0admin.manage_roles");
  });
});
