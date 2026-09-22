import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { allowedHttpHostnames } from './http.js';

describe('allowedHttpHostnames', () => {
  it('keeps loopback and adds the public Tailscale hostname', () => {
    const names = allowedHttpHostnames(
      new URL('https://katra-imperial.tailfadff7.ts.net:8444/mcp')
    );

    assert.ok(names.includes('127.0.0.1'));
    assert.ok(names.includes('localhost'));
    assert.ok(names.includes('katra-imperial.tailfadff7.ts.net'));
  });
});
