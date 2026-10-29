import { eq, and } from "drizzle-orm";
import type { Database } from "@/db";
import { organizations, orgMemberships, users } from "@/db/schema";
import { generateId } from "@/lib/id";

export class OrgService {
  /**
   * Create an organization and make the creator the admin.
   */
  static async createOrganization(
    db: Database,
    creatorUserId: string,
    data: { name: string; slug: string; logoUrl?: string }
  ) {
    const orgId = generateId("org");
    const [org] = await db
      .insert(organizations)
      .values({
        id: orgId,
        name: data.name,
        slug: data.slug,
        logoUrl: data.logoUrl,
        createdBy: creatorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Assign creator as admin
    const membershipId = generateId("orgmem");
    const [membership] = await db
      .insert(orgMemberships)
      .values({
        id: membershipId,
        organizationId: org.id,
        userId: creatorUserId,
        role: "org:admin",
        permissions: ["*"],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { organization: org, membership };
  }

  /**
   * List all organizations that a user belongs to.
   */
  static async getUserOrganizations(db: Database, userId: string) {
    const list = await db
      .select({
        organization: organizations,
        membership: orgMemberships,
      })
      .from(orgMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, orgMemberships.organizationId)
      )
      .where(eq(orgMemberships.userId, userId));

    return list;
  }

  /**
   * Add a user to an organization.
   */
  static async addMember(
    db: Database,
    organizationId: string,
    userId: string,
    role: string = "org:member"
  ) {
    const membershipId = generateId("orgmem");
    const [membership] = await db
      .insert(orgMemberships)
      .values({
        id: membershipId,
        organizationId,
        userId,
        role,
        permissions: role === "org:admin" ? ["*"] : ["org:read"],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return membership;
  }

  /**
   * Remove a member from an organization.
   */
  static async removeMember(
    db: Database,
    organizationId: string,
    userId: string
  ) {
    await db
      .delete(orgMemberships)
      .where(
        and(
          eq(orgMemberships.organizationId, organizationId),
          eq(orgMemberships.userId, userId)
        )
      );
  }
}
