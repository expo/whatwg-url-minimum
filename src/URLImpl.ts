import {
  type URLAbstract,
  URLParseMode,
  parseURL,
  serializeURL,
  serializeURLOrigin,
  cannotHaveAUsernamePasswordPort,
  setURLUsername,
  setURLPassword,
  serializeHost,
  serializePath,
} from './url-state-machine';

import { type URLLike } from './types';
import { toUSVString } from './conversions';
import {
  type URLSearchParams,
  createSearchParams,
  updateSearchParams,
} from './URLSearchParamsImpl';

const _implSymbol = Symbol('URLImpl');

export function updateURLQuery(url: URL, query: string | null): void {
  url[_implSymbol].url.query = query;
}

interface URLInternals {
  url: URLAbstract;
  query: URLSearchParams;
}

export class URL implements URLLike {
  [_implSymbol]: URLInternals;

  constructor(input?: string | URLLike, base?: string | URLLike) {
    if (input === undefined && base === undefined) {
      throw new TypeError('The "url" argument must be specified.');
    }
    input = toUSVString(input);
    if (base != null) {
      base = toUSVString(base);
    }
    let parsedBase: URLAbstract | null = null;
    if (base != null) {
      parsedBase = parseURL(base, null, null, 0);
      if (parsedBase == null) {
        throw new TypeError(`Invalid base URL: ${base}`);
      }
    }
    const url = parseURL(input, null, parsedBase, 0);
    if (url == null) {
      throw new TypeError(`Invalid URL: ${input}`);
    }
    this[_implSymbol] = { url, query: createSearchParams(this, url.query) };
  }

  static createObjectURL(_input: any): string {
    throw new TypeError('URL.createObjetURL is unsupported');
  }

  static revokeObjectURL(_input: any): void {
    // unsupported
  }

  static parse(input: string | URLLike, base?: string | URLLike): URL | null {
    try {
      return new URL(input, base);
    } catch {
      return null;
    }
  }

  static canParse(input: string | URLLike, base?: string | URLLike): boolean {
    let parsedBase: URLAbstract | null = null;
    if (base != null) {
      parsedBase = parseURL(`${base}`, null, null, 0);
      if (parsedBase == null) {
        return false;
      }
    }
    return parseURL(`${input}`, null, parsedBase, 0) != null;
  }

  get href() {
    return serializeURL(this[_implSymbol].url, false);
  }

  set href(value: string) {
    value = toUSVString(value);
    const url = parseURL(value, null, null, 0);
    if (url == null) {
      throw new TypeError(`Invalid URL: ${value}`);
    }
    this[_implSymbol].url = url;
    updateSearchParams(this[_implSymbol].query, url.query);
  }

  get origin() {
    return serializeURLOrigin(this[_implSymbol].url);
  }

  get protocol() {
    return `${this[_implSymbol].url.scheme}:`;
  }

  set protocol(value: string) {
    value = toUSVString(value);
    parseURL(
      `${value}:`,
      this[_implSymbol].url,
      null,
      URLParseMode.SchemeStart
    );
  }

  get username() {
    return this[_implSymbol].url.username;
  }

  set username(value: string) {
    value = toUSVString(value);
    if (!cannotHaveAUsernamePasswordPort(this[_implSymbol].url)) {
      setURLUsername(this[_implSymbol].url, value);
    }
  }

  get password() {
    return this[_implSymbol].url.password;
  }

  set password(value: string) {
    value = toUSVString(value);
    if (!cannotHaveAUsernamePasswordPort(this[_implSymbol].url)) {
      setURLPassword(this[_implSymbol].url, value);
    }
  }

  get host() {
    const { url } = this[_implSymbol];
    if (url.host == null) {
      return '';
    } else if (url.port == null) {
      return serializeHost(url.host);
    } else {
      return `${serializeHost(url.host)}:${url.port}`;
    }
  }

  set host(value: string) {
    value = toUSVString(value);
    if (!this[_implSymbol].url.opaquePath) {
      parseURL(value, this[_implSymbol].url, null, URLParseMode.Host);
    }
  }

  get hostname() {
    const { url } = this[_implSymbol];
    return url.host != null ? serializeHost(url.host) : '';
  }

  set hostname(value: string) {
    value = toUSVString(value);
    if (!this[_implSymbol].url.opaquePath) {
      parseURL(value, this[_implSymbol].url, null, URLParseMode.Hostname);
    }
  }

  get port() {
    const { url } = this[_implSymbol];
    return url.port != null ? `${url.port}` : '';
  }

  set port(value: string) {
    value = toUSVString(value);
    const { url } = this[_implSymbol];
    if (!cannotHaveAUsernamePasswordPort(url)) {
      if (!value) {
        url.port = null;
      } else {
        parseURL(value, url, null, URLParseMode.Port);
      }
    }
  }

  get pathname() {
    return serializePath(this[_implSymbol].url);
  }

  set pathname(value: string) {
    value = toUSVString(value);
    const { url } = this[_implSymbol];
    if (!url.opaquePath) {
      url.path = [];
      parseURL(value, url, null, URLParseMode.PathStart);
    }
  }

  get search() {
    const { url } = this[_implSymbol];
    return url.query ? `?${url.query}` : '';
  }

  set search(value: string) {
    value = toUSVString(value);
    const { url, query } = this[_implSymbol];
    if (!value) {
      url.query = null;
      updateSearchParams(query, null);
    } else {
      const input = value[0] === '?' ? value.substring(1) : value;
      url.query = '';
      parseURL(input, url, null, URLParseMode.Query);
      updateSearchParams(query, url.query);
    }
  }

  get searchParams() {
    return this[_implSymbol].query;
  }

  get hash() {
    const { url } = this[_implSymbol];
    return url.fragment ? `#${url.fragment}` : '';
  }

  set hash(value: string) {
    value = toUSVString(value);
    const { url } = this[_implSymbol];
    if (!value) {
      url.fragment = null;
    } else {
      const input = value[0] === '#' ? value.substring(1) : value;
      url.fragment = '';
      parseURL(input, url, null, URLParseMode.Fragment);
    }
  }

  toJSON() {
    return this.href;
  }

  toString() {
    return this.href;
  }
}

Object.defineProperty(URL.prototype, Symbol.toStringTag, {
  value: 'URL',
  configurable: true,
});
