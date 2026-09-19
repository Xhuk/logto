import { describe, expect, it } from 'vitest';

import { isTenantFeatureEnabled, tenantFeaturesGuard, TenantFeature } from './tenant-features.js';

describe('isTenantFeatureEnabled', () => {
  it('treats a missing features map as enabled', () => {
    expect(isTenantFeatureEnabled(undefined, TenantFeature.Mfa)).toBe(true);
  });

  it('treats a missing key as enabled', () => {
    expect(isTenantFeatureEnabled({}, TenantFeature.Mfa)).toBe(true);
  });

  it('returns the flag value when defined', () => {
    expect(isTenantFeatureEnabled({ [TenantFeature.Mfa]: false }, TenantFeature.Mfa)).toBe(false);
    expect(isTenantFeatureEnabled({ [TenantFeature.Mfa]: true }, TenantFeature.Mfa)).toBe(true);
  });
});

describe('tenantFeaturesGuard', () => {
  it('parses a partial feature map', () => {
    expect(tenantFeaturesGuard.parse({ mfa: false, organizations: true })).toEqual({
      mfa: false,
      organizations: true,
    });
    expect(tenantFeaturesGuard.parse({})).toEqual({});
  });

  it('rejects non-boolean values', () => {
    expect(() => tenantFeaturesGuard.parse({ mfa: 'yes' })).toThrow();
  });
});
