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

  it("should reject webhook request if STRIPE_WEBHOOK_SECRET is set and signature is invalid", async () => {
    const envWithSecret = {
      ...mockEnv,
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_key_12345",
    };

    const webhookRes = await app.request(
      "/api/billing/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "t=12345,v1=invalid_signature_hex",
        },
        body: JSON.stringify({
          type: "checkout.session.completed",
          data: { object: {} },
        }),
      },
      envWithSecret
    );

    expect(webhookRes.status).toBe(400);
    const body = (await webhookRes.json()) as any;
    expect(body.error).toBe("InvalidWebhookSignature");
  });

  it("should process stripe webhooks for checkout completion, subscription update, and cancellation", async () => {
    // 1. Create a Pro Plan
    await app.request(
      "/api/billing/admin/plans",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Pro Tier",
          slug: "pro-tier",
          stripePriceIdMonthly: "price_monthly_pro_123",
          priceMonthly: 4900,
          features: ["pdf_export", "priority_support"],
        }),
      },
      mockEnv
    );

    // 2. Simulate Stripe Webhook: checkout.session.completed
    const checkoutEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_real_stripe_999",
          subscription: "sub_real_stripe_999",
          metadata: {
            targetType: "user",
            targetId: "user_customer_123",
            planId: "plan_pro-tier",
          },
        },
      },
    };

    const webhookRes1 = await app.request(
      "/api/billing/webhook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutEvent),
      },
      mockEnv
    );
    expect(webhookRes1.status).toBe(200);

    // 3. Verify subscription is listed in admin subscriptions
    const subsRes = await app.request(
      "/api/billing/admin/subscriptions",
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );
    expect(subsRes.status).toBe(200);
    const subsData = (await subsRes.json()) as any;
    const found = subsData.subscriptions.find(
      (s: any) => s.subscription.targetId === "user_customer_123"
    );
    expect(found).toBeDefined();
    expect(found.subscription.status).toBe("active");
    expect(found.subscription.stripeCustomerId).toBe("cus_real_stripe_999");

    // 4. Simulate Stripe Webhook: customer.subscription.updated (cancel_at_period_end)
    const updateEvent = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_real_stripe_999",
          customer: "cus_real_stripe_999",
          status: "active",
          cancel_at_period_end: true,
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
      },
    };

    const webhookRes2 = await app.request(
      "/api/billing/webhook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateEvent),
      },
      mockEnv
    );
    expect(webhookRes2.status).toBe(200);

    // 5. Simulate Stripe Webhook: customer.subscription.deleted (canceled)
    const deleteEvent = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_real_stripe_999",
          customer: "cus_real_stripe_999",
        },
      },
    };

    const webhookRes3 = await app.request(
      "/api/billing/webhook",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteEvent),
      },
      mockEnv
    );
    expect(webhookRes3.status).toBe(200);

    // 6. Verify subscription is now marked canceled
    const subsResAfter = await app.request(
      "/api/billing/admin/subscriptions",
      {
        method: "GET",
        headers: { cookie: adminCookie },
      },
      mockEnv
    );
    const subsDataAfter = (await subsResAfter.json()) as any;
    const canceledSub = subsDataAfter.subscriptions.find(
      (s: any) => s.subscription.targetId === "user_customer_123"
    );
    expect(canceledSub.subscription.status).toBe("canceled");
  });
});
