import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { AppContext } from "@/types/env";

export const uiRoutes = new Hono<AppContext>();

/**
 * Shared HTML shell with Tailwind CSS and Inter font
 */
function renderHtmlShell(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR" class="h-full bg-slate-950 text-slate-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Hono Auth</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .auth-card {
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(51, 65, 85, 0.6);
    }
  </style>
</head>
<body class="h-full flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
  ${bodyContent}
</body>
</html>`;
}

/**
 * Sign In / Sign Up Page
 */
uiRoutes.get("/sign-in", (c) => {
  const redirectUrl = c.req.query("redirect_url") || "";
  const googleEnabled = Boolean(c.env.GOOGLE_CLIENT_ID);
  const githubEnabled = Boolean(c.env.GITHUB_CLIENT_ID);

  const googleAuthUrl = `/v1/client/oauth/google/authorize${
    redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""
  }`;
  const githubAuthUrl = `/v1/client/oauth/github/authorize${
    redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""
  }`;

  const content = `
  <div class="w-full max-w-md">
    <div class="auth-card rounded-2xl shadow-2xl p-8 sm:p-10">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white mb-4 shadow-lg shadow-indigo-500/25">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-white">Entrar na sua conta</h1>
        <p class="text-sm text-slate-400 mt-1">Acesse de forma rápida e segura</p>
      </div>

      <!-- OAuth Buttons -->
      <div class="space-y-3">
        ${
          googleEnabled
            ? `
        <a href="${googleAuthUrl}" class="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-sm font-medium text-slate-200 transition-all hover:border-slate-600 hover:shadow-md">
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continuar com Google
        </a>`
            : ""
        }

        ${
          githubEnabled
            ? `
        <a href="${githubAuthUrl}" class="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-sm font-medium text-slate-200 transition-all hover:border-slate-600 hover:shadow-md">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          Continuar com GitHub
        </a>`
            : ""
        }
      </div>

      <!-- Divider -->
      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-800"></div></div>
        <div class="relative flex justify-center text-xs uppercase"><span class="bg-slate-900 px-3 text-slate-500 font-medium">ou por e-mail</span></div>
      </div>

      <!-- Email Stage 1: Request Code -->
      <div id="email-stage-1">
        <form id="email-form" onsubmit="handleSendCode(event)" class="space-y-4">
          <div>
            <label for="email" class="block text-xs font-medium text-slate-300 mb-1.5">Endereço de e-mail</label>
            <input type="email" id="email" required placeholder="seu@email.com" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
          </div>
          <button type="submit" id="submit-btn" class="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center">
            <span>Continuar com E-mail</span>
          </button>
        </form>
      </div>

      <!-- Email Stage 2: Verify Code (Hidden by default) -->
      <div id="email-stage-2" class="hidden">
        <div class="text-center mb-4">
          <p class="text-xs text-slate-400">Digitamos o código de 6 dígitos enviado para <br><span id="sent-email-display" class="font-semibold text-slate-200"></span></p>
        </div>
        <form id="otp-form" onsubmit="handleVerifyOtp(event)" class="space-y-4">
          <div>
            <input type="text" id="otp-code" maxlength="6" pattern="[0-9]{6}" required placeholder="123456" class="w-full text-center tracking-[0.5em] text-2xl font-bold px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <button type="submit" id="verify-btn" class="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-600/30">
            Confirmar e Entrar
          </button>
          <div class="text-center">
            <button type="button" onclick="resetEmailForm()" class="text-xs text-slate-400 hover:text-slate-200 transition-colors">Voltar ou trocar e-mail</button>
          </div>
        </form>
      </div>

      <!-- Error Toast -->
      <div id="error-box" class="hidden mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center"></div>
    </div>
  </div>

  <script>
    const redirectUrl = "${redirectUrl}";
    let currentEmail = "";

    async function handleSendCode(e) {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const submitBtn = document.getElementById('submit-btn');
      const errorBox = document.getElementById('error-box');

      errorBox.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerText = "Enviando código...";

      try {
        const res = await fetch('/v1/client/email/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, redirect_url: redirectUrl })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.errors?.[0]?.message || 'Erro ao enviar código');
        }

        currentEmail = email;
        document.getElementById('sent-email-display').innerText = email;
        document.getElementById('email-stage-1').classList.add('hidden');
        document.getElementById('email-stage-2').classList.remove('hidden');
        document.getElementById('otp-code').focus();
      } catch (err) {
        errorBox.innerText = err.message;
        errorBox.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Continuar com E-mail";
      }
    }

    async function handleVerifyOtp(e) {
      e.preventDefault();
      const code = document.getElementById('otp-code').value.trim();
      const verifyBtn = document.getElementById('verify-btn');
      const errorBox = document.getElementById('error-box');

      errorBox.classList.add('hidden');
      verifyBtn.disabled = true;
      verifyBtn.innerText = "Verificando...";

      try {
        const res = await fetch('/v1/client/email/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, code, redirect_url: redirectUrl })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.errors?.[0]?.message || 'Código inválido ou expirado');
        }

        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          window.location.href = '/user-profile';
        }
      } catch (err) {
        errorBox.innerText = err.message;
        errorBox.classList.remove('hidden');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerText = "Confirmar e Entrar";
      }
    }

    function resetEmailForm() {
      document.getElementById('email-stage-2').classList.add('hidden');
      document.getElementById('email-stage-1').classList.remove('hidden');
      document.getElementById('error-box').classList.add('hidden');
    }
  </script>
  `;

  return c.html(renderHtmlShell("Entrar", content));
});

uiRoutes.get("/sign-up", (c) => {
  const redirectUrl = c.req.query("redirect_url");
  const target = `/sign-in${redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""}`;
  return c.redirect(target);
});

/**
 * User Profile & Session Security Page
 */
uiRoutes.get("/user-profile", (c) => {
  const content = `
  <div class="w-full max-w-2xl">
    <div class="auth-card rounded-2xl shadow-2xl p-8 sm:p-10">
      <!-- Loading Skeleton -->
      <div id="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
        <p class="text-xs text-slate-400 mt-3">Carregando dados da sua conta...</p>
      </div>

      <!-- Main Profile UI -->
      <div id="profile-content" class="hidden space-y-8">
        <!-- Header -->
        <div class="flex items-center justify-between pb-6 border-b border-slate-800">
          <div class="flex items-center gap-4">
            <div id="avatar" class="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold overflow-hidden border-2 border-indigo-500">
              ?
            </div>
            <div>
              <h1 id="user-name" class="text-xl font-bold text-white">Carregando...</h1>
              <p id="user-email" class="text-xs text-slate-400">email@exemplo.com</p>
            </div>
          </div>
          <button onclick="handleLogout()" class="px-4 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold transition-all">
            Sair da Conta
          </button>
        </div>

        <!-- Devices & Active Sessions (Clerk-like) -->
        <div>
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-sm font-semibold text-white">Aparelhos & Sessões Conectadas</h2>
              <p class="text-xs text-slate-400">Gerencie todos os locais onde sua conta está logada</p>
            </div>
            <button onclick="revokeOthers()" class="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-300 font-medium transition-all">
              Desconectar Outros
            </button>
          </div>

          <div id="sessions-list" class="space-y-2">
            <!-- Populated via JavaScript -->
          </div>
        </div>

        <!-- Linked Identities -->
        <div>
          <h2 class="text-sm font-semibold text-white mb-3">Métodos de Login Conectados</h2>
          <div id="identities-list" class="space-y-2">
            <!-- Populated via JavaScript -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentSessionId = "";

    async function loadProfile() {
      try {
        const res = await fetch('/v1/client/handshake');
        const data = await res.json();

        if (!data.user || !data.session) {
          window.location.href = '/sign-in';
          return;
        }

        currentSessionId = data.session.id;

        // Populate User Info
        const name = (data.user.firstName ? data.user.firstName + ' ' + (data.user.lastName || '') : data.user.primaryEmail).trim();
        document.getElementById('user-name').innerText = name;
        document.getElementById('user-email').innerText = data.user.primaryEmail || 'Sem e-mail cadastrado';

        if (data.user.imageUrl) {
          document.getElementById('avatar').innerHTML = '<img src="' + data.user.imageUrl + '" class="w-full h-full object-cover">';
        } else {
          document.getElementById('avatar').innerText = name.charAt(0).toUpperCase();
        }

        // Populate Identities
        const identitiesContainer = document.getElementById('identities-list');
        identitiesContainer.innerHTML = '';
        data.identities.forEach(idn => {
          const div = document.createElement('div');
          div.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs';
          div.innerHTML = '<span class="font-medium text-slate-200 capitalize">' + idn.provider + '</span><span class="text-slate-400">' + (idn.email || idn.providerUserId) + '</span>';
          identitiesContainer.appendChild(div);
        });

        // Load Active Sessions with Location
        loadSessions();

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('profile-content').classList.remove('hidden');
      } catch (err) {
        console.error(err);
        window.location.href = '/sign-in';
      }
    }

    async function loadSessions() {
      const res = await fetch('/v1/client/sessions');
      const data = await res.json();
      const container = document.getElementById('sessions-list');
      container.innerHTML = '';

      if (data.data) {
        data.data.forEach(s => {
          const div = document.createElement('div');
          div.className = 'flex items-center justify-between p-3.5 rounded-xl border ' + (s.isCurrent ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40') + ' text-xs';
          
          const location = (s.city ? s.city + ', ' : '') + (s.country || 'Localização Desconhecida');
          const device = s.deviceInfo || 'Navegador Web';

          div.innerHTML = '<div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-medium text-slate-200">' + device + '</span>' +
              (s.isCurrent ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Este Dispositivo</span>' : '') +
            '</div>' +
            '<p class="text-slate-400 text-[11px] mt-0.5">' + location + ' • IP: ' + (s.ipAddress || '127.0.0.1') + '</p>' +
          '</div>';

          container.appendChild(div);
        });
      }
    }

    async function revokeOthers() {
      if (confirm('Deseja desconectar sua conta de todos os outros aparelhos?')) {
        await fetch('/v1/client/sessions/revoke-others', { method: 'POST' });
        loadSessions();
      }
    }

    async function handleLogout() {
      if (currentSessionId) {
        await fetch('/v1/client/sessions/' + currentSessionId + '/remove', { method: 'POST' });
      }
      window.location.href = '/sign-in';
    }

    loadProfile();
  </script>
  `;

  return c.html(renderHtmlShell("Minha Conta", content));
});
