import assert from 'node:assert';
import { router } from '../src/router';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { en } from '../src/i18n/locales/en';

async function testAuthRouting() {
  console.log('🧪 Iniciando testes de validação de Rotas e Autenticação (/login)...');

  // 1. Validar que as rotas públicas existem e estão fora do _dashboard
  console.log('1. Validando estrutura das rotas públicas (/login, /reset-password, /accept-invitation)...');
  const routes = router.routesByPath as Record<string, any>;
  const publicRoutes = ['/login', '/reset-password', '/accept-invitation'];
  for (const path of publicRoutes) {
    assert.ok(routes[path], `A rota ${path} deve existir no router`);
    assert.strictEqual(
      routes[path].parentRoute?.id,
      '__root__',
      `A rota ${path} deve ser filha direta da raiz, fora de layouts protegidos`
    );
  }
  console.log('✅ Rotas públicas (/login, /reset-password, /accept-invitation) configuradas fora da dashboard!');

  // 2. Validar que as rotas da Dashboard estão aninhadas no layout protegido
  console.log('2. Validando rotas protegidas da Dashboard...');
  const dashboardRoutes = ['/', '/users', '/organizations', '/sessions', '/api-keys', '/audit-logs', '/webhooks'];
  for (const path of dashboardRoutes) {
    const route = routes[path];
    assert.ok(route, `A rota ${path} deve estar registrada`);
    assert.strictEqual(
      route.parentRoute?.id,
      '/_dashboard',
      `A rota ${path} deve ser filha de /_dashboard`
    );
  }
  console.log('✅ Todas as rotas da dashboard (/ , /users, /organizations, /sessions, /api-keys, /audit-logs, /webhooks) pertencem a _dashboard!');

  // 3. Validar chaves de tradução i18n para Login, 2FA, Reset Password e Convites
  console.log('3. Validando traduções i18n (pt-BR e en)...');
  assert.ok(ptBR.login.title, 'pt-BR deve conter login.title');
  assert.ok(ptBR.login.signInButton, 'pt-BR deve conter login.signInButton');
  assert.ok(ptBR.login.twoFactorTitle, 'pt-BR deve conter login.twoFactorTitle');
  assert.ok(ptBR.resetPassword.title, 'pt-BR deve conter resetPassword.title');
  assert.ok(ptBR.acceptInvitation.title, 'pt-BR deve conter acceptInvitation.title');
  assert.ok(ptBR.sidebar.users, 'pt-BR deve conter sidebar.users');
  assert.ok(ptBR.sidebar.organizations, 'pt-BR deve conter sidebar.organizations');
  assert.ok(ptBR.sidebar.sessions, 'pt-BR deve conter sidebar.sessions');
  assert.ok(ptBR.sidebar.apiKeys, 'pt-BR deve conter sidebar.apiKeys');
  assert.ok(ptBR.sidebar.auditLogs, 'pt-BR deve conter sidebar.auditLogs');
  assert.ok(ptBR.sidebar.webhooks, 'pt-BR deve conter sidebar.webhooks');

  assert.ok(en.login.title, 'en deve conter login.title');
  assert.ok(en.login.signInButton, 'en deve conter login.signInButton');
  assert.ok(en.login.twoFactorTitle, 'en deve conter login.twoFactorTitle');
  assert.ok(en.resetPassword.title, 'en deve conter resetPassword.title');
  assert.ok(en.acceptInvitation.title, 'en deve conter acceptInvitation.title');
  assert.ok(en.sidebar.users, 'en deve conter sidebar.users');
  assert.ok(en.sidebar.organizations, 'en deve conter sidebar.organizations');
  assert.ok(en.sidebar.sessions, 'en deve conter sidebar.sessions');
  assert.ok(en.sidebar.apiKeys, 'en deve conter sidebar.apiKeys');
  assert.ok(en.sidebar.auditLogs, 'en deve conter sidebar.auditLogs');
  assert.ok(en.sidebar.webhooks, 'en deve conter sidebar.webhooks');
  console.log('✅ Dicionários de internacionalização i18n validados com sucesso!');

  console.log('\n🎉 TODOS OS TESTES DE ROTEAMENTO E AUTH PASSARAM COM SUCESSO!\n');
}

testAuthRouting().catch((err) => {
  console.error('❌ Falha nos testes de roteamento:', err);
  process.exit(1);
});
