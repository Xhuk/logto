import { resolveCname } from 'node:dns/promises';

import {
  type CloudflareData,
  type Domain,
  DomainStatus,
  DomainVerificationFileContentType,
  type HostnameProviderData,
} from '@logto/schemas';
import { generateStandardId } from '@logto/shared';
import { trySafe } from '@silverhand/essentials';

import { EnvSet } from '#src/env-set/index.js';
import RequestError from '#src/errors/RequestError/index.js';
import type Queries from '#src/tenants/Queries.js';
import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
import {
  getCustomHostname,
  createCustomHostname,
  deleteCustomHostname,
  getFallbackOrigin,
  getDomainStatusFromCloudflareData,
} from '#src/utils/cloudflare/index.js';
import { isSubdomainOf } from '#src/utils/domain.js';
import { clearCustomDomainCache } from '#src/utils/tenant.js';

/**
 * Check whether a hostname has a CNAME record that points to the given target.
 *
 * Used to verify self-hosted custom domains when no hostname provider (Cloudflare) is configured:
 * the domain owner points a CNAME at this Logto endpoint and the domain becomes active once the
 * record resolves.
 */
const isDnsError = (error: unknown): error is { code?: string } =>
  typeof error === 'object' && error !== null && 'code' in error;

const isCnamePointingTo = async (hostname: string, target: string): Promise<boolean> => {
  try {
    const cnames = await resolveCname(hostname);

    return cnames.some((cname) => cname.replace(/\.$/, '').toLowerCase() === target.toLowerCase());
  } catch (error: unknown) {
    // No CNAME record yet means the domain is not verified; real DNS failures should propagate so
    // they are not silently misreported as "pending verification".
    if (isDnsError(error) && (error.code === 'ENOTFOUND' || error.code === 'ENODATA')) {
      return false;
    }

    throw error;
  }
};

export type DomainCleanupSummary = {
  scannedCount: number;
  deletedCount: number;
  skippedActiveCount: number;
  failedCount: number;
};

export type DomainLibrary = ReturnType<typeof createDomainLibrary>;

export const createDomainLibrary = (queries: Queries) => {
  const {
    domains: { updateDomainById, insertDomain, findAllDomains, findDomainById, deleteDomainById },
  } = queries;

  const syncDomainStatusFromCloudflareData = async (
    domain: Domain,
    cloudflareData: CloudflareData
  ): Promise<Domain> => {
    const status = getDomainStatusFromCloudflareData(cloudflareData);
    const {
      verification_errors: verificationErrors,
      ssl: { validation_errors: sslVerificationErrors },
    } = cloudflareData;

    const errorMessage: string = [
      ...(verificationErrors ?? []),
      ...(sslVerificationErrors ?? []).map(({ message }) => message),
    ]
      .filter(Boolean)
      .join('\n');

    return updateDomainById(domain.id, { cloudflareData, errorMessage, status }, 'replace');
  };

  const syncDomainStatus = async (domain: Domain): Promise<Domain> => {
    const { hostnameProviderConfig } = SystemContext.shared;

    // Self-hosted mode: without a hostname provider the status is driven by DNS verification
    // (see `verifyDomain`), so there is nothing to sync here.
    if (!hostnameProviderConfig) {
      return domain;
    }

    assertThat(domain.cloudflareData, 'domain.cloudflare_data_missing');

    const cloudflareData = await getCustomHostname(
      hostnameProviderConfig,
      domain.cloudflareData.id
    );

    const updatedDomain = await syncDomainStatusFromCloudflareData(domain, cloudflareData);

    await clearCustomDomainCache(domain.domain);
    return updatedDomain;
  };

  const addDomain = async (hostname: string): Promise<Domain> => {
    const { hostnameProviderConfig } = SystemContext.shared;

    // Self-hosted mode: no hostname provider (Cloudflare). Generate the DNS records and
    // verification files and let the domain owner configure them manually. The domain stays
    // `PendingVerification` until `verifyDomain` succeeds.
    if (!hostnameProviderConfig) {
      const insertedDomain = await insertDomain({
        domain: hostname,
        id: generateStandardId(),
        status: DomainStatus.PendingVerification,
        dnsRecords: [
          {
            type: 'CNAME',
            name: hostname,
            value: new URL(EnvSet.values.urlSet.endpoint).hostname,
          },
        ],
        verificationFiles: [
          {
            path: '/.well-known/logto-domain-verification.txt',
            content: generateStandardId(),
            contentType: DomainVerificationFileContentType.Text,
          },
        ],
      });
      await clearCustomDomainCache(hostname);
      return insertedDomain;
    }

    const { blockedDomains } = hostnameProviderConfig;
    assertThat(
      !(blockedDomains ?? []).some(
        (domain) => hostname === domain || isSubdomainOf(hostname, domain)
      ),
      'domain.domain_is_not_allowed'
    );

    const [fallbackOrigin, cloudflareData] = await Promise.all([
      getFallbackOrigin(hostnameProviderConfig),
      createCustomHostname(hostnameProviderConfig, hostname),
    ]);

    const insertedDomain = await insertDomain({
      domain: hostname,
      id: generateStandardId(),
      cloudflareData,
      status: DomainStatus.PendingVerification,
      dnsRecords: [
        {
          type: 'CNAME',
          name: hostname,
          value: fallbackOrigin,
        },
      ],
    });
    await clearCustomDomainCache(hostname);
    return insertedDomain;
  };

  const deleteDomain = async (id: string) => {
    const { hostnameProviderConfig } = SystemContext.shared;

    const domain = await findDomainById(id);

    if (hostnameProviderConfig && domain.cloudflareData?.id) {
      try {
        await deleteCustomHostname(hostnameProviderConfig, domain.cloudflareData.id);
      } catch (error: unknown) {
        // Ignore not found error, since we are deleting the domain anyway
        if (!(error instanceof RequestError) || error.code !== 'domain.cloudflare_not_found') {
          throw error;
        }
      }
    }

    await deleteDomainById(id);
    await clearCustomDomainCache(domain.domain);
  };

  /**
   * Self-hosted cleanup: there is no hostname provider to reconcile against, so only stale,
   * non-active domains are removed.
   */
  const cleanupStaleSelfHostedDomains = async (
    staleBefore: number,
    domains: readonly Domain[],
    summary: DomainCleanupSummary
  ): Promise<void> => {
    /* eslint-disable no-await-in-loop, @silverhand/fp/no-mutation */
    for (const domain of domains) {
      if (domain.status === DomainStatus.Active) {
        summary.skippedActiveCount += 1;
        continue;
      }

      if (domain.createdAt >= staleBefore) {
        continue;
      }

      try {
        await deleteDomain(domain.id);
        summary.deletedCount += 1;
      } catch {
        summary.failedCount += 1;
      }
    }
    /* eslint-enable no-await-in-loop, @silverhand/fp/no-mutation */
  };

  const cleanupCloudflareDomains = async (
    hostnameProviderConfig: HostnameProviderData,
    staleBefore: number,
    domains: readonly Domain[],
    summary: DomainCleanupSummary
  ): Promise<void> => {
    // Process domains sequentially to avoid Cloudflare rate limits
    /* eslint-disable no-await-in-loop, @silverhand/fp/no-mutation, @silverhand/fp/no-let */
    for (const domain of domains) {
      // Orphan record without Cloudflare data, delete from DB
      if (!domain.cloudflareData) {
        try {
          await deleteDomainById(domain.id);
          await clearCustomDomainCache(domain.domain);
          summary.deletedCount += 1;
        } catch {
          summary.failedCount += 1;
        }
        continue;
      }

      // Check real-time status from Cloudflare (source of truth)
      let cloudflareData: CloudflareData;
      try {
        cloudflareData = await getCustomHostname(hostnameProviderConfig, domain.cloudflareData.id);
      } catch (error: unknown) {
        // Hostname already gone from Cloudflare, clean up DB record
        if (error instanceof RequestError && error.code === 'domain.cloudflare_not_found') {
          try {
            await deleteDomainById(domain.id);
            await clearCustomDomainCache(domain.domain);
            summary.deletedCount += 1;
          } catch {
            summary.failedCount += 1;
          }
          continue;
        }
        summary.failedCount += 1;
        continue;
      }

      const status = getDomainStatusFromCloudflareData(cloudflareData);

      // Active in Cloudflare, sync DB status and skip
      if (status === DomainStatus.Active) {
        await trySafe(async () => syncDomainStatusFromCloudflareData(domain, cloudflareData));
        summary.skippedActiveCount += 1;
        continue;
      }

      // Non-active but created recently, skip
      if (domain.createdAt >= staleBefore) {
        continue;
      }

      // Stale non-active domain, delete from both Cloudflare and DB
      try {
        await deleteDomain(domain.id);
        summary.deletedCount += 1;
      } catch {
        summary.failedCount += 1;
      }
    }
    /* eslint-enable no-await-in-loop, @silverhand/fp/no-mutation, @silverhand/fp/no-let */
  };

  const cleanupDomains = async (staleDays: number): Promise<DomainCleanupSummary> => {
    const { hostnameProviderConfig } = SystemContext.shared;

    const staleBefore = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    const domains = await findAllDomains();
    const summary: DomainCleanupSummary = {
      scannedCount: domains.length,
      deletedCount: 0,
      skippedActiveCount: 0,
      failedCount: 0,
    };

    if (!hostnameProviderConfig) {
      await cleanupStaleSelfHostedDomains(staleBefore, domains, summary);

      return summary;
    }

    assertThat(hostnameProviderConfig, 'domain.not_configured');
    await cleanupCloudflareDomains(hostnameProviderConfig, staleBefore, domains, summary);

    return summary;
  };

  const verifyDomain = async (domain: Domain): Promise<Domain> => {
    const { hostnameProviderConfig } = SystemContext.shared;

    // Cloudflare-managed domains are verified through the provider.
    if (hostnameProviderConfig) {
      return syncDomainStatus(domain);
    }

    if (domain.status === DomainStatus.Active) {
      return domain;
    }

    const target = new URL(EnvSet.values.urlSet.endpoint).hostname;
    const isVerified = await isCnamePointingTo(domain.domain, target);

    if (!isVerified) {
      return domain;
    }

    const updatedDomain = await updateDomainById(
      domain.id,
      { status: DomainStatus.Active },
      'replace'
    );
    await clearCustomDomainCache(domain.domain);
    return updatedDomain;
  };

  return {
    syncDomainStatus,
    verifyDomain,
    addDomain,
    deleteDomain,
    cleanupDomains,
  };
};
