import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { configKeyList, omitUndefined, publicUser, withQuery } from './shared.js';

describe('withQuery', () => {
  it('omits unset query entries', () => {
    assert.equal(withQuery('api/users', { page: 1, search: undefined }), 'api/users?page=1');
  });

  it('returns the path when every entry is unset', () => {
    assert.equal(withQuery('api/users', { search: undefined }), 'api/users');
  });
});

describe('omitUndefined', () => {
  it('keeps explicit nulls and drops undefined', () => {
    assert.deepEqual(omitUndefined({ name: 'Ada', description: undefined, avatar: null }), {
      name: 'Ada',
      avatar: null,
    });
  });
});

describe('publicUser', () => {
  it('strips password material', () => {
    assert.deepEqual(
      publicUser({ id: 'u1', name: 'Ada', password: 'secret', passwordEncrypted: 'hash' }),
      { id: 'u1', name: 'Ada' }
    );
  });
});

describe('configKeyList', () => {
  it('names keys and hides values', () => {
    assert.equal(configKeyList({ host: 'smtp.example.com', password: 'secret' }), '`host`, `password`');
  });
});
