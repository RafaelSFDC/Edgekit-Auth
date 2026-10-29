export interface SendAuthEmailOptions {
  to: string;
  code: string;
  magicLinkUrl: string;
  resendApiKey?: string;
  fromEmail?: string;
  appName?: string;
}

export async function sendAuthEmail(options: SendAuthEmailOptions): Promise<void> {
  const appName = options.appName || "Hono Auth";
  const from = options.fromEmail || `${appName} <onboarding@resend.dev>`;

  if (options.resendApiKey) {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #111827; margin-top: 0;">Entrar no ${appName}</h2>
        <p style="color: #4b5563; font-size: 15px;">Use o código de verificação abaixo para continuar seu login:</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">${options.code}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px;">Ou se preferir, clique diretamente no botão para entrar sem senha:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${options.magicLinkUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Entrar com 1 Clique</a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px;">Este link e código expiram em 15 minutos. Se você não solicitou este login, pode ignorar esta mensagem.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: `Seu código de acesso: ${options.code}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Failed to send email via Resend:", err);
      // Fallback to console
    }
  }

  // Always log to console in development for zero-friction local testing
  console.log(`
┌──────────────────────────────────────────────────────────┐
│ 📧 [AUTH EMAIL] Enviado para: ${options.to.padEnd(26)} │
├──────────────────────────────────────────────────────────┤
│ Código de 6 dígitos: ${options.code.padEnd(31)} │
│ Magic Link:                                              │
│ ${options.magicLinkUrl.padEnd(56)} │
└──────────────────────────────────────────────────────────┘
  `);
}
