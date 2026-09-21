import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseCommaSeparatedList, parseTenantEndpoints } from './tenant-endpoints.js';

describe('parseTenantEndpoints', () => {
  it('returns an empty map when unset', () => {
    assert.equal(parseTenantEndpoints(undefined).size, 0);
    assert.equal(parseTenantEndpoints('').size, 0);
  });

  it('parses comma-separated pairs', () => {
    const map = parseTenantEndpoints(
      'a4x0qj=https://auth.lotly.lat,vet=https://auth.vetgroom.services'
    );

    assert.equal(map.get('a4x0qj')?.href, 'https://auth.lotly.lat/');
    assert.equal(map.get('vet')?.href, 'https://auth.vetgroom.services/');
  });

  it('parses a JSON object', () => {
    const map = parseTenantEndpoints('{"lotly":"https://auth.lotly.lat"}');

    assert.equal(map.get('lotly')?.href, 'https://auth.lotly.lat/');
  });

  it('rejects an invalid URL', () => {
    assert.throws(() => parseTenantEndpoints('lotly=not-a-url'), /not a valid URL/);
  });

  it('rejects a malformed pair', () => {
    assert.throws(() => parseTenantEndpoints('nouri'), /must be tenantId=/);
  });
});

describe('parseCommaSeparatedList', () => {
  it('splits and trims', () => {
    assert.deepEqual(parseCommaSeparatedList(' a, b ,c '), ['a', 'b', 'c']);
  });
});
