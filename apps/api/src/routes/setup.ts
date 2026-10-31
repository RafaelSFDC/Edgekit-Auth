import { Hono } from "hono";
import type { AppContext } from "@/types/env";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit";

export const setupRoutes = new Hono<AppContext>();

/**
 * GET /api/setup/status
 * Verifica se a instância já possui ao menos um administrador cadastrado.
 * Usado pelo frontend no primeiro acesso para decidir entre tela de Setup ou Login normal.
 */
setupRoutes.get("/status", async (c) => {
  const db = c.get("db");

  try {
    const [admin] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.user)
      .where(sql`${schema.user.role} IN ('admin', 'super_admin') OR ${schema.user.isSuperAdmin} = 1`);

    const adminCount = Number(admin?.count || 0);
    const initialized = adminCount > 0;

    return c.json({
      initialized,
      needsSetup: !initialized,
    });
  } catch (err: any) {
    return c.json(
      {
        initialized: false,
        needsSetup: true,
        error: err.message,
      },
      200
    );
  }
});

/**
 * POST /api/setup
 * Cria o primeiro administrador do sistema no primeiro acesso.
 * Bloqueado permanentemente com 403 Forbidden se já existir qualquer administrador.
 */
setupRoutes.post("/", async (c) => {
  const db = c.get("db");
  const auth = c.get("auth");

  // 1. Verificação Estrita de Segurança: Nenhum super-admin pode existir
  const [admin] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.user)
    .where(sql`${schema.user.role} IN ('admin', 'super_admin') OR ${schema.user.isSuperAdmin} = 1`);

  if (Number(admin?.count || 0) > 0) {
    return c.json(
      {
        error: "Forbidden",
        message: "O Edgekit Auth já foi inicializado com um super-administrador de sistema.",
      },
      403
    );
  }

  // 2. Validação dos dados de entrada
  const body = await c.req.json().catch(() => ({}));
  const name = body.name?.trim();
  const email = body.email?.trim()?.toLowerCase();
  const password = body.password;

  if (!name || name.length < 2) {
    return c.json({ error: "BadRequest", message: "O nome deve ter no mínimo 2 caracteres." }, 400);
  }
  if (!email || !email.includes("@")) {
    return c.json({ error: "BadRequest", message: "Informe um endereço de e-mail válido." }, 400);
  }
  if (!password || password.length < 8) {
    return c.json({ error: "BadRequest", message: "A senha deve conter no mínimo 8 caracteres." }, 400);
  }

  // 3. Registrar o usuário pelo Better Auth para hashing scrypt, criação de account e sessão
  const req = new Request(new URL("/api/auth/sign-up/email", c.req.url).toString(), {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify({
      name,
      email,
      password,
    }),
  });

  const authResponse = await auth.handler(req);
  if (!authResponse.ok) {
    const errorData = (await authResponse.json().catch(() => ({}))) as any;
    return c.json(
      {
        error: "RegistrationFailed",
        message: errorData.message || "Falha ao registrar o primeiro administrador.",
      },
      authResponse.status as any
    );
  }

  // 4. Promover o usuário criado para papel de super-administrador ('admin') com isSuperAdmin = true
  await db
    .update(schema.user)
    .set({
      role: "admin",
      isSuperAdmin: true,
      emailVerified: true,
    })
    .where(eq(schema.user.email, email));

  // 5. Registrar evento de auditoria imutável do bootstrapping
  await logAuditEvent(db, {
    action: "system.bootstrapped",
    actorEmail: email,
    targetType: "system",
    metadata: {
      bootstrappedAt: new Date().toISOString(),
      adminName: name,
    },
  });

  // 6. Retornar resposta mantendo os cabeçalhos Set-Cookie da sessão criada
  const resData = (await authResponse.json().catch(() => ({}))) as any;
  const headers = new Headers();
  authResponse.headers.forEach((val, key) => {
    headers.append(key, val);
  });
  headers.set("Content-Type", "application/json");

  return new Response(
    JSON.stringify({
      success: true,
      message: "Administrador inicial configurado com sucesso!",
      user: {
        id: resData?.user?.id,
        name,
        email,
        role: "admin",
      },
      session: resData?.session,
    }),
    {
      status: 201,
      headers,
    }
  );
});
