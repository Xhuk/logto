import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { allowedHttpHostnames } from './http.js';

describe('allowedHttpHostnames', () => {
  it('keeps loopback and adds the public hostname', () => {
    const names = allowedHttpHostnames(new URL('https://auth.kairova.services/mcp'));

    assert.ok(names.includes('127.0.0.1'));
    assert.ok(names.includes('localhost'));
    assert.ok(names.includes('auth.kairova.services'));
  });

  it('adds Tailscale aliases from the allowlist', () => {
    const names = allowedHttpHostnames(new URL('https://auth.kairova.services/mcp'), [
      'katra-imperial.tailfadff7.ts.net',
    ]);

    assert.ok(names.includes('auth.kairova.services'));
    assert.ok(names.includes('katra-imperial.tailfadff7.ts.net'));
  });
});
