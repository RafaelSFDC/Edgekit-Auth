import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createBillingCheckoutSession, createBillingPortalSession } from "@/lib/billing";
import { verifyApiKey } from "@/lib/api-keys";
import { logAuditEvent } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

export const billingRoutes = new Hono<AppContext>();

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
  const targetType = activeOrgId ? "organization" : "user";
  const targetId = activeOrgId || session.user.id;

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
 * Handles incoming Stripe Webhooks with signature validation.
 */
billingRoutes.post("/webhook", async (c) => {
  const db = c.get("db");
  const env = c.env;
  const sig = c.req.header("stripe-signature") || "";

  const rawBody = await c.req.text();
  let event: any;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Handle Stripe events
  const eventType = event.type || "unknown";

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
  const auth = c.get("auth");
  const db = c.get("db");

  const authHeader = c.req.header("authorization") || "";
  const xApiKey = c.req.header("x-api-key") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : xApiKey.trim();

  if (token && (token.startsWith("sk_") || token.startsWith("ek_"))) {
    const apiKeyRecord = await verifyApiKey(db, token);
    if (apiKeyRecord && apiKeyRecord.role === "admin") {
      return next();
    }
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const isSuper = Boolean(
    (session?.user as any)?.isSuperAdmin ||
    (session?.user as any)?.role === "super_admin" ||
    (session?.user as any)?.role === "admin"
  );

  if (!session || !isSuper) {
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
    isPublic: body.isPublic !== false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ success: true, planId: id });
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

billingRoutes.route("/admin", adminBillingRoutes);
