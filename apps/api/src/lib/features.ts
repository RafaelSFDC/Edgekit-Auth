import type { Bindings } from "@/types/env";

export interface FeatureFlags {
  billing: boolean;
  organizations: boolean;
  rbac: boolean;
  passkeys: boolean;
  mfa: boolean;
  emailOTP: boolean;
  magicLink: boolean;
}

/**
 * Returns strongly-typed feature flag states.
 * All flags default to `true` unless explicitly set to `"false"`.
 */
export function getFeatureFlags(env?: Partial<Bindings>): FeatureFlags {
  return {
    billing: env?.FEATURE_BILLING !== "false",
    organizations: env?.FEATURE_ORGANIZATIONS !== "false",
    rbac: env?.FEATURE_RBAC !== "false",
    passkeys: env?.FEATURE_PASSKEYS !== "false",
    mfa: env?.FEATURE_MFA !== "false",
    emailOTP: env?.FEATURE_EMAIL_OTP !== "false",
    magicLink: env?.FEATURE_MAGIC_LINK !== "false",
  };
}
