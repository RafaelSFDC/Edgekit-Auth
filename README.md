# ⚡ Edgekit Auth

> **External Identity & Access Management (IAM), RBAC and Billing Engine** construído sobre [Hono](https://hono.dev), alimentado nativamente pelo **[Better Auth](https://better-auth.com)** e projetado para rodar no Edge com **Cloudflare Workers**, **Cloudflare D1 (SQLite)** e **Drizzle ORM**.

---

## 🏛️ Filosofia Arquitetural: Control Plane vs Data Plane

O **Edgekit Auth** é um serviço externo de infraestrutura (Auth-as-a-Service, no padrão profissional de mercado equivalente e superior ao **Clerk**):
1. **Control Plane (Super-Admin Console)**:
   - A interface web (`apps/web`) é estritamente o **Developer Console** da plataforma.
   - Apenas o usuário **Super-Admin** (dono/operador da instância) tem permissão de login no Console.
   - Qualquer tentativa de login por usuários consumidores de aplicações clientes é rejeitada imediatamente (`403 Forbidden`).
2. **Data Plane (Aplicações Consumidoras)**:
   - Os usuários finais das aplicações clientes operam exclusivamente via chamadas de API ou SDKs a partir de seus próprios frontends e backends.
   - Frontends utilizam a **Publishable Key** (`pk_live_...` / `pk_test_...`) com validação de domínios permitidos (CORS Whitelist).
   - Backends utilizam a **Secret Key** (`sk_live_...` / `sk_test_...`) para operações administrativas M2M ou realizam **validação offline de tokens via JWKS** (`/.well-known/jwks.json`) com zero latência.

---

## ✨ Características & Capacidades

- 🖥️ **Developer Console (Super-Admin Only)**: Console visual completo construído em React 19, Tailwind CSS v4, TanStack Router/Query, Shadcn UI e i18n (pt-BR / en).
- 🔑 **Dual-Key Engine (Publishable & Secret Keys)**: Suporte nativo a `pk_live_...` / `pk_test_...` com CORS Whitelist para frontends e `sk_live_...` / `sk_test_...` para backends.
- 💳 **Billing & Entitlements Engine Integrado**: Catálogo de planos de assinatura, preços mensal/anual, checkout Stripe, portal de clientes, webhooks Stripe e validação de cotas/entitlements.
- 🛡️ **RBAC & FGA Granular**: Catálogo de permissões atômicas, papéis globais e papéis dinâmicos por organização (`organization_role`), com proteção soberana para o criador (`owner`).
- 🔑 **Validação Offline via JWKS & Claims Enriquecidos**: Tokens JWT assinados que já trazem `org_id`, `org_role`, `org_permissions`, `roles`, `permissions`, `plan` e `entitlements` injetados.
- 🏷️ **Metadados em 3 Níveis (Padrão Clerk)**: `publicMetadata` (client read / server write), `privateMetadata` (server only) e `unsafeMetadata` (client read/write).
- ✉️ **Email OTP & Passwordless**: Códigos numéricos de 6 dígitos via e-mail além de Magic Links e confirmação de e-mail.
- 🪪 **Passkeys / WebAuthn**: Autenticação biométrica sem senhas (FaceID, TouchID, Windows Hello) via FIDO2.
- 🔐 **Autenticação em Duas Etapas (2FA / TOTP)**: Códigos de 6 dígitos via Google Authenticator, 1Password, Authy e códigos de recuperação (*backup codes*).
- 📜 **Trilha de Auditoria & Segurança (`audit_log`)**: Registro imutável de eventos de autenticação, alterações de permissão, bloqueios e ações administrativas.
- 🔔 **Webhooks Assinados (HMAC-SHA256)**: Notificações em tempo real enviadas para serviços externos com assinatura criptográfica `X-Edgekit-Signature`.
- 🏢 **Multi-Tenancy Global & Organizações B2B**: Visão global da instância com auditoria de membros, proprietários soberanos, delegação de papéis e convites por e-mail.
- 🚀 **Hub Quickstart Interativo**: Aba dedicada com snippets prontos para copiar (Next.js, Node.js JWKS, Python FastAPI, cURL) preenchidos com as chaves reais da instância.

---

## 🏗️ Arquitetura do Sistema

```
                  ┌──────────────────────────────────────────────┐
                  │      Frontend App (React / Vue / Mobile)     │
                  └──────────────┬──────────────────────┬────────┘
                                 │                      │
                    HTTP/Bearer   │                      │  Offline Token Verification
                /api/auth/*       │                      │  via /.well-known/jwks.json
                                 ▼                      ▼
                      ┌────────────────────────────────────────┐
                      │         Edgekit Auth (Worker)          │
                      ├────────────────────────────────────────┤
                      │ • Better Auth Core (Email/Password)    │
                      │ • Passkeys (WebAuthn / FIDO2)          │
                      │ • Two-Factor Auth (TOTP & Backup)      │
                      │ • Magic Link & Reset Password Engine   │
                      │ • Organizations & Member Management    │
                      │ • Admin & Impersonation Plugin         │
                      │ • Webhooks Dispatcher (HMAC-SHA256)    │
                      │ • Rate Limiter & Cookie Cache (Edge)   │
                      │ • JWT Signer & Bearer Auth Handler     │
                      │ • Auto OpenAPI & Swagger UI (/docs)    │
                      │ • Social OAuth (Google, GitHub, etc.)  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                          ┌────────────────────────────────┐
                          │      Cloudflare D1 SQLite      │
                          │    (@better-auth/drizzle)      │
                          └────────────────────────────────┘
```

---

## 🚀 Como Executar Localmente

### 1. Instalar Dependências

```bash
pnpm install
```

### 2. Configurar Variáveis de Ambiente

Copie o `.env.example` para `.env`:

```bash
cp .env.example .env
```

Configure seu segredo de criptografia:
- `BETTER_AUTH_SECRET`: Chave aleatória segura de no mínimo 32 caracteres.
- `BETTER_AUTH_URL`: URL base do servidor (padrão: `http://localhost:8787`).
- `ADMIN_EMAILS`: E-mails que receberão papel `admin` automaticamente ao se cadastrar (ex: `admin@empresa.com`).

### 3. Aplicar Migrações do Cloudflare D1

```bash
# Aplicar migrações no banco local do Cloudflare D1
pnpm db:migrate:local
```

### 4. Criar o Primeiro Usuário Administrador (Bootstrapping)

Para acessar o Admin Console (`http://localhost:5173`), crie uma conta administrativa diretamente via CLI:

```bash
# Criar novo administrador do zero no D1 local:
pnpm admin:create --email admin@empresa.com --password SenhaSuperSegura123! --name "Admin"

# Ou promover um usuário já cadastrado:
pnpm admin:promote --email usuario@empresa.com

# Listar administradores existentes:
pnpm admin:list
```
*(Adicione a flag `--remote` para executar as operações no Cloudflare D1 de produção).*

### 5. Iniciar o Ambiente de Desenvolvimento

```bash
# Inicia a API (porta 8787) e o Dashboard (porta 5173 com proxy) concorrentemente:
pnpm dev

# Ou inicie separadamente se preferir:
pnpm dev:api   # Cloudflare Worker / Hono
pnpm dev:web   # React + Vite Dashboard
```

Acesse no navegador:
- 🖥️ **Admin Console (Dashboard)**: `http://localhost:5173` (ou `http://localhost:8787/` em produção)
- 📖 **Swagger UI Interativo**: `http://localhost:8787/docs`
- 🔑 **Chaves Públicas JWKS**: `http://localhost:8787/.well-known/jwks.json`
- 📜 **Especificação OpenAPI JSON**: `http://localhost:8787/api/auth/open-api/generate-schema`
- ⚡ **Health Check**: `http://localhost:8787/health`

---

## 🔔 Webhooks & Notificações em Tempo Real

Configure `WEBHOOK_URL` e `WEBHOOK_SECRET` no `.env` para receber notificações HTTP automáticas a cada evento do ciclo de vida:

```json
{
  "id": "evt_4a796b42-d610-4828-9844-3d98d24daee9",
  "event": "user.created",
  "createdAt": 1730198400000,
  "data": {
    "id": "u_123",
    "email": "dev@empresa.com",
    "name": "Dev",
    "role": "user"
  }
}
```

Cada requisição traz o cabeçalho `X-Edgekit-Signature` com o digest HMAC-SHA256 do payload para validação de integridade.

---

## 💻 Como Consumir no Frontend (Client SDK)

O arquivo `src/lib/auth-client.ts` exporta o client 100% tipado com todos os plugins ativados:

```typescript
import { authClient } from "@/lib/auth-client";

// 1. Cadastro com Email e Senha
const { data, error } = await authClient.signUp.email({
  email: "usuario@exemplo.com",
  password: "SenhaSuperSegura123!",
  name: "Dev Usuário",
});

// 2. Login com Email e Senha
const { data, error } = await authClient.signIn.email({
  email: "usuario@exemplo.com",
  password: "SenhaSuperSegura123!",
});

// 3. Login com Passkey (Biometria)
await authClient.signIn.passkey();

// 4. Obter Sessão Ativa
const { data: session } = await authClient.getSession();

// 5. Autenticação Social OAuth
await authClient.signIn.social({
  provider: "github", // ou "google", "discord", "microsoft"
  callbackURL: "/dashboard",
});

// 6. Organizações (Teams B2B)
const { data: org } = await authClient.organization.create({
  name: "Minha Empresa",
  slug: "minha-empresa",
});
```

---

## 🧪 Testes Automatizados & Qualidade de Código

```bash
# Rodar todos os testes unitários e de integração
pnpm test

# Verificação estática de tipos TypeScript
pnpm typecheck

# Compilar aplicação e validar assets
pnpm build
```

---

## 📄 Licença

MIT License.
