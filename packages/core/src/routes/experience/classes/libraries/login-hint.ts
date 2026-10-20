import { createHash } from 'node:crypto';

import { ExtraParamsKey, SignInIdentifier } from '@logto/schemas';
import { generateStandardId, maskEmail, maskPhone, maskUsername } from '@logto/shared';
import { addSeconds } from 'date-fns';

import { loginHintTokenExpiresIn, loginHintTokenPrefix } from '#src/constants/index.js';
import { type WithInteractionDetailsContext } from '#src/middleware/koa-interaction-details.js';
import { type LoginHint, type LoginHintPayload } from '#src/queries/login-hint.js';
import type Queries from '#src/tenants/Queries.js';

/**
 * The cookie that binds a sign-in hint to the browser that asked for it.
 *
 * The client sets it on the product's own host before minting (same registrable domain as Katra, so
 * the browser sends it here too) and forwards the same value as `binding` when minting. The token
 * stores only its hash, and every read of the hint requires the browser's cookie to hash to the same
 * value. That is what makes a forwarded link useless: the person who receives it does not carry the
 * cookie, so the hint is ignored and the normal sign-in is shown.
 *
 * It must be a cookie and never a query parameter: a value in the URL travels with the link, which is
 * the whole problem this binding exists to solve.
 */
export const loginHintBindingCookieName = '_sign_in_hint_binding';

export const hashLoginHintBinding = (binding: string) =>
  createHash('sha256').update(binding).digest('hex');

/**
 * The masked confirmation shown on the password-only screen. It is what the user recognizes
 * instead of the raw identifier, so it must never carry the full value.
 */
export const maskSignInIdentifier = (type: SignInIdentifier, value: string): string => {
  switch (type) {
    case SignInIdentifier.Email: {
      return maskEmail(value);
    }
    case SignInIdentifier.Phone: {
      return maskPhone(value);
    }
    case SignInIdentifier.Username: {
      return maskUsername(value);
    }
  }
};

type MintLoginHintOptions = {
  queries: Queries;
  userId: string;
  clientId: string;
  identifier: { type: SignInIdentifier; value: string };
  /** The value of the browser's binding cookie, forwarded by the client when minting. */
  binding: string;
};

/**
 * Mint a single-use, short-lived handle for "this client already knows who is signing in".
 *
 * The raw identifier is resolved to a user here and never written to the token payload: the client
 * keeps its own copy, Katra keeps the user, and the sign-in screen only ever renders the masked
 * confirmation. The browser binding is stored as a hash, so the row itself cannot be replayed.
 */
export const mintLoginHint = async ({
  queries,
  userId,
  clientId,
  identifier,
  binding,
}: MintLoginHintOptions) => {
  const id = `${loginHintTokenPrefix}${generateStandardId()}`;
  const payload: LoginHintPayload = {
    userId,
    clientId,
    identifierType: identifier.type,
    maskedIdentifier: maskSignInIdentifier(identifier.type, identifier.value),
    bindingHash: hashLoginHintBinding(binding),
  };

  // Opportunistic cleanup so dead hints never pile up without a scheduled job.
  await queries.loginHints.deleteExpiredLoginHints();
  await queries.loginHints.insertLoginHint({
    id,
    payload,
    expiresAt: addSeconds(new Date(), loginHintTokenExpiresIn).valueOf(),
  });

  return { loginHintToken: id, expiresIn: loginHintTokenExpiresIn };
};

/**
 * The hint token the current interaction was started with, if any.
 *
 * Reads the OIDC request parameters rather than the interaction storage on purpose: the token is
 * the client's assertion about this specific authorization request, and it must not be inherited
 * by a later interaction that happens not to carry it.
 */
export const getLoginHintToken = ({
  interactionDetails,
}: WithInteractionDetailsContext): string | undefined => {
  const token = interactionDetails.params[ExtraParamsKey.LoginHintToken];

  return typeof token === 'string' && token.length > 0 ? token : undefined;
};

/**
 * Resolve the interaction's hint token to a user id, or `undefined` when there is no token, the
 * token is unknown/expired/consumed, it was minted for a different application, or the browser does
 * not carry the cookie the token was bound to.
 *
 * The last check is the one that closes the forwarded-link vector: a token minted by A works only in
 * A's browser, because the binding lives in a cookie that never travels in the URL. Anything that
 * fails is ignored instead of rejected, so the caller falls back to the regular identifier sign-in,
 * which cannot grant anything the token would have granted.
 */
export const resolveLoginHint = async ({
  ctx,
  queries,
}: {
  ctx: WithInteractionDetailsContext & { cookies: { get: (name: string) => string | undefined } };
  queries: Queries;
}): Promise<LoginHint | undefined> => {
  const token = getLoginHintToken(ctx);

  if (!token) {
    return;
  }

  const hint = await queries.loginHints.findActiveLoginHint(token);

  if (!hint) {
    return;
  }

  const { client_id: clientId } = ctx.interactionDetails.params;

  if (typeof clientId !== 'string' || clientId !== hint.clientId) {
    return;
  }

  const binding = ctx.cookies.get(loginHintBindingCookieName);

  if (!binding || hashLoginHintBinding(binding) !== hint.bindingHash) {
    return;
  }

  return hint;
};

/**
 * Mark the interaction's hint as used. Called once the password it guards has been verified, so a
 * typo in the password does not burn the link the user is looking at.
 */
export const consumeLoginHint = async ({
  ctx,
  queries,
}: {
  ctx: WithInteractionDetailsContext;
  queries: Queries;
}) => {
  const token = getLoginHintToken(ctx);

  if (token) {
    await queries.loginHints.consumeLoginHint(token);
  }
};
