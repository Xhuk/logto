/**
 * @jest-environment node
 *
 * Node environment on purpose: `jsdom` does not provide `Request`/`FormData` globals, and the
 * point of these tests is the body handling (which is what Safari/WebKit gets wrong).
 */
import { rewriteExperienceApiRequest } from './experience-path-prefix';

const ORIGIN = 'http://localhost:3001';

const setPrefix = (pathPrefix: string) => {
  (globalThis as { logtoSsr?: { pathPrefix?: string } }).logtoSsr = { pathPrefix };
};

beforeAll(() => {
  (globalThis as { window?: unknown }).window = { location: { origin: ORIGIN, pathname: '/' } };
});

beforeEach(() => {
  setPrefix('/auth');
});

afterEach(() => {
  delete (globalThis as { logtoSsr?: { pathPrefix?: string } }).logtoSsr;
});

describe('rewriteExperienceApiRequest()', () => {
  it('prefixes the API path', async () => {
    const rewritten = await rewriteExperienceApiRequest(
      new Request(`${ORIGIN}/api/.well-known/sign-in-exp`)
    );

    expect(rewritten).toBeInstanceOf(Request);
    expect(new URL(rewritten!.url).pathname).toBe('/auth/api/.well-known/sign-in-exp');
    expect(new URL(rewritten!.url).origin).toBe(ORIGIN);
  });

  it('keeps the JSON body (Safari/WebKit drops it when the request is rebuilt)', async () => {
    const payload = JSON.stringify({ interactionEvent: 'SignIn' });

    const rewritten = await rewriteExperienceApiRequest(
      new Request(`${ORIGIN}/api/experience`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: payload,
      })
    );

    expect(rewritten!.method).toBe('PUT');
    expect(rewritten!.headers.get('content-type')).toBe('application/json');
    await expect(rewritten!.text()).resolves.toBe(payload);
  });

  it('keeps a multipart body intact, boundary included', async () => {
    const form = new FormData();
    form.append('nota', 'prueba');

    const rewritten = await rewriteExperienceApiRequest(
      new Request(`${ORIGIN}/api/user-assets/avatar`, { method: 'POST', body: form })
    );

    expect(rewritten!.headers.get('content-type')).toContain('multipart/form-data');
    const text = await rewritten!.text();
    expect(text).toContain('name="nota"');
    expect(text).toContain('prueba');
  });

  it('keeps a bodyless request usable', async () => {
    const rewritten = await rewriteExperienceApiRequest(new Request(`${ORIGIN}/api/experience`));

    expect(rewritten!.method).toBe('GET');
    expect(rewritten!.body).toBeNull();
  });

  it('leaves requests outside the API or the origin alone', async () => {
    await expect(
      rewriteExperienceApiRequest(new Request('https://example.com/api/experience'))
    ).resolves.toBeUndefined();
    await expect(
      rewriteExperienceApiRequest(new Request(`${ORIGIN}/otro`))
    ).resolves.toBeUndefined();
  });

  it('does nothing when the experience is not mounted under a prefix', async () => {
    setPrefix('');

    await expect(
      rewriteExperienceApiRequest(new Request(`${ORIGIN}/api/experience`))
    ).resolves.toBeUndefined();
  });
});
