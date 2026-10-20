import { SignInIdentifier, interactionIdentifierGuard } from '@logto/schemas';
import { z } from 'zod';

import { EnvSet } from '#src/env-set/index.js';
import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import { mintLoginHint } from '#src/routes/experience/classes/libraries/login-hint.js';
import { findUserByIdentifier } from '#src/routes/experience/classes/utils.js';
import assertThat from '#src/utils/assert-that.js';

import { type ManagementApiRouter, type RouterInitArgs } from './types.js';

const loginHintTokenResponseGuard = z.object({
  loginHintToken: z.string(),
  expiresIn: z.number(),
});

const loginHintTokenPayloadGuard = z.object({
  /**
   * The identifier the client already collected on its own screen. It is resolved to a user here
   * and never echoed back, so the raw value stops travelling with the browser.
   */
  identifier: interactionIdentifierGuard,
  /**
   * The application the token is minted for. The authorize request must use the same client, so a
   * token leaked from one product cannot start a password-only sign-in in another.
   */
  clientId: z.string().min(1),
  /**
   * The value of the browser binding cookie the client set before minting. The token stores only its
   * hash, and the authorize requires the browser's cookie to match, so a token forwarded to someone
   * else resolves to nothing: their browser does not carry the cookie. Required on purpose — a token
   * without a binding would work in any browser, which is the hole this closes.
   */
  binding: z.string().min(32),
});

/**
 * Mint an opaque, single-use sign-in hint: the contract for "the client already asked for the
 * identifier, so Katra should ask only for the password".
 *
 * Machine-to-machine only: the Management API bearer token is what makes the caller trustworthy
 * enough to declare who is signing in. This is a dev feature, so the route does not exist at all
 * while `isDevFeaturesEnabled` is off and no released behavior depends on it.
 */
export default function loginHintTokenRoutes<T extends ManagementApiRouter>(
  ...args: RouterInitArgs<T>
) {
  const [router, { queries }] = args;

  if (!EnvSet.values.isLoginHintTokenEnabled) {
    return;
  }

  router.post(
    '/login-hint-tokens',
    koaGuard({
      body: loginHintTokenPayloadGuard,
      response: loginHintTokenResponseGuard,
      status: [201, 404],
    }),
    async (ctx, next) => {
      const {
        guard: {
          body: { identifier, clientId, binding },
        },
      } = ctx;

      // Reject an unknown application loudly instead of minting a token that the authorize step
      // would silently ignore.
      await queries.applications.findApplicationById(clientId);

      const user = await findUserByIdentifier(queries, identifier);

      assertThat(
        user,
        new RequestError(
          {
            code: 'user.user_not_exist',
            status: 404,
            // Inside the error object so `RequestError.toBody` interpolates the phrase; a value in
            // the second argument is only the `data` payload and leaves `{{ identifier }}` raw.
            identifier: identifier.value,
          },
          { identifier: identifier.value }
        )
      );

      /**
       * Phone numbers are stored normalized, so mask the stored value: the confirmation has to
       * match what the account actually holds, not what the caller typed.
       */
      const resolvedIdentifier = {
        type: identifier.type,
        value:
          identifier.type === SignInIdentifier.Phone
            ? (user.primaryPhone ?? identifier.value)
            : identifier.value,
      };

      const { loginHintToken, expiresIn } = await mintLoginHint({
        queries,
        userId: user.id,
        clientId,
        identifier: resolvedIdentifier,
        binding,
      });

      ctx.status = 201;
      ctx.body = { loginHintToken, expiresIn };

      return next();
    }
  );
}
