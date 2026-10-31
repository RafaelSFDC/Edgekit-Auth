import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Code2,
  Copy,
  Check,
  KeyRound,
  Terminal,
  ShieldCheck,
  Zap,
  BookOpen,
  Server,
  Layers,
} from 'lucide-react';

export const QuickstartPage: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  // Fetch real API keys to pre-fill snippets
  const { data: apiKeysData } = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/admin/api-keys');
      if (!res.ok) return { apiKeys: [] };
      return res.json();
    },
  });

  const apiKeys: any[] = apiKeysData?.apiKeys || [];
  const publishableKey = apiKeys.find((k) => k.keyType === 'publishable' || k.prefix.startsWith('pk_'))?.displayKey || 'pk_live_seu_publishable_key';
  const secretKey = apiKeys.find((k) => k.keyType === 'secret' || k.prefix.startsWith('sk_') || k.prefix.startsWith('ek_'))?.displayKey || 'sk_live_seu_secret_key';
  const hostUrl = window.location.origin;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    toast.success('Código copiado para a área de transferência!');
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const nextJsSnippet = `// 1. Instalar o Client SDK
// pnpm add better-auth

// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "${hostUrl}",
  fetchOptions: {
    headers: {
      "x-edgekit-publishable-key": process.env.NEXT_PUBLIC_EDGEKIT_PUBLISHABLE_KEY || "${publishableKey}",
    },
  },
});

// 2. Usar em componentes React / Next.js
export function LoginButton() {
  const handleLogin = async () => {
    await authClient.signIn.email({
      email: "cliente@exemplo.com",
      password: "SenhaSuperSegura123!",
    });
  };

  return <button onClick={handleLogin}>Entrar no App</button>;
}`;

  const nodeJwksSnippet = `// 1. Instalar validador criptográfico JWKS
// pnpm add jose

// src/middlewares/auth.ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("${hostUrl}/.well-known/jwks.json")
);

export async function verifyEdgekitToken(bearerToken: string) {
  // Validação criptográfica 100% offline via algoritmo assimétrico EdDSA/RS256
  // Zero chamadas de rede ao banco de dados D1!
  const { payload } = await jwtVerify(bearerToken, JWKS, {
    issuer: "${hostUrl}",
  });

  return {
    userId: payload.sub,
    email: payload.email,
    roles: payload.roles as string[],
    permissions: payload.permissions as string[],
    orgId: payload.org_id as string,
    orgRole: payload.org_role as string,
    orgPermissions: payload.org_permissions as string[],
    plan: payload.plan as string,
    entitlements: payload.entitlements as string[],
  };
}`;

  const pythonSnippet = `# 1. Instalar bibliotecas
# pip install PyJWT[crypto] httpx

# auth.py
import jwt
from jwt import PyJWKClient

jwks_client = PyJWKClient("${hostUrl}/.well-known/jwks.json")

def verify_token(token: str):
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["EdDSA", "RS256"],
        issuer="${hostUrl}",
        options={"verify_aud": False}
    )
    return payload`;

  const curlSnippet = `# 1. Autenticar ou criar usuário via M2M Secret Key:
curl -X POST "${hostUrl}/api/auth/sign-in/email" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${secretKey}" \\
  -d '{
    "email": "usuario@exemplo.com",
    "password": "SenhaSegura123!"
  }'

# 2. Consultar catálogo público de planos e assinaturas:
curl "${hostUrl}/api/billing/plans"

# 3. Consultar chaves públicas JWKS para validação offline:
curl "${hostUrl}/.well-known/jwks.json"`;

  const advancedFeaturesSnippet = `// ==========================================
// 1. Auto-serviço do Usuário: Perfil & Preferências
// ==========================================
// GET /api/v1/users/me (Retorna perfil, preferências, unsafeMetadata, roles)
const meRes = await fetch("${hostUrl}/api/v1/users/me", {
  headers: {
    "Authorization": "Bearer " + sessionToken, // ou cookies de sessão
  },
});
const { user } = await meRes.json();

// PATCH /api/v1/users/me (Atualizar preferências e unsafeMetadata)
await fetch("${hostUrl}/api/v1/users/me", {
  method: "PATCH",
  headers: {
    "Authorization": "Bearer " + sessionToken,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    locale: "pt-BR",
    theme: "dark",
    preferences: { emailNotifications: true, defaultView: "compact" },
    unsafeMetadata: { onboardingStep: 3 },
  }),
});

// ==========================================
// 2. Login com Username ou E-mail
// ==========================================
await authClient.signIn.username({
  username: "alice_dev",
  password: "AlicePassword123!",
});

// ==========================================
// 3. Login sem senha por Telefone (SMS OTP)
// ==========================================
// Enviar código de 6 dígitos via SMS
await authClient.phoneNumber.sendOtp({
  phoneNumber: "+5511999999999",
});

// Verificar código e criar sessão
await authClient.phoneNumber.verify({
  phoneNumber: "+5511999999999",
  code: "123456",
});

// ==========================================
// 4. Usuários Anônimos / Visitantes (Guest Checkout)
// ==========================================
// Criar sessão de visitante anônimo imediatamente
await authClient.signIn.anonymous();
// Converter para conta permanente no checkout / cadastro posterior
await authClient.signUp.email({
  email: "novo_usuario@exemplo.com",
  password: "SenhaDefinitiva123!",
  name: "Usuário Convertido",
});`;

  return (
    <PageLayout>
      <PageHeader
        title="Quickstart & SDKs"
        description="Integre o Edgekit Auth ao seu frontend e backend em minutos com paridade total ao padrão Clerk."
      />

      <div className="grid gap-6">
        {/* Banner de Visão de Infraestrutura */}
        <Card className="border-indigo-500/20 bg-gradient-to-r from-indigo-500/10 via-background to-background">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                    Arquitetura Externa
                  </Badge>
                  <h3 className="font-semibold text-lg">Serviço de Autenticação como Infraestrutura</h3>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  O Edgekit Auth roda no Edge da Cloudflare com validação offline de tokens JWKS.
                  Seus frontends consomem a <strong>Publishable Key</strong> e seus backends verificam permissões localmente sem latência.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('/docs', '_blank')}
                  className="gap-2"
                >
                  <BookOpen className="size-4" /> Swagger UI
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chaves Rápidas do Projeto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 border-muted">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Publishable Key (Frontend)
                </span>
              </div>
              <Badge variant="secondary" className="text-[10px]">CORS Protected</Badge>
            </div>
            <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border font-mono text-xs">
              <span className="truncate mr-2">{publishableKey}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => copyToClipboard(publishableKey, 'pubkey')}
              >
                {copiedIndex === 'pubkey' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </Card>

          <Card className="p-4 border-muted">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-indigo-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Secret Key (Backend M2M)
                </span>
              </div>
              <Badge variant="destructive" className="text-[10px]">Confidencial</Badge>
            </div>
            <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border font-mono text-xs">
              <span className="truncate mr-2">{secretKey}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => copyToClipboard(secretKey, 'seckey')}
              >
                {copiedIndex === 'seckey' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </Card>
        </div>

        {/* Abas de Integração por Tecnologia */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="size-5 text-indigo-500" /> Guias de Código Prontos para Uso
            </CardTitle>
            <CardDescription>
              Copie os exemplos configurados com o domínio desta instância e suas credenciais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="nextjs" className="w-full">
              <TabsList className="grid grid-cols-5 w-full max-w-2xl mb-4">
                <TabsTrigger value="nextjs" className="gap-1.5 text-xs">
                  <Zap className="size-3.5 text-sky-400" /> Next.js / React
                </TabsTrigger>
                <TabsTrigger value="node" className="gap-1.5 text-xs">
                  <Server className="size-3.5 text-emerald-400" /> Node / Express
                </TabsTrigger>
                <TabsTrigger value="python" className="gap-1.5 text-xs">
                  <Layers className="size-3.5 text-amber-400" /> Python FastAPI
                </TabsTrigger>
                <TabsTrigger value="curl" className="gap-1.5 text-xs">
                  <Terminal className="size-3.5 text-purple-400" /> cURL / M2M
                </TabsTrigger>
                <TabsTrigger value="advanced" className="gap-1.5 text-xs">
                  <ShieldCheck className="size-3.5 text-pink-400" /> Preferências & Features
                </TabsTrigger>
              </TabsList>

              <TabsContent value="nextjs" className="space-y-3">
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
                    {nextJsSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5 text-xs bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
                    onClick={() => copyToClipboard(nextJsSnippet, 'nextjs')}
                  >
                    {copiedIndex === 'nextjs' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copiar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="node" className="space-y-3">
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
                    {nodeJwksSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5 text-xs bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
                    onClick={() => copyToClipboard(nodeJwksSnippet, 'node')}
                  >
                    {copiedIndex === 'node' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copiar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="python" className="space-y-3">
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
                    {pythonSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5 text-xs bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
                    onClick={() => copyToClipboard(pythonSnippet, 'python')}
                  >
                    {copiedIndex === 'python' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copiar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="curl" className="space-y-3">
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
                    {curlSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5 text-xs bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
                    onClick={() => copyToClipboard(curlSnippet, 'curl')}
                  >
                    {copiedIndex === 'curl' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copiar
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-3">
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
                    {advancedFeaturesSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-3 right-3 gap-1.5 text-xs bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
                    onClick={() => copyToClipboard(advancedFeaturesSnippet, 'advanced')}
                  >
                    {copiedIndex === 'advanced' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copiar
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
};
