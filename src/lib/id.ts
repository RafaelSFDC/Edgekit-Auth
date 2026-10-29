/**
 * Clerk-style prefixed ID generator using Web Crypto API.
 */
export type IdPrefix = "user" | "sess" | "idn" | "org" | "orgmem" | "inv" | "verif";

export function generateId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  // Convert to base64url-like alphanumeric characters
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let randomString = "";
  for (let i = 0; i < bytes.length; i++) {
    randomString += chars[bytes[i] % chars.length];
  }
  
  return `${prefix}_${randomString}`;
}
