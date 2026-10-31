import { describe, it, expect, beforeEach } from "vitest";
import app from "@/index";
import { createMockD1 } from "../helpers/mock-d1";
import type { Bindings } from "@/types/env";

describe("Billing & Subscription Engine Integration Tests", () => {
  let mockEnv: Bindings;
  let adminCookie: string;

  beforeEach(async () => {
    mockEnv = {
      DB: createMockD1(),
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars-long!",
      BETTER_AUTH_URL: "http://localhost:8787",
      ENVIRONMENT: "test",
      RATE_LIMIT_ENABLED: "false",
    };

    const setupRes = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Billing Admin",
          email: "billingadmin@edgekit.dev",
          password: "SuperAdminPass123!",
        }),
      },
      mockEnv
    );
    adminCookie = setupRes.headers.get("set-cookie") || "";
  });

  it("admin can create billing plans and consumers can list public plans", async () => {
    // 1. Admin creates Pro Plan
    const createRes = await app.request(
      "/api/billing/admin/plans",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Pro Plan",
          slug: "pro",
          description: "Plano para times e profissionais",
          priceMonthly: 2900,
          priceYearly: 29000,
          currency: "usd",
          features: ["analytics:advanced", "audit_retention_30d", "unlimited_members"],
          limits: { seats: 10 },
          isPublic: true,
        }),
      },
      mockEnv
    );

    expect(createRes.status).toBe(200);

    // 2. Consumer queries public plans
    const publicRes = await app.request("/api/billing/plans", { method: "GET" }, mockEnv);
    expect(publicRes.status).toBe(200);
    const plansData = (await publicRes.json()) as any;
    expect(plansData.plans).toHaveLength(1);
    expect(plansData.plans[0].slug).toBe("pro");
    expect(plansData.plans[0].features).toContain("analytics:advanced");
  });

  it("authenticated user can create checkout session and receive active subscription", async () => {
    // 1. Create plan first
    await app.request(
      "/api/billing/admin/plans",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Starter Plan",
          slug: "starter",
          priceMonthly: 1900,
          features: ["basic_features"],
        }),
      },
      mockEnv
    );

    // 2. User initiates checkout
    const checkoutRes = await app.request(
      "/api/billing/checkout",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          planId: "plan_starter",
          billingCycle: "monthly",
          successUrl: "http://localhost:3000/dashboard?checkout=success",
        }),
      },
      mockEnv
    );

    expect(checkoutRes.status).toBe(200);
    const checkoutData = (await checkoutRes.json()) as any;
    expect(checkoutData.url).toBeDefined();

    // 3. User checks active subscription
    const subRes = await app.request(
      "/api/billing/subscription",
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );

    expect(subRes.status).toBe(200);
    const subData = (await subRes.json()) as any;
    expect(subData.status).toBe("active");
    expect(subData.plan.slug).toBe("starter");
  });
});
