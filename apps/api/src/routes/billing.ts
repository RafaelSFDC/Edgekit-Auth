import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  verifyStripeWebhookSignature,
} from "@/lib/billing";
import { verifyApiKey } from "@/lib/api-keys";
import { logAuditEvent } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { authenticateAdminOrM2M } from "@/lib/access-control";

export const billingRoutes = new Hono<AppContext>();

/**
 * Modular Gate: If FEATURE_BILLING is explicitly disabled, respond with 404 FeatureDisabled
 */
billingRoutes.use("*", async (c, next) => {
  if (c.env?.FEATURE_BILLING === "false") {
    return c.json(
      {
        error: "FeatureDisabled",
        message: "O módulo de faturamento (Billing) está desativado nesta instalação.",
      },
      404
    );
  }
  return next();
});

/**
 * GET /api/billing/plans
 * Public endpoint: Lists all available billing plans for applications to render pricing tables.
 */
billingRoutes.get("/plans", async (c) => {
  const db = c.get("db");

  const plans = await db
    .select()
    .from(schema.billingPlan)
    .where(eq(schema.billingPlan.isPublic, true))
    .orderBy(schema.billingPlan.priceMonthly);

  const formatted = plans.map((p) => {
    let features: string[] = [];
    let limits: Record<string, any> = {};
    try {
      features = JSON.parse(p.features || "[]");
    } catch {}
    try {
      limits = JSON.parse(p.limits || "{}");
    } catch {}

    return {
      ...p,
      features,
      limits,
    };
  });

  return c.json({ plans: formatted });
});

/**
 * GET /api/billing/subscription
 * Returns active subscription & entitlements for current session or active organization.
 */
billingRoutes.get("/subscription", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", message: "Sessão não encontrada" }, 401);
  }

  const userId = session.user.id;
  const activeOrgId = (session.session as any).activeOrganizationId;

  const targetType = activeOrgId ? "organization" : "user";
  const targetId = activeOrgId || userId;

  const [sub] = await db
    .select()
    .from(schema.billingSubscription)
    .innerJoin(schema.billingPlan, eq(schema.billingSubscription.planId, schema.billingPlan.id))
    .where(
      and(
        eq(schema.billingSubscription.targetType, targetType),
        eq(schema.billingSubscription.targetId, targetId)
      )
    )
    .limit(1);

  if (!sub) {
    return c.json({
      subscription: null,
      plan: { slug: "free", name: "Gratuito", features: [], limits: {} },
      status: "none",
    });
  }

  let features: string[] = [];
  let limits: Record<string, any> = {};
  try {
    features = JSON.parse(sub.billing_plan.features || "[]");
  } catch {}
  try {
    limits = JSON.parse(sub.billing_plan.limits || "{}");
  } catch {}

  return c.json({
    subscription: sub.billing_subscription,
    plan: {
      ...sub.billing_plan,
      features,
      limits,
    },
    status: sub.billing_subscription.status,
  });
});

/**
 * POST /api/billing/checkout
 * Generates checkout session (Stripe or dev simulated) to subscribe to a plan.
 */
billingRoutes.post("/checkout", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const env = c.env;

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", message: "Sessão não encontrada" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const planId = body.planId;
  const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
  const successUrl = body.successUrl || `${c.req.url}/success`;
  const cancelUrl = body.cancelUrl || `${c.req.url}/cancel`;

  if (!planId) {
    return c.json({ error: "BadRequest", message: "planId é obrigatório" }, 400);
  }

  const activeOrgId = (session.session as any).activeOrganizationId;
  const requestedTargetType = body.targetType;
  let targetType: "organization" | "user" = requestedTargetType || (activeOrgId ? "organization" : "user");
  let targetId = body.targetId || (targetType === "organization" ? activeOrgId : session.user.id);

  if (targetType === "organization") {
    if (!targetId) {
      return c.json({ error: "BadRequest", message: "Organização alvo não especificada." }, 400);
    }
    const [membership] = await db
      .select()
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, targetId), eq(schema.member.userId, session.user.id)))
      .limit(1);

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para gerenciar faturamento desta organização." }, 403);
    }
  }

  try {
    const result = await createBillingCheckoutSession(db, env, {
      planId,
      targetType,
      targetId,
      successUrl,
      cancelUrl,
      billingCycle,
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: "CheckoutFailed", message: err.message }, 400);
  }
});

/**
 * POST /api/billing/cancel
 * Cancel active subscription for user or organization.
 */
billingRoutes.post("/cancel", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const env = c.env;

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", message: "Sessão não encontrada" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const activeOrgId = (session.session as any).activeOrganizationId;
  const targetType = body.targetType || (activeOrgId ? "organization" : "user");
  const targetId = body.targetId || (targetType === "organization" ? activeOrgId : session.user.id);

  if (targetType === "organization") {
    const [membership] = await db
      .select()
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, targetId), eq(schema.member.userId, session.user.id)))
      .limit(1);

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return c.json({ error: "Forbidden", message: "Permissão insuficiente para cancelar a assinatura desta organização." }, 403);
    }
  }

  const [sub] = await db
    .select()
    .from(schema.billingSubscription)
    .where(
      and(
        eq(schema.billingSubscription.targetType, targetType),
        eq(schema.billingSubscription.targetId, targetId),
        sql`${schema.billingSubscription.status} IN ('active', 'trialing')`
      )
    )
    .limit(1);

  if (!sub) {
    return c.json({ error: "NotFound", message: "Nenhuma assinatura ativa encontrada para cancelamento." }, 404);
  }

  const now = new Date();
  await db
    .update(schema.billingSubscription)
    .set({
      cancelAtPeriodEnd: true,
      canceledAt: now,
      updatedAt: now,
    })
    .where(eq(schema.billingSubscription.id, sub.id));

  await logAuditEvent(db, {
    action: "billing.subscription_cancel_requested",
    actorId: session.user.id,
    targetId,
    targetType,
    metadata: { subscriptionId: sub.id },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "subscription.cancel_requested",
      data: { targetType, targetId, subscriptionId: sub.id },
    });
  }

  return c.json({ success: true, message: "Cancelamento solicitado. O plano permanecerá ativo até o final do período atual." });
});

/**
 * POST /api/billing/portal
 * Generates customer billing portal link.
 */
billingRoutes.post("/portal", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const env = c.env;

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", message: "Sessão não encontrada" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const returnUrl = body.returnUrl || c.req.url;

  const activeOrgId = (session.session as any).activeOrganizationId;
  const targetType = activeOrgId ? "organization" : "user";
  const targetId = activeOrgId || session.user.id;

  try {
    const result = await createBillingPortalSession(db, env, {
      targetType,
      targetId,
      returnUrl,
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: "PortalFailed", message: err.message }, 400);
  }
});

/**
 * POST /api/billing/webhook
 * Handles incoming Stripe Webhooks with signature validation and subscription lifecycle.
 */
billingRoutes.post("/webhook", async (c) => {
  const db = c.get("db");

  const rawBody = await c.req.text();

  // Validate Stripe signature if secret is configured
  if (c.env?.STRIPE_WEBHOOK_SECRET) {
    const signature = c.req.header("stripe-signature");
    const isValid = await verifyStripeWebhookSignature(
      rawBody,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
    if (!isValid) {
      return c.json({ error: "InvalidWebhookSignature", message: "Assinatura do Stripe inválida" }, 400);
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Handle Stripe events
  const eventType = event.type || "unknown";

  // 1. Checkout completed
  if (eventType === "checkout.session.completed") {
    const session = event.data?.object;
    const metadata = session?.metadata || {};
    const { targetType, targetId, planId } = metadata;

    if (targetType && targetId && planId) {
      const now = new Date();
      const periodEnd = new Date(Date.now() + 30 * 86400 * 1000);

      const [existing] = await db
        .select()
        .from(schema.billingSubscription)
        .where(
          and(
            eq(schema.billingSubscription.targetType, targetType),
            eq(schema.billingSubscription.targetId, targetId)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(schema.billingSubscription)
          .set({
            planId,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            updatedAt: now,
          })
          .where(eq(schema.billingSubscription.id, existing.id));
      } else {
        await db.insert(schema.billingSubscription).values({
          id: `sub_${crypto.randomUUID()}`,
          targetType,
          targetId,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          planId,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          createdAt: now,
          updatedAt: now,
        });
      }

      await logAuditEvent(db, {
        action: "billing.checkout_completed",
        targetId,
        targetType,
        metadata: { planId, customerId: session.customer },
      });

      if (c.env?.WEBHOOK_URL) {
        await dispatchWebhook(c.env, {
          event: "subscription.created",
          data: { targetType, targetId, planId, status: "active" },
        });
      }
    }
  }

  // 2. Subscription updated (plan change, status update, renewal, cancel_at_period_end)
  if (eventType === "customer.subscription.updated") {
    const subObj = event.data?.object;
    if (subObj?.id) {
      const now = new Date();
      const currentPeriodEnd = subObj.current_period_end ? new Date(subObj.current_period_end * 1000) : null;
      const status = subObj.status || "active";
      const cancelAtPeriodEnd = Boolean(subObj.cancel_at_period_end);

      // Check if price/plan changed
      const priceId = subObj.items?.data?.[0]?.price?.id;
      let newPlanId: string | null = null;
      if (priceId) {
        const [matchedPlan] = await db
          .select()
          .from(schema.billingPlan)
          .where(
            sql`${schema.billingPlan.stripePriceIdMonthly} = ${priceId} OR ${schema.billingPlan.stripePriceIdYearly} = ${priceId}`
          )
          .limit(1);
        if (matchedPlan) {
          newPlanId = matchedPlan.id;
        }
      }

      const [existingSub] = await db
        .select()
        .from(schema.billingSubscription)
        .where(
          sql`${schema.billingSubscription.stripeSubscriptionId} = ${subObj.id} OR ${schema.billingSubscription.stripeCustomerId} = ${subObj.customer}`
        )
        .limit(1);

      if (existingSub) {
        await db
          .update(schema.billingSubscription)
          .set({
            status,
            cancelAtPeriodEnd,
            currentPeriodEnd,
            ...(newPlanId ? { planId: newPlanId } : {}),
            updatedAt: now,
          })
          .where(eq(schema.billingSubscription.id, existingSub.id));

        await logAuditEvent(db, {
          action: "billing.subscription_updated",
          targetId: existingSub.targetId,
          targetType: existingSub.targetType as any,
          metadata: { status, cancelAtPeriodEnd, planId: newPlanId || existingSub.planId },
        });

        if (c.env?.WEBHOOK_URL) {
          await dispatchWebhook(c.env, {
            event: "subscription.updated",
            data: {
              targetType: existingSub.targetType,
              targetId: existingSub.targetId,
              planId: newPlanId || existingSub.planId,
              status,
              cancelAtPeriodEnd,
            },
          });
        }
      }
    }
  }

  // 3. Subscription deleted / canceled
  if (eventType === "customer.subscription.deleted") {
    const subObj = event.data?.object;
    if (subObj?.id) {
      const now = new Date();
      const [existingSub] = await db
        .select()
        .from(schema.billingSubscription)
        .where(
          sql`${schema.billingSubscription.stripeSubscriptionId} = ${subObj.id} OR ${schema.billingSubscription.stripeCustomerId} = ${subObj.customer}`
        )
        .limit(1);

      if (existingSub) {
        await db
          .update(schema.billingSubscription)
          .set({
            status: "canceled",
            updatedAt: now,
          })
          .where(eq(schema.billingSubscription.id, existingSub.id));

        await logAuditEvent(db, {
          action: "billing.subscription_canceled",
          targetId: existingSub.targetId,
          targetType: existingSub.targetType as any,
          metadata: { stripeSubscriptionId: subObj.id },
        });

        if (c.env?.WEBHOOK_URL) {
          await dispatchWebhook(c.env, {
            event: "subscription.canceled",
            data: {
              targetType: existingSub.targetType,
              targetId: existingSub.targetId,
              status: "canceled",
            },
          });
        }
      }
    }
  }

  // 4. Invoice payment failed
  if (eventType === "invoice.payment_failed") {
    const invoiceObj = event.data?.object;
    if (invoiceObj?.customer) {
      const [existingSub] = await db
        .select()
        .from(schema.billingSubscription)
        .where(eq(schema.billingSubscription.stripeCustomerId, invoiceObj.customer))
        .limit(1);

      if (existingSub) {
        await db
          .update(schema.billingSubscription)
          .set({
            status: "past_due",
            updatedAt: new Date(),
          })
          .where(eq(schema.billingSubscription.id, existingSub.id));

        await logAuditEvent(db, {
          action: "billing.payment_failed",
          targetId: existingSub.targetId,
          targetType: existingSub.targetType as any,
          metadata: { customerId: invoiceObj.customer },
        });

        if (c.env?.WEBHOOK_URL) {
          await dispatchWebhook(c.env, {
            event: "subscription.past_due",
            data: {
              targetType: existingSub.targetType,
              targetId: existingSub.targetId,
              status: "past_due",
            },
          });
        }
      }
    }
  }

  return c.json({ received: true });
});

/**
 * ============================================================================
 * ADMIN BILLING ENDPOINTS (Protected by Super-Admin Guard)
 * ============================================================================
 */
const adminBillingRoutes = new Hono<AppContext>();

adminBillingRoutes.use("*", async (c, next) => {
  const adminAuth = await authenticateAdminOrM2M(c);
  if (!adminAuth) {
    return c.json({ error: "Unauthorized", message: "Acesso restrito ao Super-Admin" }, 403);
  }
  await next();
});

adminBillingRoutes.get("/plans", async (c) => {
  const db = c.get("db");
  const plans = await db.select().from(schema.billingPlan).orderBy(schema.billingPlan.priceMonthly);
  return c.json({ plans });
});

adminBillingRoutes.post("/plans", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));

  const name = body.name?.trim();
  const slug = body.slug?.trim()?.toLowerCase();
  if (!name || !slug) {
    return c.json({ error: "BadRequest", message: "name e slug são obrigatórios" }, 400);
  }

  const id = `plan_${slug}`;
  const now = new Date();

  await db.insert(schema.billingPlan).values({
    id,
    name,
    slug,
    description: body.description?.trim() || null,
    stripeProductId: body.stripeProductId?.trim() || null,
    stripePriceIdMonthly: body.stripePriceIdMonthly?.trim() || null,
    stripePriceIdYearly: body.stripePriceIdYearly?.trim() || null,
    priceMonthly: Number(body.priceMonthly || 0),
    priceYearly: Number(body.priceYearly || 0),
    currency: body.currency?.trim()?.toLowerCase() || "usd",
    features: body.features ? JSON.stringify(body.features) : "[]",
    limits: body.limits ? JSON.stringify(body.limits) : "{}",
    grantedPermissions: body.grantedPermissions ? JSON.stringify(body.grantedPermissions) : "[]",
    trialDays: body.trialDays ? Number(body.trialDays) : null,
    isPublic: body.isPublic !== false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ success: true, planId: id });
});

adminBillingRoutes.patch("/plans/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (body.stripeProductId !== undefined) updateData.stripeProductId = body.stripeProductId?.trim() || null;
  if (body.stripePriceIdMonthly !== undefined) updateData.stripePriceIdMonthly = body.stripePriceIdMonthly?.trim() || null;
  if (body.stripePriceIdYearly !== undefined) updateData.stripePriceIdYearly = body.stripePriceIdYearly?.trim() || null;
  if (body.priceMonthly !== undefined) updateData.priceMonthly = Number(body.priceMonthly);
  if (body.priceYearly !== undefined) updateData.priceYearly = Number(body.priceYearly);
  if (body.currency !== undefined) updateData.currency = body.currency?.trim()?.toLowerCase();
  if (body.features !== undefined) updateData.features = JSON.stringify(body.features);
  if (body.limits !== undefined) updateData.limits = JSON.stringify(body.limits);
  if (body.grantedPermissions !== undefined) updateData.grantedPermissions = JSON.stringify(body.grantedPermissions);
  if (body.trialDays !== undefined) updateData.trialDays = body.trialDays ? Number(body.trialDays) : null;
  if (body.isPublic !== undefined) updateData.isPublic = Boolean(body.isPublic);

  const [updated] = await db
    .update(schema.billingPlan)
    .set(updateData)
    .where(eq(schema.billingPlan.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "NotFound", message: "Plano não encontrado." }, 404);
  }

  return c.json({ success: true, plan: updated });
});

adminBillingRoutes.delete("/plans/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await db.delete(schema.billingPlan).where(eq(schema.billingPlan.id, id));
  return c.json({ success: true });
});

adminBillingRoutes.get("/subscriptions", async (c) => {
  const db = c.get("db");
  const subs = await db
    .select({
      subscription: schema.billingSubscription,
      planName: schema.billingPlan.name,
      planSlug: schema.billingPlan.slug,
    })
    .from(schema.billingSubscription)
    .innerJoin(schema.billingPlan, eq(schema.billingSubscription.planId, schema.billingPlan.id))
    .orderBy(desc(schema.billingSubscription.createdAt));

  return c.json({ subscriptions: subs });
});

adminBillingRoutes.post("/subscriptions/assign", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const body = await c.req.json().catch(() => ({}));

  const { targetType, targetId, planId, status = "active", trialDays } = body;
  if (!targetType || !targetId || !planId) {
    return c.json({ error: "BadRequest", message: "targetType, targetId e planId são obrigatórios." }, 400);
  }

  const [plan] = await db
    .select()
    .from(schema.billingPlan)
    .where(or(eq(schema.billingPlan.id, planId), eq(schema.billingPlan.slug, planId)))
    .limit(1);

  if (!plan) {
    return c.json({ error: "NotFound", message: "Plano não encontrado." }, 404);
  }

  const now = new Date();
  const days = trialDays || plan.trialDays || 30;
  const periodEnd = new Date(Date.now() + days * 86400 * 1000);

  const [existing] = await db
    .select()
    .from(schema.billingSubscription)
    .where(
      and(
        eq(schema.billingSubscription.targetType, targetType),
        eq(schema.billingSubscription.targetId, targetId)
      )
    )
    .limit(1);

  let subRecord: any;
  if (existing) {
    [subRecord] = await db
      .update(schema.billingSubscription)
      .set({
        planId: plan.id,
        status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        updatedAt: now,
      })
      .where(eq(schema.billingSubscription.id, existing.id))
      .returning();
  } else {
    const subId = `sub_${crypto.randomUUID()}`;
    [subRecord] = await db
      .insert(schema.billingSubscription)
      .values({
        id: subId,
        targetType,
        targetId,
        planId: plan.id,
        status,
        stripeCustomerId: `cus_manual_${targetId}`,
        stripeSubscriptionId: `sub_manual_${crypto.randomUUID().slice(0, 8)}`,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  }

  await logAuditEvent(db, {
    action: "billing.subscription_manually_assigned",
    targetId,
    targetType,
    metadata: { planId: plan.id, planSlug: plan.slug, status },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "subscription.assigned",
      data: { targetType, targetId, planSlug: plan.slug, status },
    });
  }

  return c.json({ success: true, subscription: subRecord });
});

adminBillingRoutes.post("/subscriptions/:id/cancel", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(schema.billingSubscription)
    .where(eq(schema.billingSubscription.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "NotFound", message: "Assinatura não encontrada." }, 404);
  }

  const now = new Date();
  const [updated] = await db
    .update(schema.billingSubscription)
    .set({
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    })
    .where(eq(schema.billingSubscription.id, id))
    .returning();

  await logAuditEvent(db, {
    action: "billing.subscription_canceled_by_admin",
    targetId: existing.targetId,
    targetType: existing.targetType as any,
    metadata: { subscriptionId: id },
  });

  if (env.WEBHOOK_URL) {
    await dispatchWebhook(env, {
      event: "subscription.canceled",
      data: { targetType: existing.targetType, targetId: existing.targetId, subscriptionId: id },
    });
  }

  return c.json({ success: true, subscription: updated });
});

billingRoutes.route("/admin", adminBillingRoutes);
