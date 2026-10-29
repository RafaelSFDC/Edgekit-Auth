import { describe, it, expect } from "vitest";
import { sha256, generateRandomString } from "@/lib/crypto";

describe("Crypto Utils", () => {
  it("should generate sha256 hex string", async () => {
    const hash = await sha256("hello-world");
    expect(hash).toBe(
      "afa27b44d43b02a9fea41d13cedc2e4016cfcf87c5dbf990e593669aa8ce286d"
    );
  });

  it("should generate random strings of requested length", () => {
    const str32 = generateRandomString(16); // 16 bytes = 32 hex chars
    const str64 = generateRandomString(32); // 32 bytes = 64 hex chars

    expect(str32.length).toBe(32);
    expect(str64.length).toBe(64);
    expect(str32).not.toBe(str64);
  });
});
