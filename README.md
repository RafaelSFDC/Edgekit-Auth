# ⚡ Hono Auth

> **Open-Source Clerk Alternative** construído com [Hono](https://hono.dev), desenhado nativamente para **Cloudflare Workers** (Edge) e 100% agnóstico para runtimes modernos (Node.js, Bun, Deno).

---

## ✨ Características Principais

- 🖥️ **Hosted UI Integrada (`/sign-in` e `/user-profile`)**: Telas de login e perfil prontas, ultra-leves e responsivas servidas diretamente pelo Worker (com Tailwind CSS e suporte automático a temas). Zero código de frontend necessário para começar.
- ✉️ **Passwordless com E-mail (Magic Link & OTP)**: Envio de código numérico de 6 dígitos e link de acesso direto via **Resend** ou **Cloudflare Email** (com modo console/dev automático para testes locais sem credenciais).
- 🌐 **Autenticação Third-Party (Social OAuth)**: Suporte unificado para **Google** e **GitHub** usando [Arctic](https://arctic.js.org), com fluxo seguro PKCE e vinculação automática de contas (*Account Linking* por e-mail verificado).
- 📍 **Auditoria de Dispositivos & Geolocalização**: Captura automática de cidade, país e navegador (via headers gratuitos da Cloudflare) com listagem de aparelhos ativos e botão *"Desconectar outros dispositivos"*.
- 🔑 **Validação Offline via JWKS**: O backend emite tokens JWT assinados assimetricamente (`ES256`). Microsserviços e frontends validam tokens sub-milissegundo via `/.well-known/jwks.json` sem sobrecarregar o banco de dados.
- 🏢 **Multi-Tenancy & Organizações**: Suporte a equipes, organizações, atribuição de cargos (`org:admin`, `org:member`) e permissões granulares.
- 🛡️ **Edge-First & Cloudflare D1**: Desenvolvido sobre [Drizzle ORM](https://orm.drizzle.team) e Cloudflare D1 (SQLite distribuído na borda), sem dependências pesadas de Node ou binários compilados.
- 📖 **Documentação Interativa Integrada**: Interface Swagger UI completa disponível em `/docs` e especificação OpenAPI em `/doc`.

---

## 🏗️ Arquitetura do Sistema

```
                  ┌─────────────────────────────────────────┐
                  │    Usuário / Navegador / Frontend App   │
                  └──────────────┬──────────────────┬───────┘
                                 │                  │
                /sign-in         │                  │  Offline Token Verification
        (Hosted Login UI & OTP)  │                  │  via /.well-known/jwks.json
                                 ▼                  ▼
                    ┌────────────────────────────────────┐
                    │       Hono Auth (Edge Worker)      │
                    ├────────────────────────────────────┤
                    │ • Hosted UI (/sign-in, /profile)   │
                    │ • Email Passwordless (OTP & Link)  │
                    │ • OAuth Engine (Google / GitHub)   │
                    │ • Device & Geolocation Tracking    │
                    │ • JWKS & Asymmetric Signer (ES256) │
                    │ • Session Rotation & Revocation    │
                    │ • Multi-Tenant Org Service         │
                    └─────────────────┬──────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │    Cloudflare D1 SQLite   │
                        │ (users, sessions, tokens) │
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

Configure as credenciais (opcionais para desenvolvimento):
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`
- `RESEND_API_KEY` (Se não informado, o código OTP e Magic Link serão impressos no terminal para teste instantâneo)
- `ADMIN_SECRET_KEY`: Chave para consumir a API de backend (`/v1/backend/*`)

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
- 🎨 **Tela de Login Pronta**: `http://localhost:8787/sign-in`
- 👤 **Perfil e Aparelhos**: `http://localhost:8787/user-profile`
- 📖 **Swagger UI**: `http://localhost:8787/docs`
- 🔑 **Chaves JWKS**: `http://localhost:8787/.well-known/jwks.json`

---

## 🧪 Testes

Para rodar a suíte completa de 21 testes unitários e de integração com o Vitest:

```bash
pnpm test
```

Para verificar tipos estáticos do TypeScript:

```bash
pnpm typecheck
```

---

## 📡 Visão Geral dos Endpoints

### 1. Hosted UI (Telas Prontas)
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/sign-in` | Tela visual completa com Google, GitHub e Login por E-mail (suporta `?redirect_url=...`) |
| `GET` | `/user-profile` | Tela de gerenciamento de conta, métodos conectados e aparelhos ativos |

### 2. Autenticação por E-mail Passwordless
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/v1/client/email/send-code` | Envia código de 6 dígitos e Magic Link para o e-mail |
| `POST` | `/v1/client/email/verify-code` | Valida código de 6 dígitos, autentica e define cookies de sessão |
| `GET` | `/v1/client/email/verify-link` | Valida clique no Magic Link e redireciona autenticado |

### 3. Autenticação Third-Party (Social OAuth)
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/v1/client/oauth/:provider/authorize` | Inicia o fluxo PKCE (`google` ou `github`) |
| `GET` | `/v1/client/oauth/:provider/callback` | Callback de autorização com vinculação de conta automática |

### 4. Dispositivos & Sessões Ativas
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/v1/client/sessions` | Lista todas as sessões ativas com cidade, país, navegador e status |
| `POST` | `/v1/client/sessions/revoke-others` | Desconecta a conta de todos os outros aparelhos |
| `POST` | `/v1/client/sessions/:id/remove` | Efetua logout na sessão especificada |

### 5. Descoberta & JWKS
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/.well-known/jwks.json` | Chaves públicas de assinatura para verificação offline de tokens |
| `GET` | `/.well-known/openid-configuration` | Metadados do OpenID Connect Discovery |

### 6. Backend Admin API (`/v1/backend` - Requer `Authorization: Bearer sk_...`)
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/v1/backend/users` | Lista usuários com paginação |
| `POST` | `/v1/backend/users/:id/ban` | Suspende a conta e encerra todas as sessões ativas |
| `POST` | `/v1/backend/organizations` | Cria uma organização e atribui o criador como admin |

---

## 📄 Licença

MIT License.
