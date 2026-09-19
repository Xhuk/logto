import { z } from 'zod';

/** Known feature flags that can be toggled per tenant. */
export enum TenantFeature {
  Mfa = 'mfa',
  Organizations = 'organizations',
  EnterpriseSso = 'enterpriseSso',
  CustomJwt = 'customJwt',
  BringYourUi = 'bringYourUi',
  Actions = 'actions',
  SamlApplications = 'samlApplications',
  CustomDomains = 'customDomains',
  PasskeySignIn = 'passkeySignIn',
}

/** Per-tenant feature flags. A missing key means the feature is enabled by default. */
export type TenantFeatures = Record<string, boolean>;

export const tenantFeaturesGuard = z.record(z.string(), z.boolean());

/** Returns whether the given feature is enabled (a missing key is treated as enabled). */
export const isTenantFeatureEnabled = (
  features: TenantFeatures | undefined,
  feature: TenantFeature
): boolean => features === undefined || features[feature] !== false;
