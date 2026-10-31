import type { Bindings } from "@/types/env";
import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

export interface CreateCheckoutOptions {
  planId: string;
  targetType: "organization" | "user";
  targetId: string;
  successUrl: string;
  cancelUrl: string;
  billingCycle?: "monthly" | "yearly";
}

/**
 * Creates a Stripe Checkout Session or returns dev simulation checkout link.
 */
export async function createBillingCheckoutSession(
  db: Database,
  env: Bindings,
  options: CreateCheckoutOptions
): Promise<{ url: string; sessionId?: string; isSimulated?: boolean }> {
  const [plan] = await db
    .select()
    .from(schema.billingPlan)
    .where(eq(schema.billingPlan.id, options.planId))
    .limit(1);

  if (!plan) {
    throw new Error("Plano de cobrança não encontrado");
  }

  const isYearly = options.billingCycle === "yearly";
  const priceId = isYearly ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;

  // Real Stripe Integration if API key is configured
  if (env.STRIPE_SECRET_KEY && priceId) {
    try {
      const params = new URLSearchParams();
      params.append("mode", "subscription");
      params.append("line_items[0][price]", priceId);
      params.append("line_items[0][quantity]", "1");
      params.append("success_url", options.successUrl);
      params.append("cancel_url", options.cancelUrl);
      params.append("metadata[targetType]", options.targetType);
      params.append("metadata[targetId]", options.targetId);
      params.append("metadata[planId]", options.planId);

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const sessionData = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(sessionData.error?.message || "Falha ao criar sessão do Stripe");
      }

      return {
        url: sessionData.url,
        sessionId: sessionData.id,
        isSimulated: false,
      };
    } catch (err: any) {
      console.error("[Stripe] Erro ao criar checkout session:", err);
      if (env.ENVIRONMENT === "production") {
        throw new Error(err.message || "Falha na comunicação com o Stripe.");
      }
    }
  }

  if (env.ENVIRONMENT === "production") {
    throw new Error("Stripe Secret Key e Price IDs não estão configurados no ambiente de produção.");
  }

  // Developer Simulation Mode: Directly provision or update subscription in D1
  const subId = `sub_${crypto.randomUUID()}`;
  const now = new Date();
  const periodEnd = new Date(Date.now() + (isYearly ? 365 : 30) * 86400 * 1000);

  // Check existing
  const [existing] = await db
    .select()
    .from(schema.billingSubscription)
    .where(
      and(
        eq(schema.billingSubscription.targetType, options.targetType),
        eq(schema.billingSubscription.targetId, options.targetId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.billingSubscription)
      .set({
        planId: options.planId,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(schema.billingSubscription.id, existing.id));
  } else {
    await db.insert(schema.billingSubscription).values({
      id: subId,
      targetType: options.targetType,
      targetId: options.targetId,
      stripeCustomerId: `cus_sim_${options.targetId}`,
      stripeSubscriptionId: `sub_sim_${crypto.randomUUID().slice(0, 8)}`,
      planId: options.planId,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      createdAt: now,
      updatedAt: now,
    });
  }

  await logAuditEvent(db, {
    action: "billing.subscription_simulated",
    targetId: options.targetId,
    targetType: options.targetType,
    metadata: { plan: plan.slug, planId: plan.id, simulated: true },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "subscription.created",
      data: {
        targetType: options.targetType,
        targetId: options.targetId,
        plan: plan.slug,
        status: "active",
      },
    });
  }

  return {
    url: `${options.successUrl}?session_id=${subId}&simulated=true`,
    sessionId: subId,
    isSimulated: true,
  };
}

/**
 * Creates a Stripe Customer Portal link.
 */
export async function createBillingPortalSession(
  db: Database,
  env: Bindings,
  options: {
    targetType: "organization" | "user";
    targetId: string;
    returnUrl: string;
  }
): Promise<{ url: string; isSimulated?: boolean }> {
  const [sub] = await db
    .select()
    .from(schema.billingSubscription)
    .where(
      and(
        eq(schema.billingSubscription.targetType, options.targetType),
        eq(schema.billingSubscription.targetId, options.targetId)
      )
    )
    .limit(1);

  if (!sub) {
    throw new Error("Nenhuma assinatura ativa encontrada para este cliente.");
  }

  if (env.STRIPE_SECRET_KEY && sub.stripeCustomerId && !sub.stripeCustomerId.startsWith("cus_sim_")) {
    try {
      const params = new URLSearchParams();
      params.append("customer", sub.stripeCustomerId);
      params.append("return_url", options.returnUrl);

      const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = (await res.json()) as any;
      if (res.ok && data.url) {
        return { url: data.url, isSimulated: false };
      }
    } catch (err) {
      console.error("[Stripe] Erro ao criar portal session:", err);
    }
  }

  return {
    url: `${options.returnUrl}?portal=simulated`,
    isSimulated: true,
  };
}

/**
 * Validates Stripe Webhook Signature header (t=...,v1=...) using Web Crypto HMAC-SHA256.
 * Zero external dependencies, 100% compliant with Cloudflare Workers edge runtime.
 */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",");
  let timestamp = -1;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "t") {
      timestamp = parseInt(value, 10);
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === -1 || signatures.length === 0 || isNaN(timestamp)) {
    return false;
  }

  // Tolerance check (default 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signatures.some((sig) => sig.toLowerCase() === computedHex.toLowerCase());
}
