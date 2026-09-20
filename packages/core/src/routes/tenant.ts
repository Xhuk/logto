import { tenantFeaturesGuard, TenantTag } from '@logto/schemas';
import { z } from 'zod';

import { tenantResponseGuard } from '#src/libraries/tenant.js';
import koaGuard from '#src/middleware/koa-guard.js';

import type { ManagementApiRouter, RouterInitArgs } from './types.js';

export default function tenantRoutes<T extends ManagementApiRouter>(
  ...[router, { libraries }]: RouterInitArgs<T>
) {
  const { tenants } = libraries;

  router.get(
    '/tenants',
    koaGuard({ response: tenantResponseGuard.array(), status: 200 }),
    async (ctx, next) => {
      ctx.body = await tenants.findAllTenants();

      return next();
    }
  );

  router.post(
    '/tenants',
    koaGuard({
      body: z.object({
        name: z.string().min(1),
        tag: z.nativeEnum(TenantTag).optional(),
        groupName: z.string().min(1).max(128).optional(),
      }),
      response: tenantResponseGuard,
      status: [201, 400],
    }),
    async (ctx, next) => {
      const { name, tag, groupName } = ctx.guard.body;
      ctx.status = 201;
      ctx.body = await tenants.createTenant({ name, tag, groupName });

      return next();
    }
  );

  router.get(
    '/tenants/:id',
    koaGuard({
      params: z.object({ id: z.string().min(1) }),
      response: tenantResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      ctx.body = await tenants.findTenantById(ctx.guard.params.id);

      return next();
    }
  );

  router.patch(
    '/tenants/:id',
    koaGuard({
      params: z.object({ id: z.string().min(1) }),
      body: z.object({
        name: z.string().min(1).optional(),
        tag: z.nativeEnum(TenantTag).optional(),
        groupName: z.string().min(1).max(128).optional(),
      }),
      response: tenantResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      ctx.body = await tenants.updateTenant(ctx.guard.params.id, ctx.guard.body);

      return next();
    }
  );

  router.patch(
    '/tenants/:id/features',
    koaGuard({
      params: z.object({ id: z.string().min(1) }),
      body: z.object({ features: tenantFeaturesGuard }),
      response: tenantResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      ctx.body = await tenants.setTenantFeatures(ctx.guard.params.id, ctx.guard.body.features);

      return next();
    }
  );

  router.post(
    '/tenants/:id/suspend',
    koaGuard({
      params: z.object({ id: z.string().min(1) }),
      body: z.object({ isSuspended: z.boolean() }),
      response: tenantResponseGuard,
      status: [200, 404],
    }),
    async (ctx, next) => {
      ctx.body = await tenants.setTenantSuspended(ctx.guard.params.id, ctx.guard.body.isSuspended);

      return next();
    }
  );

  router.delete(
    '/tenants/:id',
    koaGuard({
      params: z.object({ id: z.string().min(1) }),
      status: [204, 404],
    }),
    async (ctx, next) => {
      await tenants.deleteTenant(ctx.guard.params.id);
      ctx.status = 204;

      return next();
    }
  );
}
