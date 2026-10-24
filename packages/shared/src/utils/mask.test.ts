import { describe, expect, it } from 'vitest';

import { maskEmail, maskPhone, maskUsername } from './mask.js';

describe('maskEmail', () => {
  it('keeps up to four characters of a long local part', () => {
    expect(maskEmail('betty.villasenor.a@gmail.com')).toBe('bett****@gmail.com');
    expect(maskEmail('habichuela@lotly.lat')).toBe('habi****@lotly.lat');
  });

  // Regresión: con el local part corto se enmascaraba entero y la confirmación del hint quedaba en
  // `****@lotly.lat` para cualquier cuenta del dominio, que no le dice nada al usuario.
  it('keeps the first character of a short local part', () => {
    expect(maskEmail('habi@lotly.lat')).toBe('h****@lotly.lat');
    expect(maskEmail('ab@lotly.lat')).toBe('a****@lotly.lat');
  });

  it('masks a single character entirely', () => {
    expect(maskEmail('a@lotly.lat')).toBe('****@lotly.lat');
  });

  it('never leaks the whole local part', () => {
    for (const localPart of ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdefgh']) {
      const masked = maskEmail(`${localPart}@lotly.lat`);
      const visible = masked.length - '****@lotly.lat'.length;
      expect(visible).toBeLessThan(localPart.length);
    }
  });
});

describe('maskPhone', () => {
  it('keeps the last four digits', () => {
    expect(maskPhone('+14165551234')).toBe('****1234');
  });
});

describe('maskUsername', () => {
  it('keeps the first and last character', () => {
    expect(maskUsername('Xhuk')).toBe('X****k');
  });

  it('masks two characters or fewer entirely', () => {
    expect(maskUsername('ab')).toBe('**');
    expect(maskUsername('a')).toBe('*');
  });
});
