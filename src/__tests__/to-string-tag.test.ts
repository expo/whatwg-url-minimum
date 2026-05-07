import { describe, expect, it } from 'vitest';
import { URL, URLSearchParams } from '../index';

describe('URL Symbol.toStringTag', () => {
  it('exposes "URL" via Symbol.toStringTag', () => {
    expect(URL.prototype[Symbol.toStringTag]).toBe('URL');
  });

  it('returns "[object URL]" from Object.prototype.toString', () => {
    const url = new URL('https://example.com/');
    expect(Object.prototype.toString.call(url)).toBe('[object URL]');
  });

  it('matches the Web IDL property descriptor', () => {
    const desc = Object.getOwnPropertyDescriptor(
      URL.prototype,
      Symbol.toStringTag
    );
    expect(desc).toEqual({
      value: 'URL',
      writable: false,
      enumerable: false,
      configurable: true,
    });
  });
});

describe('URLSearchParams Symbol.toStringTag', () => {
  it('exposes "URLSearchParams" via Symbol.toStringTag', () => {
    expect(URLSearchParams.prototype[Symbol.toStringTag]).toBe(
      'URLSearchParams'
    );
  });

  it('returns "[object URLSearchParams]" from Object.prototype.toString', () => {
    const params = new URLSearchParams('a=1');
    expect(Object.prototype.toString.call(params)).toBe(
      '[object URLSearchParams]'
    );
  });

  it('matches the Web IDL property descriptor', () => {
    const desc = Object.getOwnPropertyDescriptor(
      URLSearchParams.prototype,
      Symbol.toStringTag
    );
    expect(desc).toEqual({
      value: 'URLSearchParams',
      writable: false,
      enumerable: false,
      configurable: true,
    });
  });
});
