# ⚡ Edgekit Auth

> **High-Performance Edge Authentication Engine** construído sobre [Hono](https://hono.dev), alimentado nativamente pelo **[Better Auth](https://better-auth.com)** e projetado para **Cloudflare Workers** (Edge) com **Cloudflare D1 (SQLite)** e **Drizzle ORM**.

---

## ✨ Características & Plugins Nativos

- 🖥️ **Admin Console & Dashboard Navegável**: Interface visual completa inspirada em Supabase e Clerk, construída com **React + TanStack Query + Tailwind CSS**, servida nativamente no mesmo domínio via **Cloudflare Workers Static Assets**.
- 🛡️ **Email & Senha com Hashing Criptográfico**: Autenticação segura com scrypt nativo, recuperação de senha e validação contra brute-force.
- 🪪 **Passkeys / WebAuthn (`@better-auth/passkey`)**: Autenticação biométrica sem senhas (FaceID, TouchID, Windows Hello) via FIDO2.
- 🔐 **Autenticação em Duas Etapas (2FA / TOTP)**: Códigos de 6 dígitos via Google Authenticator, 1Password, Authy e códigos de recuperação (*backup codes*).
- ✉️ **Passwordless & Transações por E-mail**: Magic links, recuperação de senha, confirmação de e-mail e convites de equipe via **Resend** (com modo console/dev automático para desenvolvimento local).
- 🏢 **Multi-Tenancy & Organizações**: Gestão de equipes, convites por e-mail com expiração e token de aceite, atribuição de cargos (`admin`, `member`) e RBAC.
- 👑 **Admin CLI & Impersonation**: CLI dedicada para criar/promover administradores (`pnpm admin:create`), suspensão de contas (`ban`/`unban`), listagem e impersonação de sessões.
- 🔑 **Validação Offline via JWKS**: Emissão de tokens JWT com chaves públicas em `/.well-known/jwks.json` e `/api/auth/jwks` para microsserviços validarem sessões sem sobrecarregar o D1.
- ⚡ **Alta Performance no Edge**: Caching de sessão criptografado em cookies para evitar leituras repetitivas no D1, suporte a Cross-Subdomain Cookies e Rate Limiting em memória.
- 📱 **Modo Bearer Token**: Suporte a autenticação por header `Authorization: Bearer <token>` em adição aos cookies HTTP-only, ideal para mobile apps e SPAs.
- 🌐 **Social OAuth Plug-and-Play**: Pré-configurado para **Google**, **GitHub**, **Discord** e **Microsoft**. Se as credenciais estiverem no `.env`, o provedor é ativado automaticamente.
- 🔔 **Webhooks Assinados (HMAC-SHA256)**: Notificações em tempo real enviadas para serviços externos nos eventos de ciclo de vida (`user.created`, `user.updated`, `session.created`).
- 📖 **Swagger UI & OpenAPI Automático**: Documentação interativa em `/docs` gerada dinamicamente pelo plugin OpenAPI em `/api/auth/open-api/generate-schema`.
- 📦 **Client SDK Tipado Integrado**: Exportação pronta do client Better Auth com todos os plugins em `src/lib/auth-client.ts`.

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
