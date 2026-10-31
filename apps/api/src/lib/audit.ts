import type { Database } from "@/db";
import * as schema from "@/db/schema";

export interface LogAuditEventParams {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorType?: "user" | "api_key" | "system";
  targetId?: string | null;
  targetType?: "user" | "organization" | "api_key" | "session" | "webhook" | "system";
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Registra um evento de auditoria no Cloudflare D1.
 * Execução segura e não-bloqueante.
 */
export async function logAuditEvent(db: Database, params: LogAuditEventParams): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      id: `evt_${crypto.randomUUID()}`,
      action: params.action,
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail ?? null,
      actorType: params.actorType || "user",
      targetId: params.targetId ?? null,
      targetType: params.targetType ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      createdAt: new Date(),
    });
  } catch (err: any) {
    console.error("[AuditLog] Falha ao registrar log de auditoria:", err.message);
  }
}
