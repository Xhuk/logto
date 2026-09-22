import { logtoConfigGuards, LogtoTenantConfigKey } from '@logto/schemas';
import { appendPath, trySafe } from '@silverhand/essentials';
import type { MiddlewareType } from 'koa';
import type { IRouterParamContext } from 'koa-router';
import type { Provider } from 'oidc-provider';

import { EnvSet, getTenantEndpoint, type TenantEndpointValues } from '#src/env-set/index.js';
import RequestError from '#src/errors/RequestError/index.js';
import type Queries from '#src/tenants/Queries.js';
import { productAuthEndpoint } from '#src/utils/product-auth.js';
import { getTenantId } from '#src/utils/tenant.js';

// Need To Align With UI
export const sessionNotFoundPath = '/unknown-session';

/**
 * A product host must stay on `https://{host}/auth`. The path-based tenant
 * endpoint is the staff host, and sending the browser there exposes Tailscale.
 */
export const sessionNotFoundLocation = (
  url: URL,
  hostname: string,
  tenantId: string,
  isCustomDomain: boolean,
  values: TenantEndpointValues
): string => {
  if (isCustomDomain && values.isPathBasedMultiTenancy) {
    return appendPath(new URL(productAuthEndpoint(url)), sessionNotFoundPath).href;
  }

  const tenantEndpoint = getTenantEndpoint(tenantId, values);

  if (values.isDomainBasedMultiTenancy) {
    // Host header, not `url.hostname`: a request URL can already be absolute.
    // eslint-disable-next-line @silverhand/fp/no-mutation
    tenantEndpoint.hostname = hostname;
  }

  return appendPath(tenantEndpoint, sessionNotFoundPath).href;
};

export const guardedPath = [
  '/sign-in',
  '/consent',
  '/register',
  '/single-sign-on',
  '/social/register',
  '/forgot-password',
];

export default function koaSpaSessionGuard<
  StateT,
  ContextT extends IRouterParamContext,
  ResponseBodyT,
>(provider: Provider, queries: Queries): MiddlewareType<StateT, ContextT, ResponseBodyT> {
  return async (ctx, next) => {
    const requestPath = ctx.request.path;
    const isPreview = ctx.request.URL.searchParams.get('preview');

    const isSessionRequiredPath =
      requestPath === '/' || guardedPath.some((path) => requestPath.startsWith(path));

    if (isSessionRequiredPath && !isPreview) {
      try {
        await provider.interactionDetails(ctx.req, ctx.res);
      } catch {
        // For unknown session, check if there is a redirect URL set in the SignInExperience
        const { unknownSessionRedirectUrl } =
          await queries.signInExperiences.findDefaultSignInExperience();

        if (unknownSessionRedirectUrl) {
          ctx.redirect(unknownSessionRedirectUrl);

          return;
        }

        // If not, check if there is a redirect URL set in the tenant level LogtoConfigs
        const {
          rows: [data],
        } = await queries.logtoConfigs.getRowsByKeys([
          LogtoTenantConfigKey.SessionNotFoundRedirectUrl,
        ]);
        const parsed = trySafe(() =>
          logtoConfigGuards.sessionNotFoundRedirectUrl.parse(data?.value)
        );

        if (parsed?.url) {
          ctx.redirect(parsed.url);

          return;
        }

        // Redirect to the tenant's own session not found page
        const [tenantId, isCustomDomain] = await getTenantId(ctx.URL);

        if (!tenantId) {
          throw new RequestError({ code: 'session.not_found', status: 404 });
        }

        ctx.redirect(
          sessionNotFoundLocation(
            ctx.URL,
            ctx.request.hostname,
            tenantId,
            isCustomDomain,
            EnvSet.values
          )
        );

        return;
      }
    }

    return next();
  };
}
