import { hashPassword } from "better-auth/crypto";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return flags;
}

function runD1Command(sql: string, isRemote = false): any {
  const flag = isRemote ? "--remote" : "--local";
  // Escape quotes for bash / pwsh / cmd
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute hono-auth-db ${flag} --command "${sanitized}" --json`;
  
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return JSON.parse(output);
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Falha ao executar comando D1 (${flag}): ${stderr}`);
  }
}

async function main() {
  const flags = parseArgs();
  const isRemote = Boolean(flags.remote);
  const email = (flags.email as string) || (flags.promote as string);
  const password = flags.password as string;
  const name = (flags.name as string) || "Administrator";
  const listOnly = Boolean(flags.list);

  console.log(`\n⚡ [Edgekit Auth] Admin Management CLI (${isRemote ? "REMOTE D1" : "LOCAL D1"})\n`);

  if (listOnly) {
    console.log("📋 Listando administradores cadastrados...");
    const res = runD1Command("SELECT id, name, email, role, created_at FROM user WHERE role = 'admin';", isRemote);
    const admins = res?.[0]?.results || [];
    if (admins.length === 0) {
      console.log("Nenhum usuário com papel 'admin' encontrado no banco.");
    } else {
      console.table(admins);
    }
    return;
  }

  if (!email) {
    console.log("Uso:");
    console.log("  1. Promover usuário existente a admin:");
    console.log("     pnpm admin:promote --email usuario@exemplo.com [--remote]\n");
    console.log("  2. Criar novo administrador do zero:");
    console.log("     pnpm admin:create --email admin@exemplo.com --password SenhaForte123! --name \"Admin\" [--remote]\n");
    console.log("  3. Listar administradores atuais:");
    console.log("     pnpm admin:list [--remote]\n");
    process.exit(0);
  }

  // Check if user already exists
  const checkSql = `SELECT id, name, email, role FROM user WHERE lower(email) = lower('${email}');`;
  const checkRes = runD1Command(checkSql, isRemote);
  const existingUser = checkRes?.[0]?.results?.[0];

  if (existingUser) {
    if (existingUser.role === "admin") {
      console.log(`ℹ️  O usuário '${email}' já possui privilégios de 'admin'.`);
      return;
    }

    console.log(`Promovendo '${email}' de '${existingUser.role || "user"}' para 'admin'...`);
    const updateSql = `UPDATE user SET role = 'admin' WHERE id = '${existingUser.id}';`;
    runD1Command(updateSql, isRemote);
    console.log(`✅ Sucesso! O usuário '${email}' agora é um Administrador (role='admin').`);
    return;
  }

  // User does not exist, check if password provided to create from scratch
  if (!password) {
    console.error(`❌ Usuário com email '${email}' não encontrado.`);
    console.log("💡 Para criar um novo usuário admin, forneça também a flag '--password':");
    console.log(`   pnpm admin:create --email ${email} --password "SuaSenha123!" --name "${name}" ${isRemote ? "--remote" : ""}\n`);
    process.exit(1);
  }

  console.log(`Criando nova conta de administrador para '${email}'...`);
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = Date.now();
  const hashedPassword = await hashPassword(password);

  // Insert User
  const insertUserSql = `INSERT INTO user (id, name, email, email_verified, role, banned, created_at, updated_at) VALUES ('${userId}', '${name}', '${email.toLowerCase()}', 1, 'admin', 0, ${now}, ${now});`;
  runD1Command(insertUserSql, isRemote);

  // Insert Account with password
  const insertAccountSql = `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ('${accountId}', '${email.toLowerCase()}', 'credential', '${userId}', '${hashedPassword}', ${now}, ${now});`;
  runD1Command(insertAccountSql, isRemote);

  console.log(`\n🎉 Conta de Administrador criada com sucesso!`);
  console.log(`   • Nome: ${name}`);
  console.log(`   • Email: ${email.toLowerCase()}`);
  console.log(`   • Cargo: admin`);
  console.log(`   • Ambiente: ${isRemote ? "Remote Cloudflare D1" : "Local D1"}`);
  console.log(`\nVocê já pode acessar o console em: http://localhost:5173/login\n`);
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
