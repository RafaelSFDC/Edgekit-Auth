import * as jose from "jose";

export interface TokenClaims {
  sub: string; // userId
  sid: string; // sessionId
  email?: string;
  org_id?: string;
  org_role?: string;
  [key: string]: unknown;
}

export interface KeyPairConfig {
  privateKeyPem?: string;
  publicKeyPem?: string;
  issuer?: string;
  audience?: string;
}

// In-memory cache for key pairs when running in the same worker instance
let cachedPrivateKey: jose.KeyLike | null = null;
let cachedPublicKey: jose.KeyLike | null = null;
let cachedJWKS: jose.JSONWebKeySet | null = null;
const DEFAULT_KID = "key_hono_auth_default";

export function normalizePem(pem: string): string {
  let cleaned = pem.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.includes("\\n")) {
    cleaned = cleaned.replace(/\\n/g, "\n");
  }
  return cleaned;
}

export async function getSigningKeys(config?: KeyPairConfig): Promise<{
  privateKey: jose.KeyLike;
  publicKey: jose.KeyLike;
}> {
  if (cachedPrivateKey && cachedPublicKey) {
    return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
  }

  if (config?.privateKeyPem && config?.publicKeyPem) {
    const priv = normalizePem(config.privateKeyPem);
    const pub = normalizePem(config.publicKeyPem);
    cachedPrivateKey = await jose.importPKCS8(priv, "ES256");
    cachedPublicKey = await jose.importSPKI(pub, "ES256");
    return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
  }

  // Generate an ephemeral ES256 key pair if not configured in env
  const { privateKey, publicKey } = await jose.generateKeyPair("ES256", {
    extractable: true,
  });

  cachedPrivateKey = privateKey;
  cachedPublicKey = publicKey;
  return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
}

export async function getJWKS(config?: KeyPairConfig): Promise<jose.JSONWebKeySet> {
  if (cachedJWKS) {
    return cachedJWKS;
  }

  const { publicKey } = await getSigningKeys(config);
  const jwk = await jose.exportJWK(publicKey);
  jwk.kid = DEFAULT_KID;
  jwk.use = "sig";
  jwk.alg = "ES256";

  cachedJWKS = {
    keys: [jwk],
  };

  return cachedJWKS;
}

export async function signSessionToken(
  claims: TokenClaims,
  config?: KeyPairConfig,
  expiresIn: string = "5m"
): Promise<string> {
  const { privateKey } = await getSigningKeys(config);
  const issuer = config?.issuer || "https://auth.local";
  const audience = config?.audience || "hono-auth-client";

  const jwt = await new jose.SignJWT({ ...claims })
    .setProtectedHeader({ alg: "ES256", kid: DEFAULT_KID, typ: "JWT" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(privateKey);

  return jwt;
}

export async function verifySessionToken(
  token: string,
  config?: KeyPairConfig
): Promise<jose.JWTPayload & TokenClaims> {
  const { publicKey } = await getSigningKeys(config);
  const issuer = config?.issuer || "https://auth.local";
  const audience = config?.audience || "hono-auth-client";

  const { payload } = await jose.jwtVerify(token, publicKey, {
    issuer,
    audience,
  });

  return payload as jose.JWTPayload & TokenClaims;
}
