import type { Context } from "hono";
import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { AppContext, Bindings } from "@/types/env";
import { getFeatureFlags } from "./features";
import { verifyApiKey } from "./api-keys";

/**
 * Validates whether a user identity has Super Admin privileges on this installation.
 * Strict check: only explicitly flagged isSuperAdmin = true or role = "super_admin".
 * Consumer users with application role 'admin' are NOT super admins.
 */
export function isUserSuperAdmin(user?: any): boolean {
  if (!user) return false;
  return Boolean(user.isSuperAdmin === true || user.role === "super_admin");
}

export interface AdminAuthResult {
  authenticated: boolean;
  userId: string;
  isM2M: boolean;
  apiKeyId?: string;
  sessionId?: string;
}

/**
 * Guard helper for Super-Admin console and M2M admin endpoints.
 * Requires:
 * 1. M2M Secret Key (sk_... / ek_...) with role = "admin"
 * 2. OR an active Better Auth session for a verified Super Admin (isUserSuperAdmin = true)
 */
export async function authenticateAdminOrM2M(c: Context<AppContext>): Promise<AdminAuthResult | null> {
  const auth = c.get("auth");
  const db = c.get("db");

  // 1. Verify M2M Secret Key
  const authHeader = c.req.header("authorization") || "";
  const xApiKey = c.req.header("x-api-key") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : xApiKey.trim();

  if (token && (token.startsWith("sk_") || token.startsWith("ek_"))) {
    const apiKeyRecord = await verifyApiKey(db, token);
    if (apiKeyRecord && apiKeyRecord.keyType === "secret" && apiKeyRecord.role === "admin") {
      const actorId = apiKeyRecord.createdById || "system";
      c.set("userId", actorId);
      c.set("apiKeyId", apiKeyRecord.id);
      return {
        authenticated: true,
        userId: actorId,
        isM2M: true,
        apiKeyId: apiKeyRecord.id,
      };
    }
  }

  // 2. Verify Session
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session && session.user && isUserSuperAdmin(session.user)) {
    c.set("userId", session.user.id);
    c.set("sessionId", session.session.id);
    return {
      authenticated: true,
      userId: session.user.id,
      isM2M: false,
      sessionId: session.session.id,
    };
  }

  return null;
}

export interface ResolvedAuthorizationContext {
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
  activeOrganization: {
    id: string;
    name: string;
    slug: string;
    role: string;
    permissions: string[];
    maxMembers?: number | null;
  } | null;
  plan: string;
  subscriptionStatus: string;
  entitlements: string[];
  limits: Record<string, any>;
}

/**
 * Built-in baseline permissions for standard organization roles
 */
export const defaultOrgRolePermissions: Record<string, string[]> = {
  owner: [
    "org:delete",
    "org:update",
    "org:transfer_ownership",
    "org:members:read",
    "org:members:invite",
    "org:members:manage",
    "org:billing:read",
    "org:billing:manage",
  ],
  admin: [
    "org:update",
    "org:members:read",
    "org:members:invite",
    "org:members:manage",
    "org:billing:read",
  ],
  member: ["org:view", "org:members:read"],
};

/**
 * Single source of truth for resolving a user's complete authorization,
 * active organization, dynamic roles, atomic permissions, plan, and entitlements.
 * Shared between JWT emission and consumer self-service endpoints (/api/v1/users/me).
 */
export async function resolveUserAuthorizationContext(
  db: Database,
  env: Bindings | undefined,
  params: {
    userId: string;
    activeOrganizationId?: string | null;
    userRecord?: any;
  }
): Promise<ResolvedAuthorizationContext> {
  const { userId, activeOrganizationId, userRecord } = params;
  const features = getFeatureFlags(env);

  let isSuperAdmin = false;
  if (userRecord) {
    isSuperAdmin = isUserSuperAdmin(userRecord);
  } else if (userId) {
    const [u] = await db
      .select({ isSuperAdmin: schema.user.isSuperAdmin, role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (u) {
      isSuperAdmin = isUserSuperAdmin(u);
    }
  }

  // 1. Resolve Active Organization Context
  let activeOrg: ResolvedAuthorizationContext["activeOrganization"] = null;
  let activeOrgPlan = "free";
  let activeOrgSubStatus = "none";
  let activeOrgEntitlements: string[] = [];
  let activeOrgLimits: Record<string, any> = {};
  let orgGrantedPermissions: string[] = [];

  if (features.organizations && userId) {
    try {
      // Find memberships for this user
      const memberships = await db
        .select({
          member: schema.member,
          org: schema.organization,
        })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(eq(schema.member.userId, userId));

      let matchedMembership = null;
      if (activeOrganizationId) {
        matchedMembership = memberships.find((m) => m.org.id === activeOrganizationId) || null;
      }
      if (!matchedMembership && memberships.length > 0) {
        // Fallback to first membership if none actively selected
        matchedMembership = memberships[0];
      }

      if (matchedMembership) {
        const org = matchedMembership.org;
        const member = matchedMembership.member;
        let orgPerms: string[] = [];

        // Check custom role permissions in organization_role table
        const [customRole] = await db
          .select()
          .from(schema.organizationRole)
          .where(
            and(
              eq(schema.organizationRole.organizationId, org.id),
              eq(schema.organizationRole.role, member.role)
            )
          )
          .limit(1);

        if (customRole && customRole.permission) {
          try {
            const parsed = JSON.parse(customRole.permission);
            orgPerms = Array.isArray(parsed) ? parsed : (Object.values(parsed).flat() as string[]);
          } catch {}
        }

        // If no custom override, check role catalog for organization scope
        if (orgPerms.length === 0 && features.rbac) {
          const [catalogRole] = await db
            .select()
            .from(schema.role)
            .where(and(eq(schema.role.key, member.role), eq(schema.role.scope, "organization")))
            .limit(1);

          if (catalogRole) {
            const catalogPerms = await db
              .select({ key: schema.rolePermission.permissionKey })
              .from(schema.rolePermission)
              .where(eq(schema.rolePermission.roleId, catalogRole.id));
            orgPerms = catalogPerms.map((p) => p.key);
          }
        }

        // If still empty, fallback to default role permissions
        if (orgPerms.length === 0) {
          orgPerms = defaultOrgRolePermissions[member.role] || ["org:view", "org:members:read"];
        }

        // Check organization direct metadata entitlements
        if (org.metadata) {
          try {
            const orgMeta = typeof org.metadata === "string" ? JSON.parse(org.metadata) : org.metadata;
            if (orgMeta?.plan) activeOrgPlan = orgMeta.plan;
            if (Array.isArray(orgMeta?.entitlements)) activeOrgEntitlements = orgMeta.entitlements;
            if (orgMeta?.limits && typeof orgMeta.limits === "object") activeOrgLimits = orgMeta.limits;
          } catch {}
        }

        // Check organization billing subscription (if billing is enabled)
        if (features.billing) {
          const [orgSub] = await db
            .select()
            .from(schema.billingSubscription)
            .innerJoin(schema.billingPlan, eq(schema.billingSubscription.planId, schema.billingPlan.id))
            .where(
              and(
                eq(schema.billingSubscription.targetType, "organization"),
                eq(schema.billingSubscription.targetId, org.id),
                sql`${schema.billingSubscription.status} IN ('active', 'trialing')`
              )
            )
            .limit(1);

          if (orgSub) {
            activeOrgPlan = orgSub.billing_plan.slug;
            activeOrgSubStatus = orgSub.billing_subscription.status;
            try {
              activeOrgEntitlements = JSON.parse(orgSub.billing_plan.features || "[]");
            } catch {}
            try {
              activeOrgLimits = JSON.parse(orgSub.billing_plan.limits || "{}");
            } catch {}
            try {
              if (orgSub.billing_plan.grantedPermissions) {
                orgGrantedPermissions = JSON.parse(orgSub.billing_plan.grantedPermissions || "[]");
              }
            } catch {}
          }
        }

        // Merge any plan-granted permissions into the organization permissions
        const combinedOrgPermissions = Array.from(new Set([...orgPerms, ...orgGrantedPermissions]));

        activeOrg = {
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: member.role,
          permissions: combinedOrgPermissions,
          maxMembers: org.maxMembers,
        };
      }
    } catch (e: any) {
      console.error("[resolveUserAuthorizationContext] Error resolving organization:", e.message);
    }
  }

  // 2. Resolve Global RBAC Roles and Permissions
  let globalRoles: string[] = [];
  let globalPermissions: string[] = [];

  if (features.rbac && userId) {
    try {
      const userRolesList = await db
        .select({
          roleKey: schema.role.key,
          roleId: schema.role.id,
        })
        .from(schema.userRole)
        .innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
        .where(and(eq(schema.userRole.userId, userId), sql`${schema.userRole.organizationId} IS NULL`));

      globalRoles = userRolesList.map((r) => r.roleKey);

      if (globalRoles.length > 0) {
        const permsList = await db
          .select({
            permissionKey: schema.rolePermission.permissionKey,
          })
          .from(schema.rolePermission)
          .innerJoin(schema.role, eq(schema.rolePermission.roleId, schema.role.id))
          .where(
            sql`${schema.role.key} IN (${sql.join(
              globalRoles.map((r) => sql`${r}`),
              sql`, `
            )})`
          );

        globalPermissions = Array.from(new Set(permsList.map((p) => p.permissionKey)));
      }
    } catch (e: any) {
      console.error("[resolveUserAuthorizationContext] Error resolving RBAC:", e.message);
    }
  }

  // 3. Resolve User-level B2C Billing Plan & Entitlements
  let userPlan = "free";
  let userSubStatus = "none";
  let userEntitlements: string[] = [];
  let userLimits: Record<string, any> = {};
  let userGrantedPermissions: string[] = [];

  if (features.billing && userId) {
    try {
      const [userSub] = await db
        .select()
        .from(schema.billingSubscription)
        .innerJoin(schema.billingPlan, eq(schema.billingSubscription.planId, schema.billingPlan.id))
        .where(
          and(
            eq(schema.billingSubscription.targetType, "user"),
            eq(schema.billingSubscription.targetId, userId),
            sql`${schema.billingSubscription.status} IN ('active', 'trialing')`
          )
        )
        .limit(1);

      if (userSub) {
        userPlan = userSub.billing_plan.slug;
        userSubStatus = userSub.billing_subscription.status;
        try {
          userEntitlements = JSON.parse(userSub.billing_plan.features || "[]");
        } catch {}
        try {
          userLimits = JSON.parse(userSub.billing_plan.limits || "{}");
        } catch {}
        try {
          if (userSub.billing_plan.grantedPermissions) {
            userGrantedPermissions = JSON.parse(userSub.billing_plan.grantedPermissions || "[]");
          }
        } catch {}
      }
    } catch (e: any) {
      console.error("[resolveUserAuthorizationContext] Error resolving user billing:", e.message);
    }
  }

  // Merge any plan-granted permissions into global permissions
  if (userGrantedPermissions.length > 0) {
    globalPermissions = Array.from(new Set([...globalPermissions, ...userGrantedPermissions]));
  }

  // Fallback to direct entitlements from user publicMetadata if no active subscription
  if (userPlan === "free" && userRecord?.publicMetadata) {
    try {
      const uMeta = typeof userRecord.publicMetadata === "string" ? JSON.parse(userRecord.publicMetadata) : userRecord.publicMetadata;
      if (uMeta?.plan) userPlan = uMeta.plan;
      if (Array.isArray(uMeta?.entitlements)) userEntitlements = uMeta.entitlements;
      if (uMeta?.limits && typeof uMeta.limits === "object") userLimits = uMeta.limits;
    } catch {}
  }

  // Determine effective plan & entitlements:
  // If active organization has a paid plan, it takes precedence for the active tenant context.
  // Otherwise, fallback to the user's personal plan.
  const effectivePlan = activeOrgPlan !== "free" ? activeOrgPlan : userPlan;
  const effectiveSubStatus = activeOrgSubStatus !== "none" ? activeOrgSubStatus : userSubStatus;
  const effectiveEntitlements = Array.from(new Set([...activeOrgEntitlements, ...userEntitlements]));
  const effectiveLimits = { ...userLimits, ...activeOrgLimits };

  return {
    isSuperAdmin,
    roles: globalRoles,
    permissions: globalPermissions,
    activeOrganization: activeOrg,
    plan: effectivePlan,
    subscriptionStatus: effectiveSubStatus,
    entitlements: effectiveEntitlements,
    limits: effectiveLimits,
  };
}
