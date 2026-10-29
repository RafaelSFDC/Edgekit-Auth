import { describe, it, expect } from "vitest";
import { generateId } from "@/lib/id";

describe("generateId", () => {
  it("should generate IDs with correct prefixes", () => {
    const userId = generateId("user");
    const sessId = generateId("sess");
    const idnId = generateId("idn");
    const orgId = generateId("org");

    expect(userId.startsWith("user_")).toBe(true);
    expect(sessId.startsWith("sess_")).toBe(true);
    expect(idnId.startsWith("idn_")).toBe(true);
    expect(orgId.startsWith("org_")).toBe(true);
  });

  it("should generate unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId("user"));
    }
    expect(ids.size).toBe(100);
  });
});
