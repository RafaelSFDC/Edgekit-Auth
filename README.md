# ⚡ Edgekit Auth

> **High-Performance Edge Authentication Engine** construído sobre [Hono](https://hono.dev), alimentado nativamente pelo **[Better Auth](https://better-auth.com)** e projetado para **Cloudflare Workers** (Edge) com **Cloudflare D1 (SQLite)** e **Drizzle ORM**.

---

## ✨ Características & Plugins Nativos

- 🛡️ **Email & Senha com Hashing Criptográfico**: Autenticação segura com validação robusta de senhas e proteção contra timing attacks.
- 🪪 **Passkeys / WebAuthn (`@better-auth/passkey`)**: Autenticação biométrica sem senhas (FaceID, TouchID, Windows Hello) via FIDO2.
- 🔐 **Autenticação em Duas Etapas (2FA / TOTP)**: Códigos de 6 dígitos via Google Authenticator, 1Password, Authy e códigos de recuperação (*backup codes*).
- ✉️ **Passwordless via Magic Link**: Acesso direto por link de e-mail através do **Resend** (com modo console/dev automático para desenvolvimento local).
- 🏢 **Multi-Tenancy & Organizações**: Gestão de equipes, convites por e-mail com expiração, atribuição de cargos (`admin`, `member`) e controle de acesso baseado em papéis (RBAC).
- 👑 **Admin & Impersonation**: Suspensão de contas (`ban`/`unban`), listagem de usuários e capacidade de assumir sessões de usuários para suporte ao cliente.
- 🔑 **Validação Offline via JWKS**: Emissão de tokens JWT assimétricos com endpoint público de chaves em `/.well-known/jwks.json` e `/api/auth/jwks` para microsserviços validarem sessões sem sobrecarregar o banco de dados.
- 📱 **Modo Bearer Token**: Suporte a autenticação por header `Authorization: Bearer <token>` em adição aos cookies HTTP-only, ideal para mobile apps e SPAs.
- 🌐 **Social OAuth Plug-and-Play**: Pré-configurado para **Google**, **GitHub**, **Discord** e **Microsoft**. Se as credenciais estiverem no `.env`, o provedor é ativado automaticamente.
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
                     │ • Magic Link Engine                    │
                     │ • Organizations & Member Management    │
                     │ • Admin & Impersonation Plugin         │
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
- *(Opcional)* Provedores Social OAuth: preencha `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, etc. conforme a necessidade.

### 3. Aplicar Migrações do Cloudflare D1

```bash
# Aplicar migrações no banco local do Cloudflare D1
pnpm db:migrate:local
```

### 4. Iniciar o Servidor de Desenvolvimento

```bash
pnpm dev
```

Acesse no navegador:
- 📖 **Swagger UI Interativo**: `http://localhost:8787/docs`
- 🔑 **Chaves Públicas JWKS**: `http://localhost:8787/.well-known/jwks.json`
- 📜 **Especificação OpenAPI JSON**: `http://localhost:8787/api/auth/open-api/generate-schema`
- ⚡ **Health Check**: `http://localhost:8787/health`

---

## 💻 Como Consumir no Frontend (Client SDK)

O arquivo `src/lib/auth-client.ts` já exporta o client 100% tipado com todos os plugins ativados:

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

// 4. Obter Sessão Ativa (com suporte a React Hooks em apps React)
const { data: session } = await authClient.getSession();

// 5. Autenticação Social OAuth (se configurado no .env)
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

## 🧪 Testes Automatizados & Tipos

```bash
# Rodar todos os testes unitários e de integração
pnpm test

# Verificação estática de tipos TypeScript
pnpm typecheck

# Validar compilação do bundle para Cloudflare Workers
pnpm build
```

---

## 📄 Licença

MIT License.
