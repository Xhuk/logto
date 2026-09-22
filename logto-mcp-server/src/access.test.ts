import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { samePerson } from './access.js';

describe('samePerson', () => {
  it('matches the same user id', () => {
    assert.equal(samePerson({ id: 'admin-1' }, { id: 'admin-1' }), true);
  });

  it('matches a tenant user with the same username', () => {
    assert.equal(
      samePerson({ id: 'admin-1', username: 'Xhuk' }, { id: 'tenant-9', username: 'Xhuk' }),
      true
    );
  });

  it('matches email without caring about case', () => {
    assert.equal(
      samePerson(
        { id: 'admin-1', email: 'Jesus.Cruzado@gmail.com' },
        { id: 'tenant-9', primaryEmail: 'jesus.cruzado@gmail.com' }
      ),
      true
    );
  });

  it('rejects a different person', () => {
    assert.equal(
      samePerson({ id: 'admin-1', username: 'Xhuk', email: 'a@b.c' }, { id: 'other', username: 'ana' }),
      false
    );
  });
});
