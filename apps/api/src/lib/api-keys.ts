import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export type ApiKeyPrefix = "pk_live" | "pk_test" | "sk_live" | "sk_test" | "ek_live" | "ek_test";

/**
 * Calculates SHA-256 hex digest using Web Crypto API.
 */
export async function hashApiKey(rawKey: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(rawKey));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface GeneratedApiKey {
  rawKey: string;
  keyHash: string;
  displayKey: string;
  prefix: ApiKeyPrefix;
  keyType: "publishable" | "secret";
  environment: "live" | "test";
}

/**
 * Generates a cryptographically secure API Key (Publishable or Secret).
 * Examples:
 * - pk_live_4a79b291c840... (Publishable Key for Client SPAs/Mobile)
 * - sk_live_4a79b291c840... (Secret Key for Backend M2M APIs)
 */
export async function generateApiKey(prefix: ApiKeyPrefix = "sk_live"): Promise<GeneratedApiKey> {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const rawKey = `${prefix}_${randomHex}`;
  const keyHash = await hashApiKey(rawKey);
  const displayKey = `${prefix}_${randomHex.slice(0, 6)}...${randomHex.slice(-4)}`;

  const isPublishable = prefix.startsWith("pk_");
  const isTest = prefix.endsWith("_test");

  return {
    rawKey,
    keyHash,
    displayKey,
    prefix,
    keyType: isPublishable ? "publishable" : "secret",
    environment: isTest ? "test" : "live",
  };
}

/**
 * Validates an incoming API Key and updates its lastUsedAt timestamp.
 */
export async function verifyApiKey(db: Database, rawKey: string): Promise<schema.ApiKey | null> {
  if (!rawKey || typeof rawKey !== "string") return null;

  const hash = await hashApiKey(rawKey.trim());
  const [keyRecord] = await db
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.keyHash, hash))
    .limit(1);

  if (!keyRecord) return null;

  // Check if revoked
  if (keyRecord.revokedAt) return null;

  // Check if expired
  if (keyRecord.expiresAt && keyRecord.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Update lastUsedAt asynchronously
  try {
    await db
      .update(schema.apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKey.id, keyRecord.id));
  } catch {
    // Non-blocking update
  }

  return keyRecord;
}

/**
 * Verifies a Publishable Key (pk_...) including Allowed Origins (CORS domain whitelist) check.
 */
export async function verifyPublishableKey(
  db: Database,
  rawKey: string,
  requestOrigin?: string
): Promise<{ valid: boolean; error?: string; apiKey?: schema.ApiKey }> {
  if (!rawKey.startsWith("pk_")) {
    return { valid: false, error: "Invalid publishable key format" };
  }

  const keyRecord = await verifyApiKey(db, rawKey);
  if (!keyRecord) {
    return { valid: false, error: "Publishable key not found or revoked" };
  }

  if (keyRecord.keyType !== "publishable") {
    return { valid: false, error: "Key is not a publishable key" };
  }

  // Check allowed origins if specified
  if (keyRecord.allowedOrigins && requestOrigin) {
    try {
      const allowed = JSON.parse(keyRecord.allowedOrigins) as string[];
      if (Array.isArray(allowed) && allowed.length > 0) {
        const originUrl = requestOrigin.toLowerCase();
        const isAllowed = allowed.some((domain) => {
          const d = domain.trim().toLowerCase();
          return d === "*" || originUrl === d || originUrl.endsWith(`.${d.replace(/^\*\./, "")}`);
        });

        if (!isAllowed) {
          return { valid: false, error: `Origin '${requestOrigin}' not allowed for this key` };
        }
      }
    } catch {
      // JSON parse error, pass through
    }
  }

  return { valid: true, apiKey: keyRecord };
}
