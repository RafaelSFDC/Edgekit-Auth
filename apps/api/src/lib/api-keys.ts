import type { Database } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

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
  prefix: string;
}

/**
 * Generates a cryptographically secure M2M API Key.
 * Example: ek_live_4a79b291c840...
 */
export async function generateApiKey(prefix: "ek_live" | "ek_test" = "ek_live"): Promise<GeneratedApiKey> {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const rawKey = `${prefix}_${randomHex}`;
  const keyHash = await hashApiKey(rawKey);
  const displayKey = `${prefix}_${randomHex.slice(0, 6)}...${randomHex.slice(-4)}`;

  return {
    rawKey,
    keyHash,
    displayKey,
    prefix,
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
