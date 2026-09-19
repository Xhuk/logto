import { tenantFeaturesGuard } from '@logto/schemas';

import koaGuard from '#src/middleware/koa-guard.js';

import type { ManagementApiRouter, RouterInitArgs } from './types.js';

/**
 * Expose the current tenant's feature flags so the admin console can gate UI sections per tenant.
 */
export default function tenantFeaturesRoutes<T extends ManagementApiRouter>(
  ...[router, { features }]: RouterInitArgs<T>
) {
  router.get(
    '/tenant-features',
    koaGuard({ response: tenantFeaturesGuard, status: 200 }),
    async (ctx, next) => {
      ctx.body = features;

      return next();
    }
  );
}
