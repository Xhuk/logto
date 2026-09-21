import RequestError from '#src/errors/RequestError/index.js';

import { maxCustomDomains } from '../constants/index.js';
import { type QuotaLibrary } from '../libraries/quota.js';

import assertThat from './assert-that.js';

/**
 * Checks if the given domain is a subdomain of a domain.
 */
export const isSubdomainOf = (subdomain: string, domain: string): boolean => {
  return subdomain.endsWith(`.${domain}`);
};

const normalizeHostname = (hostname: string): string =>
  hostname.trim().replace(/\.$/, '').toLowerCase();

/**
 * Concrete hostname that a self-hosted custom domain must CNAME to.
 *
 * Domain-based multi-tenancy sets `ENDPOINT` to a glob (`*.idp.example.com`). A CNAME
 * cannot target that glob, so the leading `*.` is stripped unless `override` is set
 * (env `DOMAIN_CNAME_TARGET`).
 */
export const resolveCustomDomainCnameTarget = (
  endpointHostname: string,
  override?: string
): string => {
  const trimmedOverride = override?.trim();

  if (trimmedOverride) {
    return normalizeHostname(trimmedOverride);
  }

  return normalizeHostname(endpointHostname.replace(/^\*\./, ''));
};

export const assertCustomDomainLimit = async ({
  isPrivateRegionFeature,
  quotaLibrary,
  existingDomainCount,
}: {
  isPrivateRegionFeature: boolean;
  quotaLibrary: QuotaLibrary;
  existingDomainCount: number;
}) => {
  /**
   * Special handling for private regions that previously had the custom domain feature enabled.
   *
   * Current rule: Each tenant in these regions is limited to `maxCustomDomains` custom domains (default: 10).
   * This is a temporary global cap applied uniformly across all tenants.
   *
   * Note: This limit will be revisited when custom development plan features are implemented,
   * allowing for tiered limits based on pricing plans.
   *
   * TODO: @xiaoyijun Remove this special case logic after custom dev plan feature support is implemented.
   */
  if (isPrivateRegionFeature) {
    assertThat(
      existingDomainCount < maxCustomDomains,
      new RequestError({
        code: 'domain.exceed_domain_limit',
        status: 422,
        limit: maxCustomDomains,
      })
    );
    return;
  }

  await quotaLibrary.guardTenantUsageByKey('customDomainsLimit');
};
