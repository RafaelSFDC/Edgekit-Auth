import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "@/types/env";
import { AuthService } from "@/services/auth.service";
import { sendAuthEmail } from "@/lib/email";
import { parseClientInfo } from "@/lib/client-info";

export const emailAuthRoutes = new Hono<AppContext>();

const sendEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  redirect_url: z.string().optional(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
  redirect_url: z.string().optional(),
});

/**
 * Send 6-digit OTP code and Magic Link to user's email
 */
emailAuthRoutes.post("/v1/client/email/send-code", async (c) => {
  const body = await c.req.json();
  const parsed = sendEmailSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.errors[0]?.message || "Invalid email payload",
    });
  }

  const { email, redirect_url } = parsed.data;
  const db = c.get("db");
  const appUrl = c.env.APP_URL || "http://localhost:8787";

  const { code, rawToken } = await AuthService.createEmailVerification(db, email);

  let magicLinkUrl = `${appUrl}/v1/client/email/verify-link?email=${encodeURIComponent(
    email
  )}&token=${rawToken}`;
  if (redirect_url) {
    magicLinkUrl += `&redirect_url=${encodeURIComponent(redirect_url)}`;
  }

  await sendAuthEmail({
    to: email,
    code,
    magicLinkUrl,
    resendApiKey: c.env.RESEND_API_KEY,
    fromEmail: c.env.FROM_EMAIL,
  });

  return c.json({
    success: true,
    message: "Verification code sent to your email",
  });
});

/**
 * Verify 6-digit OTP code and authenticate user
 */
emailAuthRoutes.post("/v1/client/email/verify-code", async (c) => {
  const body = await c.req.json();
  const parsed = verifyOtpSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.errors[0]?.message || "Invalid code payload",
    });
  }

  const { email, code, redirect_url } = parsed.data;
  const db = c.get("db");

  const isValid = await AuthService.verifyEmailOtp(db, email, code);
  if (!isValid) {
    throw new HTTPException(400, {
      message: "Invalid or expired verification code",
    });
  }

  const clientInfo = parseClientInfo(c);
  const jwtConfig = {
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
    publicKeyPem: c.env.JWT_PUBLIC_KEY_PEM,
    privateKeyPem: c.env.JWT_PRIVATE_KEY_PEM,
  };

  const result = await AuthService.handleEmailLogin(
    db,
    email,
    clientInfo,
    jwtConfig
  );

  const isSecure = c.env.ENVIRONMENT !== "development";

  setCookie(c, "__session", result.token, {
    maxAge: 300,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
  });

  setCookie(c, "__refresh", `${result.session.id}:${result.refreshToken}`, {
    maxAge: 30 * 86400,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
  });

  return c.json({
    user: result.user,
    session: result.session,
    token: result.token,
    refreshToken: result.refreshToken,
    redirectUrl: redirect_url || null,
  });
});

/**
 * Verify Magic Link from email click
 */
emailAuthRoutes.get("/v1/client/email/verify-link", async (c) => {
  const email = c.req.query("email");
  const token = c.req.query("token");
  const redirectUrl = c.req.query("redirect_url");

  if (!email || !token) {
    throw new HTTPException(400, {
      message: "Missing 'email' or 'token' in magic link",
    });
  }

  const db = c.get("db");
  const isValid = await AuthService.verifyMagicLink(db, email, token);

  if (!isValid) {
    throw new HTTPException(400, {
      message: "Invalid or expired magic link. Please request a new one.",
    });
  }

  const clientInfo = parseClientInfo(c);
  const jwtConfig = {
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
    publicKeyPem: c.env.JWT_PUBLIC_KEY_PEM,
    privateKeyPem: c.env.JWT_PRIVATE_KEY_PEM,
  };

  const result = await AuthService.handleEmailLogin(
    db,
    email,
    clientInfo,
    jwtConfig
  );

  const isSecure = c.env.ENVIRONMENT !== "development";

  setCookie(c, "__session", result.token, {
    maxAge: 300,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
  });

  setCookie(c, "__refresh", `${result.session.id}:${result.refreshToken}`, {
    maxAge: 30 * 86400,
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
  });

  if (redirectUrl) {
    return c.redirect(redirectUrl);
  }

  return c.redirect("/user-profile");
});
