import { describe, expect, it, vi } from 'vitest';
import { URL, URLSearchParams } from '../index';

describe('WebIDL binding regressions', () => {
  it('distinguishes omitted arguments from explicit undefined', () => {
    const params = new URLSearchParams();
    params.append(undefined as any, undefined as any);

    expect(params.get(undefined as any)).toBe('undefined');
    expect(URL.parse(undefined as any, undefined as any)).toBeNull();
    expect(URL.canParse(undefined as any, undefined as any)).toBe(false);
  });

  it('converts URL arguments in WebIDL order and propagates coercion errors', () => {
    const order: string[] = [];
    const url = { toString: () => (order.push('url'), '/path') };
    const base = {
      toString: () => (order.push('base'), 'https://example.com/'),
    };

    expect(new URL(url as any, base as any).href).toBe(
      'https://example.com/path'
    );
    expect(order).toEqual(['url', 'base']);

    const error = new Error('coercion failed');
    const invalid = {
      toString() {
        throw error;
      },
    };
    expect(() => URL.parse(invalid as any)).toThrow(error);
    expect(() => URL.canParse(invalid as any)).toThrow(error);
  });

  it.fails('rejects symbols for every USVString binding', () => {
    const symbol = Symbol('value');
    const params = new URLSearchParams();

    expect(() => new URL(symbol as any)).toThrow(TypeError);
    expect(() => URL.parse(symbol as any)).toThrow(TypeError);
    expect(() => URL.canParse(symbol as any)).toThrow(TypeError);
    expect(() => new URLSearchParams(symbol as any)).toThrow(TypeError);
    expect(() => params.append(symbol as any, '')).toThrow(TypeError);
    expect(() => params.delete(symbol as any)).toThrow(TypeError);
    expect(() => params.get(symbol as any)).toThrow(TypeError);
    expect(() => params.getAll(symbol as any)).toThrow(TypeError);
    expect(() => params.has(symbol as any)).toThrow(TypeError);
    expect(() => params.set(symbol as any, '')).toThrow(TypeError);
  });

  it('rejects malformed sequence initializers', () => {
    expect(
      () => new URLSearchParams([{ 0: 'a', 1: 'b', length: 2 }] as any)
    ).toThrow(TypeError);
    expect(
      () => new URLSearchParams({ [Symbol.iterator]: 1, a: 'b' } as any)
    ).toThrow(TypeError);
    expect(() => new URLSearchParams([null] as any)).toThrow(TypeError);
  });

  it('converts every inner sequence value before validating its length', () => {
    const converted: string[] = [];
    const value = (name: string) => ({
      toString() {
        converted.push(name);
        return name;
      },
    });

    expect(
      () =>
        new URLSearchParams([
          [value('first'), value('second'), value('third')],
        ] as any)
    ).toThrow(TypeError);
    expect(converted).toEqual(['first', 'second', 'third']);
  });

  it.fails('invokes forEach callbacks through the callable itself', () => {
    expect(() => new URLSearchParams().forEach(null as any)).toThrow(TypeError);

    const params = new URLSearchParams('a=1');
    const callback = vi.fn();
    callback.call = null as any;
    const thisArg = {};
    params.forEach(callback, thisArg);

    expect(callback).toHaveBeenCalledWith('1', 'a', params);
    expect(callback.mock.instances[0]).toBe(thisArg);
  });

  it.fails('rejects forged URL and URLSearchParams receivers', () => {
    const url = new URL('https://example.com/?a=1');
    const href = Object.getOwnPropertyDescriptor(URL.prototype, 'href')!;

    expect(() => href.get!.call({ _url: (url as any)._url })).toThrow(
      TypeError
    );
    expect(() => href.set!.call({ _url: (url as any)._url }, url.href)).toThrow(
      TypeError
    );
    expect(() =>
      URL.prototype.toString.call({ _url: (url as any)._url } as any)
    ).toThrow(TypeError);
    expect(() =>
      URLSearchParams.prototype.get.call({ _list: [['a', '1']] } as any, 'a')
    ).toThrow(TypeError);
  });

  it('keeps implementation slots hidden', () => {
    expect(Object.keys(new URL('https://example.com/?a=1'))).toEqual([]);
    expect(Object.keys(new URLSearchParams('a=1'))).toEqual([]);
  });

  it.fails('exposes branded URLSearchParams iterators', () => {
    const iterator = new URLSearchParams('a=1').entries();
    const next = iterator.next;
    const prototype = Object.getPrototypeOf(iterator);
    const intrinsicIteratorPrototype = Object.getPrototypeOf(
      Object.getPrototypeOf([][Symbol.iterator]())
    );

    expect(Object.prototype.toString.call(iterator)).toBe(
      '[object URLSearchParams Iterator]'
    );
    expect(() => next.call({} as any)).toThrow(TypeError);
    expect(iterator[Symbol.iterator]()).toBe(iterator);
    expect(Object.getPrototypeOf(prototype)).toBe(intrinsicIteratorPrototype);
    expect(Object.prototype.hasOwnProperty.call(prototype, 'constructor')).toBe(
      false
    );
    expect(Object.getOwnPropertyDescriptor(prototype, 'next')!.enumerable).toBe(
      true
    );
  });
});
