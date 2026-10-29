import { describe, it, expect, vi } from "vitest";
import { signWebhookPayload, dispatchWebhook } from "@/lib/webhooks";
import type { Bindings } from "@/types/env";

describe("Webhooks Module", () => {
  const secret = "whsec_super_secret_test_key_123456";
  const payload = JSON.stringify({ event: "user.created", data: { id: "u_1", email: "test@example.com" } });

  it("should calculate correct HMAC-SHA256 signature", async () => {
    const signature = await signWebhookPayload(secret, payload);
    expect(signature).toBeDefined();
    expect(typeof signature).toBe("string");
    expect(signature.length).toBe(64); // 256 bits = 32 bytes = 64 hex characters

    // Deterministic output
    const signature2 = await signWebhookPayload(secret, payload);
    expect(signature).toBe(signature2);

    // Different secret or payload yields different signature
    const signature3 = await signWebhookPayload("different_secret", payload);
    expect(signature).not.toBe(signature3);
  });

  it("should dispatch webhook request with X-Edgekit-Signature header", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = url.toString();
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    });

    try {
      const mockEnv: Bindings = {
        DB: {} as any,
        WEBHOOK_URL: "https://api.empresa.com/webhooks/auth",
        WEBHOOK_SECRET: secret,
      };

      await dispatchWebhook(mockEnv, {
        event: "user.created",
        data: { id: "user_test", email: "dev@empresa.com" },
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(capturedUrl).toBe("https://api.empresa.com/webhooks/auth");
      expect(capturedHeaders["Content-Type"]).toBe("application/json");
      expect(capturedHeaders["X-Edgekit-Signature"]).toBeDefined();
      expect(capturedHeaders["X-Edgekit-Signature"].length).toBe(64);

      const parsed = JSON.parse(capturedBody);
      expect(parsed.event).toBe("user.created");
      expect(parsed.data.email).toBe("dev@empresa.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should skip dispatch if WEBHOOK_URL is not set", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    try {
      const mockEnv: Bindings = {
        DB: {} as any,
      };

      await dispatchWebhook(mockEnv, {
        event: "user.created",
        data: { id: "user_test" },
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
