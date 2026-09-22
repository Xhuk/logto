import type { MiddlewareType } from 'koa';

import { rewriteProductAuthSetCookie } from '#src/utils/product-auth.js';

/** Rewrite IdP `Set-Cookie` paths after the tenant app has written them. */
export default function koaProductAuthCookies(): MiddlewareType {
  return async (ctx, next) => {
    await next();

    const header = ctx.response.headers['set-cookie'];

    if (!header) {
      return;
    }

    const values = (Array.isArray(header) ? header : [header]).map((value) =>
      rewriteProductAuthSetCookie(value)
    );

    ctx.set('set-cookie', values);
  };
}
