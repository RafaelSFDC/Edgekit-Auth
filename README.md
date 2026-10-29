# ⚡ Hono Auth

> **Open-Source Clerk Alternative** construído com [Hono](https://hono.dev), desenhado nativamente para **Cloudflare Workers** (Edge) e 100% agnóstico para runtimes modernos (Node.js, Bun, Deno).

---

## ✨ Características Principais

- 🔑 **Validação Offline via JWKS**: O backend emite tokens JWT assinados assimetricamente (`ES256`). Microsserviços e frontends validam tokens sub-milissegundo via `/.well-known/jwks.json` sem sobrecarregar o banco de dados.
- 🌐 **Autenticação Third-Party (Social OAuth)**: Suporte unificado para **Google** e **GitHub** usando [Arctic](https://arctic.js.org), com fluxo seguro PKCE e vinculação automática de contas (*Account Linking* por e-mail verificado).
- 🍪 **Gerenciamento de Sessão Seguro**: Tokens de curta duração (5 min) combinados com cookies `HttpOnly`, `SameSite=Lax` e *Rotating Refresh Tokens* à prova de replay attacks.
- 🏢 **Multi-Tenancy & Organizações**: Suporte a equipes, organizações, atribuição de cargos (`org:admin`, `org:member`) e permissões granulares.
- 🛡️ **Edge-First & Cloudflare D1**: Desenvolvido sobre [Drizzle ORM](https://orm.drizzle.team) e Cloudflare D1 (SQLite distribuído na borda), sem dependências pesadas de Node ou binários compilados.
- 📖 **Documentação Interativa Integrada**: Interface Swagger UI completa disponível em `/docs` e especificação OpenAPI em `/doc`.

---

## 🏗️ Arquitetura do Sistema

```
                  ┌─────────────────────────────────────────┐
                  │          Frontend App / SDK             │
                  └──────────────┬──────────────────┬───────┘
                                 │                  │
               /v1/client/*      │                  │  Offline Token Verification
           (Handshake, Sessions) │                  │  via /.well-known/jwks.json
                                 ▼                  ▼
                    ┌────────────────────────────────────┐
                    │       Hono Auth (Edge Worker)      │
                    ├────────────────────────────────────┤
                    │ • OAuth Engine (Google / GitHub)   │
                    │ • JWKS & Asymmetric Signer (ES256) │
                    │ • Session Rotation & Revocation    │
                    │ • Multi-Tenant Org Service         │
                    └─────────────────┬──────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │    Cloudflare D1 SQLite   │
                        │    (users, sessions, org) │
                        └───────────────────────────┘
```

---

## 🚀 Como Executar Localmente

### 1. Clonar e Instalar Dependências

```bash
git clone https://github.com/your-username/hono-auth.git
cd hono-auth
pnpm install
```

### 2. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Configure as credenciais do Google e/ou GitHub para testar o login social:
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`
- `ADMIN_SECRET_KEY`: Chave para consumir a API de backend (`/v1/backend/*`)

### 3. Gerar e Aplicar Migrações do D1

```bash
# Gerar arquivos SQL de migração a partir do schema Drizzle
pnpm db:generate

# Aplicar migrações no banco local do Cloudflare D1
pnpm db:migrate:local
```

### 4. Iniciar o Servidor de Desenvolvimento

```bash
pnpm dev
```

A aplicação estará acessível em:
- **API Base**: `http://localhost:8787`
- **Swagger Docs**: `http://localhost:8787/docs`
- **JWKS Endpoint**: `http://localhost:8787/.well-known/jwks.json`
- **OIDC Discovery**: `http://localhost:8787/.well-known/openid-configuration`

---

## 🧪 Testes

Para rodar a suíte completa de testes unitários e de integração com o Vitest:

```bash
pnpm test
```

Para verificar tipos estáticos do TypeScript:

```bash
pnpm typecheck
```

---

## 📡 Visão Geral dos Endpoints

### 1. Descoberta & JWKS
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/.well-known/jwks.json` | Chaves públicas de assinatura para verificação de tokens |
| `GET` | `/.well-known/openid-configuration` | Metadados do OpenID Connect Discovery |

### 2. Autenticação Third-Party (Social OAuth)
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/v1/client/oauth/:provider/authorize` | Inicia o fluxo PKCE (`google` ou `github`) |
| `GET` | `/v1/client/oauth/:provider/callback` | Callback de autorização, cria/vincula usuário e inicia sessão |

### 3. Frontend Client API (`/v1/client`)
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/v1/client/handshake` | Retorna o estado atual da sessão e perfil do usuário |
| `POST` | `/v1/client/sessions/:id/touch` | Renova o JWT de curta duração rotacionando o refresh token |
| `POST` | `/v1/client/sessions/:id/remove` | Efetua logout e revoga a sessão |
| `GET` | `/v1/client/users/me` | Obtém detalhes completos do usuário logado e identidades |
| `PATCH` | `/v1/client/users/me` | Atualiza dados básicos e metadados do usuário |

### 4. Backend Admin API (`/v1/backend` - Requer `Authorization: Bearer sk_...`)
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/v1/backend/users` | Lista usuários com paginação |
| `POST` | `/v1/backend/users` | Cria um usuário manualmente |
| `GET` | `/v1/backend/users/:id` | Retorna detalhes do usuário com identidades e sessões ativas |
| `POST` | `/v1/backend/users/:id/ban` | Suspende a conta e encerra todas as sessões ativas |
| `POST` | `/v1/backend/users/:id/unban` | Reativa uma conta suspensa |
| `DELETE` | `/v1/backend/users/:id` | Remove permanentemente um usuário |
| `POST` | `/v1/backend/sessions/:id/revoke` | Revoga forçadamente uma sessão específica |
| `GET` | `/v1/backend/organizations` | Lista organizações cadastradas |
| `POST` | `/v1/backend/organizations` | Cria uma organização e atribui o criador como admin |

---

## 📄 Licença

MIT License.
