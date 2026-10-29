import type { Bindings } from "@/types/env";

export interface WebhookEvent<T = any> {
  id: string;
  event: string;
  createdAt: number;
  data: T;
}

/**
 * Calculates HMAC-SHA256 hex signature using standard Web Crypto API.
 */
export async function signWebhookPayload(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Dispatches an event to the configured external webhook URL.
 * Non-blocking, signed with HMAC-SHA256 via X-Edgekit-Signature header.
 */
export async function dispatchWebhook(
  env: Bindings,
  event: { event: string; data: any }
): Promise<void> {
  if (!env.WEBHOOK_URL) return;

  const payload: WebhookEvent = {
    id: `evt_${crypto.randomUUID()}`,
    event: event.event,
    createdAt: Date.now(),
    data: event.data,
  };

  const payloadStr = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Edgekit-Auth-Webhooks/1.0",
  };

  if (env.WEBHOOK_SECRET) {
    const signature = await signWebhookPayload(env.WEBHOOK_SECRET, payloadStr);
    headers["X-Edgekit-Signature"] = signature;
  }

  try {
    await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers,
      body: payloadStr,
    });
  } catch (err: any) {
    console.error(`[Webhook] Falha ao despachar evento '${event.event}':`, err.message);
  }
}
