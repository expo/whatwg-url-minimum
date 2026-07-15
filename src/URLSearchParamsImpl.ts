import { type URLSearchParamsLike } from './types';
import {
  toUSVString,
  toWellFormed,
  toIterator,
  toObject,
  toQueryPair,
} from './conversions';
import { parseUrlencoded, serializeUrlencoded } from './encoding';
import { type URL, appendURLQuery, updateURLQuery } from './URLImpl';

declare class _Iterator<
  T,
  TReturn = unknown,
  TNext = unknown,
> implements Iterator<T, TReturn, TNext> {
  next(...[value]: [] | [TNext]): IteratorResult<T, TReturn>;
  return?(value?: TReturn): IteratorResult<T, TReturn>;
  throw?(e?: any): IteratorResult<T, TReturn>;
}

declare var Iterator: typeof _Iterator;

const _implSymbol = Symbol('URLSearchParamsImpl');
const _disposeSymbol: typeof Symbol.dispose =
  Symbol.dispose || Symbol.for('dispose');

export function createSearchParams(
  url: URL,
  query: string | null
): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams[_implSymbol].url = url;
  searchParams[_implSymbol].serialized = query == null;
  if (query) {
    searchParams[_implSymbol].list = parseUrlencoded(query);
  }
  return searchParams;
}

export function updateSearchParams(
  searchParams: URLSearchParams,
  query: string | null
): void {
  if (query) {
    searchParams[_implSymbol].list = parseUrlencoded(query);
  } else {
    searchParams[_implSymbol].list.length = 0;
  }
  searchParams[_implSymbol].serialized = query == null;
}

function updateInternalURL(internals: URLSearchParamsInternals): void {
  if (internals.url) {
    const query = serializeUrlencoded(internals.list);
    updateURLQuery(internals.url, query || null);
    internals.serialized = true;
  }
}

const IteratorClass = typeof Iterator !== 'undefined' ? Iterator : Object;

interface URLSearchParamsIteratorInternals<T> {
  ptr: URLSearchParamsInternals;
  map: (tuple: [string, string]) => T;
  index: number;
}

class URLSearchParamsIteratorImpl<T>
  extends IteratorClass<T>
  implements IteratorObject<T>
{
  [_implSymbol]: URLSearchParamsIteratorInternals<T>;

  constructor(
    ptr: URLSearchParamsInternals,
    map: (tuple: [string, string]) => T
  ) {
    super();
    this[_implSymbol] = { ptr, map, index: 0 };
  }

  next(): IteratorResult<T> {
    const internals = this[_implSymbol];
    return internals.index < internals.ptr.list.length
      ? {
          value: internals.map(internals.ptr.list[internals.index++]),
          done: false,
        }
      : { value: undefined, done: true };
  }

  [Symbol.iterator]() {
    return this as any;
  }

  [_disposeSymbol]() {
    // noop
  }
}

interface URLSearchParamsInternals {
  list: [string, string][];
  url: URL | null;
  serialized: boolean;
}

export class URLSearchParams implements URLSearchParamsLike {
  [_implSymbol]: URLSearchParamsInternals;

  constructor(
    init?: string[][] | Record<string, string> | string | URLSearchParamsLike
  ) {
    const internals: URLSearchParamsInternals = (this[_implSymbol] = {
      list: [],
      url: null,
      serialized: true,
    });
    let iterator: Iterator<[string, string]> | undefined;
    if (Array.isArray(init)) {
      // NOTE: Fast path for arrays
      for (let idx = 0; idx < init.length; idx++)
        internals.list.push(toQueryPair(init[idx]));
    } else if ((iterator = toIterator(init)) != null) {
      let item: IteratorResult<unknown>;
      while (!(item = toObject(iterator.next())).done)
        internals.list.push(toQueryPair(item.value));
    } else if (typeof init === 'object' && init != null) {
      const keys = Object.keys(init);
      for (let idx = 0; idx < keys.length; idx++) {
        const key = keys[idx];
        const name = toWellFormed(key);
        const value = toUSVString(init[key]);
        const tuple = internals.list.find(tuple => tuple[0] === name);
        if (tuple) tuple[1] = value;
        else internals.list.push([name, value]);
      }
    } else if (init !== undefined) {
      let asString = toUSVString(init);
      asString = asString[0] === '?' ? asString.substring(1) : asString;
      internals.list = parseUrlencoded(asString);
    }
  }

  get size() {
    return this[_implSymbol].list.length;
  }

  append(name: string, value: string): void {
    name = toUSVString(name);
    value = toUSVString(value);
    this[_implSymbol].list.push([name, value]);
    const internals = this[_implSymbol];
    if (internals.url && internals.serialized) {
      appendURLQuery(internals.url, serializeUrlencoded([[name, value]]));
    } else {
      updateInternalURL(internals);
    }
  }

  delete(name: string, value?: string): void {
    name = toUSVString(name);
    value = value != null ? toUSVString(value) : undefined;
    const { list } = this[_implSymbol];
    let idx = 0;
    while (idx < list.length) {
      if (list[idx][0] === name && (value == null || list[idx][1] === value)) {
        list.splice(idx, 1);
      } else {
        idx++;
      }
    }
    updateInternalURL(this[_implSymbol]);
  }

  get(name: string): string | null {
    name = toUSVString(name);
    const { list } = this[_implSymbol];
    for (let idx = 0; idx < list.length; idx++) {
      if (list[idx][0] === name) return list[idx][1];
    }
    return null;
  }

  getAll(name: string): string[] {
    name = toUSVString(name);
    const output: string[] = [];
    const { list } = this[_implSymbol];
    for (let idx = 0; idx < list.length; idx++) {
      if (list[idx][0] === name) output.push(list[idx][1]);
    }
    return output;
  }

  has(name: string, value?: string): boolean {
    name = toUSVString(name);
    value = value != null ? toUSVString(value) : undefined;
    const { list } = this[_implSymbol];
    for (let idx = 0; idx < list.length; idx++) {
      if (list[idx][0] === name && (value == null || list[idx][1] === value)) {
        return true;
      }
    }
    return false;
  }

  set(name: string, value: string): void {
    name = toUSVString(name);
    value = toUSVString(value);
    const { list } = this[_implSymbol];
    let hasEntry = false;
    let changed = false;
    let idx = 0;
    while (idx < list.length) {
      if (list[idx][0] === name) {
        if (hasEntry) {
          list.splice(idx, 1);
          changed = true;
        } else {
          hasEntry = true;
          if (list[idx][1] !== value) {
            list[idx][1] = value;
            changed = true;
          }
          idx++;
        }
      } else {
        idx++;
      }
    }
    if (!hasEntry) {
      list.push([name, value]);
      changed = true;
    }
    if (changed) updateInternalURL(this[_implSymbol]);
  }

  sort() {
    this[_implSymbol].list.sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      } else if (a[0] > b[0]) {
        return 1;
      } else {
        return 0;
      }
    });
    updateInternalURL(this[_implSymbol]);
  }

  forEach(
    callbackfn: (
      value: string,
      key: string,
      parent: URLSearchParamsLike
    ) => void,
    thisArg?: any
  ): void {
    if (typeof callbackfn !== 'function') {
      throw new TypeError('The "callback" argument must be of type function');
    }
    const { list } = this[_implSymbol];
    for (let idx = 0; idx < list.length; idx++) {
      callbackfn.call(thisArg, list[idx][1], list[idx][0], this);
    }
  }

  entries(): URLSearchParamsIterator<[string, string]> {
    return new URLSearchParamsIteratorImpl(this[_implSymbol], entry => entry);
  }

  keys(): URLSearchParamsIterator<string> {
    return new URLSearchParamsIteratorImpl(
      this[_implSymbol],
      entry => entry[0]
    );
  }

  values(): URLSearchParamsIterator<string> {
    return new URLSearchParamsIteratorImpl(
      this[_implSymbol],
      entry => entry[1]
    );
  }

  toString() {
    return serializeUrlencoded(this[_implSymbol].list);
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

Object.defineProperty(URLSearchParams.prototype, Symbol.toStringTag, {
  value: 'URLSearchParams',
  configurable: true,
});
