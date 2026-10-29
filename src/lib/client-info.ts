import type { Context } from "hono";
import type { AppContext } from "@/types/env";

export interface ParsedClientInfo {
  ipAddress: string;
  userAgent: string;
  city: string | null;
  country: string | null;
  deviceInfo: string;
}

export function parseClientInfo(c: Context<AppContext>): ParsedClientInfo {
  const userAgent = c.req.header("User-Agent") || "Unknown Device";
  const ipAddress =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("x-forwarded-for") ||
    "127.0.0.1";

  // Cloudflare edge headers
  const city = c.req.header("CF-IPCity") || null;
  const country = c.req.header("CF-IPCountry") || null;

  // Simple, lightweight regex device parsing (zero heavy external deps)
  let browser = "Browser";
  if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("Chrome/")) browser = "Chrome";
  else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) browser = "Safari";
  else if (userAgent.includes("Firefox/")) browser = "Firefox";

  let os = "Desktop";
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Macintosh") || userAgent.includes("Mac OS")) os = "macOS";
  else if (userAgent.includes("iPhone")) os = "iPhone";
  else if (userAgent.includes("iPad")) os = "iPad";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("Linux")) os = "Linux";

  const deviceInfo = `${browser} on ${os}`;

  return {
    ipAddress,
    userAgent,
    city,
    country,
    deviceInfo,
  };
}
