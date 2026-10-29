import { describe, it, expect, vi } from "vitest";
import {
  sendEmail,
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendOrganizationInviteEmail,
} from "@/lib/email";
import type { Bindings } from "@/types/env";

describe("Email Module", () => {
  it("should send email via Resend when RESEND_API_KEY is configured", async () => {
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "resend_123" }), { status: 200 });
    });

    try {
      const env: Bindings = {
        DB: {} as any,
        RESEND_API_KEY: "re_test_key_123",
        FROM_EMAIL: "auth@edgekit.dev",
      };

      const success = await sendEmail({
        to: "user@example.com",
        subject: "Teste de E-mail",
        html: "<p>Olá Mundo</p>",
        env,
      });

      expect(success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(capturedBody.from).toBe("auth@edgekit.dev");
      expect(capturedBody.to).toBe("user@example.com");
      expect(capturedBody.subject).toBe("Teste de E-mail");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should output to console in development mode when RESEND_API_KEY is absent", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const env: Bindings = {
        DB: {} as any,
      };

      const success = await sendMagicLinkEmail({
        email: "dev@local.test",
        url: "http://localhost:8787/api/auth/magic-link?token=abc",
        env,
      });

      expect(success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("should render and format password reset email", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const env: Bindings = { DB: {} as any };
      const success = await sendPasswordResetEmail({
        email: "user@example.com",
        url: "http://localhost:8787/reset-password?token=xyz",
        env,
      });

      expect(success).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("should render and format organization invitation email", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const env: Bindings = { DB: {} as any };
      const success = await sendOrganizationInviteEmail({
        email: "novo.membro@empresa.com",
        organizationName: "Acme Corp",
        inviterEmail: "founder@acme.com",
        role: "admin",
        inviteUrl: "http://localhost:8787/accept-invitation?id=inv_123",
        env,
      });

      expect(success).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
