import type { Bindings } from "@/types/env";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  env: Bindings;
}

/**
 * Unified Edge-native email sender.
 * If RESEND_API_KEY is configured, sends via Resend REST API.
 * Otherwise, outputs a structured developer preview banner in the console.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  env,
}: SendEmailOptions): Promise<boolean> {
  if (env.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL || "Edgekit Auth <onboarding@resend.dev>",
          to,
          subject,
          html,
          text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Email] Falha ao enviar para ${to} via Resend:`, errorText);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`[Email] Erro de rede ao conectar com Resend:`, err);
      return false;
    }
  }

  // Local / Dev Fallback Console Banner
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ ✉️  [DEV EMAIL PREVIEW]
│ Para:    ${to}
│ Assunto: ${subject}
├─────────────────────────────────────────────────────────────┤
│ ${text || subject}
└─────────────────────────────────────────────────────────────┘
`);
  return true;
}

/**
 * Email template: Magic Link
 */
export async function sendMagicLinkEmail({
  email,
  url,
  env,
}: {
  email: string;
  url: string;
  env: Bindings;
}) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Acesse sua conta - Edgekit Auth</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">Clique no botão abaixo para entrar sem senha com segurança:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${url}" style="background-color: #06b6d4; color: #020617; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block;">Entrar na Conta</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Se você não solicitou este link, pode ignorar este e-mail com segurança.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Seu link de acesso - Edgekit Auth",
    html,
    text: `Acesse sua conta pelo link: ${url}`,
    env,
  });
}

/**
 * Email template: Password Reset
 */
export async function sendPasswordResetEmail({
  email,
  url,
  env,
}: {
  email: string;
  url: string;
  env: Bindings;
}) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Redefinição de Senha</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">Recebemos uma solicitação para redefinir a senha da sua conta no Edgekit Auth.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${url}" style="background-color: #0284c7; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Redefinir Minha Senha</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Se você não solicitou a redefinição de senha, nenhuma ação é necessária.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Redefinição de Senha - Edgekit Auth",
    html,
    text: `Redefina sua senha acessando: ${url}`,
    env,
  });
}

/**
 * Email template: Email Verification
 */
export async function sendEmailVerificationEmail({
  email,
  url,
  env,
}: {
  email: string;
  url: string;
  env: Bindings;
}) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Confirme seu E-mail</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">Obrigado por criar sua conta! Por favor, confirme seu endereço de e-mail clicando abaixo:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${url}" style="background-color: #10b981; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Confirmar E-mail</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Este link expira em 24 horas.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Confirme seu endereço de e-mail - Edgekit Auth",
    html,
    text: `Confirme seu e-mail no link: ${url}`,
    env,
  });
}

/**
 * Email template: Organization Invitation
 */
export async function sendOrganizationInviteEmail({
  email,
  organizationName,
  inviterEmail,
  role,
  inviteUrl,
  env,
}: {
  email: string;
  organizationName: string;
  inviterEmail?: string;
  role: string;
  inviteUrl: string;
  env: Bindings;
}) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">Convite para Equipe</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">
        ${inviterEmail ? `<strong>${inviterEmail}</strong> convidou você` : "Você foi convidado"} para participar da organização <strong>${organizationName}</strong> com o papel de <code>${role}</code>.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteUrl}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Aceitar Convite</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Se você não esperava este convite, pode ignorar esta mensagem.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Convite para participar de ${organizationName} - Edgekit Auth`,
    html,
    text: `Você foi convidado para a organização ${organizationName}. Aceite pelo link: ${inviteUrl}`,
    env,
  });
}
