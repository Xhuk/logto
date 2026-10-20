import { ExtraParamsKey, SignInIdentifier } from '@logto/schemas';
import { maskEmail, maskPhone } from '@logto/shared';

import type Queries from '#src/tenants/Queries.js';

import {
  consumeLoginHint,
  getLoginHintToken,
  hashLoginHintBinding,
  loginHintBindingCookieName,
  maskSignInIdentifier,
  resolveLoginHint,
} from './login-hint.js';

const userId = 'user-id';
const clientId = 'app-id';

// The suite runs as native ESM, where the `jest` object is not a global.
const { jest } = import.meta;

const binding = 'b'.repeat(43);

const buildContext = (params: Record<string, unknown>, cookie?: string) =>
  ({
    interactionDetails: { params },
    cookies: { get: (name: string) => (name === loginHintBindingCookieName ? cookie : undefined) },
  }) as unknown as Parameters<typeof resolveLoginHint>[0]['ctx'];

const buildQueries = (hint?: unknown) => {
  const findActiveLoginHint = jest.fn().mockResolvedValue(hint);
  const consumeLoginHintMock = jest.fn().mockResolvedValue(true);

  return {
    queries: {
      loginHints: { findActiveLoginHint, consumeLoginHint: consumeLoginHintMock },
    } as unknown as Queries,
    findActiveLoginHint,
    consumeLoginHint: consumeLoginHintMock,
  };
};

describe('maskSignInIdentifier', () => {
  it('masks emails and phones the same way the MFA screens do', () => {
    expect(maskSignInIdentifier(SignInIdentifier.Email, 'jics@kairova.services')).toBe(
      maskEmail('jics@kairova.services')
    );
    expect(maskSignInIdentifier(SignInIdentifier.Phone, '+5215512345678')).toBe(
      maskPhone('+5215512345678')
    );
    expect(maskSignInIdentifier(SignInIdentifier.Email, 'jics@kairova.services')).not.toContain(
      'jics@'
    );
  });

  it('keeps a username recognizable without revealing it', () => {
    expect(maskSignInIdentifier(SignInIdentifier.Username, 'xhuk')).toBe('x****k');
    // Two characters or fewer would show the whole value through both ends, so hide it entirely.
    expect(maskSignInIdentifier(SignInIdentifier.Username, 'ab')).toBe('**');
  });
});

describe('getLoginHintToken', () => {
  it('reads the token from the interaction params', () => {
    expect(getLoginHintToken(buildContext({ [ExtraParamsKey.LoginHintToken]: 'lh_1' }))).toBe(
      'lh_1'
    );
  });

  it('ignores a missing or empty token', () => {
    expect(getLoginHintToken(buildContext({}))).toBeUndefined();
    expect(
      getLoginHintToken(buildContext({ [ExtraParamsKey.LoginHintToken]: '' }))
    ).toBeUndefined();
    // A repeated query key parses to an array, which must not be treated as a token.
    expect(
      getLoginHintToken(buildContext({ [ExtraParamsKey.LoginHintToken]: ['lh_1', 'lh_2'] }))
    ).toBeUndefined();
  });
});

describe('resolveLoginHint', () => {
  it('returns the hint when the browser carries the binding cookie', async () => {
    const hint = {
      id: 'lh_1',
      userId,
      clientId,
      identifierType: SignInIdentifier.Email,
      maskedIdentifier: 'j***@mail.com',
      bindingHash: hashLoginHintBinding(binding),
    };
    const { queries } = buildQueries(hint);

    await expect(
      resolveLoginHint({
        ctx: buildContext({ client_id: clientId, login_hint_token: 'lh_1' }, binding),
        queries,
      })
    ).resolves.toEqual(hint);
  });

  it('ignores a forwarded hint when the browser has no binding cookie', async () => {
    // This is the attack: someone mints a token for another account and sends the link. The victim's
    // browser carries no cookie, so the hint resolves to nothing and the normal form is shown.
    const { queries } = buildQueries({
      id: 'lh_1',
      userId,
      clientId,
      identifierType: SignInIdentifier.Email,
      maskedIdentifier: 'j***@mail.com',
      bindingHash: hashLoginHintBinding(binding),
    });

    await expect(
      resolveLoginHint({
        ctx: buildContext({ client_id: clientId, login_hint_token: 'lh_1' }),
        queries,
      })
    ).resolves.toBeUndefined();
  });

  it('ignores a hint minted without a binding, even if the browser carries a cookie', async () => {
    // A client that did not adapt still gets a token; it just can never prefill, which is what keeps
    // this an additive contract instead of a breaking one.
    const { queries } = buildQueries({
      id: 'lh_1',
      userId,
      clientId,
      identifierType: SignInIdentifier.Email,
      maskedIdentifier: 'j***@mail.com',
    });

    await expect(
      resolveLoginHint({
        ctx: buildContext({ client_id: clientId, login_hint_token: 'lh_1' }, binding),
        queries,
      })
    ).resolves.toBeUndefined();
  });
  it('ignores the hint when the cookie belongs to another browser', async () => {
    const { queries } = buildQueries({
      id: 'lh_1',
      userId,
      clientId,
      identifierType: SignInIdentifier.Email,
      maskedIdentifier: 'j***@mail.com',
      bindingHash: hashLoginHintBinding(binding),
    });

    await expect(
      resolveLoginHint({
        ctx: buildContext({ client_id: clientId, login_hint_token: 'lh_1' }, 'c'.repeat(43)),
        queries,
      })
    ).resolves.toBeUndefined();
  });

  it('ignores a hint minted for another application instead of failing the sign-in', async () => {
    const { queries, findActiveLoginHint } = buildQueries({
      id: 'lh_1',
      userId,
      clientId: 'another-app',
      identifierType: SignInIdentifier.Email,
      maskedIdentifier: 'j***@mail.com',
    });

    await expect(
      resolveLoginHint({
        ctx: buildContext({ client_id: clientId, login_hint_token: 'lh_1' }),
        queries,
      })
    ).resolves.toBeUndefined();
    expect(findActiveLoginHint).toHaveBeenCalledWith('lh_1');
  });

  it('does not hit the store when the interaction carries no token', async () => {
    const { queries, findActiveLoginHint } = buildQueries();

    await expect(
      resolveLoginHint({ ctx: buildContext({ client_id: clientId }), queries })
    ).resolves.toBeUndefined();
    expect(findActiveLoginHint).not.toHaveBeenCalled();
  });

  it('returns undefined for an expired or consumed token', async () => {
    const { queries } = buildQueries();

    await expect(
      resolveLoginHint({
        ctx: buildContext({ client_id: clientId, login_hint_token: 'lh_1' }),
        queries,
      })
    ).resolves.toBeUndefined();
  });
});

describe('consumeLoginHint', () => {
  it('consumes the token the interaction carries', async () => {
    const { queries, consumeLoginHint: consume } = buildQueries();

    await consumeLoginHint({
      ctx: buildContext({ login_hint_token: 'lh_1' }),
      queries,
    });

    expect(consume).toHaveBeenCalledWith('lh_1');
  });

  it('is a no-op without a token', async () => {
    const { queries, consumeLoginHint: consume } = buildQueries();

    await consumeLoginHint({ ctx: buildContext({}), queries });

    expect(consume).not.toHaveBeenCalled();
  });
});
