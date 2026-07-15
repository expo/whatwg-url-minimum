import {
  percentDecodeString,
  utf8PercentEncodeCodePoint,
  utf8PercentEncodeString,
  isC0ControlPercentEncode,
  isFragmentPercentEncode,
  isQueryPercentEncode,
  isSpecialQueryPercentEncode,
  isPathPercentEncode,
  isUserinfoPercentEncode,
} from './encoding';
import { normalizeDomain } from './punycode';

import {
  isIPv4,
  parseIPv4,
  serializeIPv4,
  parseIPv6,
  serializeIPv6,
} from './ip';

type SpecialScheme = 'ftp' | 'file' | 'http' | 'https' | 'ws' | 'wss';

function isSingleDot(buffer: string): boolean {
  switch (buffer) {
    case '.':
    case '%2e':
    case '%2E':
      return true;
    default:
      return false;
  }
}

function isDoubleDot(buffer: string): boolean {
  switch (buffer) {
    case '..':
    case '%2e.':
    case '%2E.':
    case '.%2e':
    case '.%2E':
    case '%2e%2e':
    case '%2E%2e':
    case '%2e%2E':
    case '%2E%2E':
      return true;
    default:
      return false;
  }
}

function isWindowsDriveLetterCodePoints(cp1: number, cp2: number): boolean {
  return (
    ((cp1 >= 0x41 && cp1 <= 0x5a) /*A-F*/ ||
      (cp1 >= 0x61 && cp1 <= 0x7a)) /*a-f*/ &&
    (cp2 === 58 /*':'*/ || cp2 === 124) /*'|'*/
  );
}

function isWindowsDriveLetterString(string: string): boolean {
  return (
    string.length === 2 &&
    isWindowsDriveLetterCodePoints(
      string.codePointAt(0)!,
      string.codePointAt(1)!
    )
  );
}

function isNormalizedWindowsDriveLetterString(string: string): boolean {
  if (string.length === 2) {
    const cp1 = string.codePointAt(0)!;
    const cp2 = string.codePointAt(1)!;
    return (
      ((cp1 >= 0x41 && cp1 <= 0x5a) /*A-F*/ ||
        (cp1 >= 0x61 && cp1 <= 0x7a)) /*a-f*/ &&
      cp2 === 58 /*':'*/
    );
  } else {
    return false;
  }
}

function containsForbiddenHostCodePoint(string: string): boolean {
  return (
    string.search(
      /\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|<|>|\?|@|\[|\\|\]|\^|\|/u
    ) !== -1
  );
}

function isSpecial(scheme: string): scheme is SpecialScheme {
  switch (scheme) {
    case 'ftp':
    case 'http':
    case 'https':
    case 'ws':
    case 'wss':
    case 'file':
      return true;
    default:
      return false;
  }
}

function defaultPort(scheme: SpecialScheme | (string & {})): number | null {
  switch (scheme) {
    case 'ftp':
      return 21;
    case 'http':
      return 80;
    case 'https':
      return 443;
    case 'ws':
      return 80;
    case 'wss':
      return 443;
    case 'file':
    default:
      return null;
  }
}

function parseHost(input: string, isOpaque: boolean) {
  if (input[0] === '[') {
    return input[input.length - 1] === ']'
      ? parseIPv6(input.substring(1, input.length - 1))
      : null;
  } else if (isOpaque) {
    return parseOpaqueHost(input);
  } else {
    // TODO(@kitten): unicode support has been stripped out until we can move this implementation to native.
    const domain =
      input.indexOf('%') === -1 ? input : percentDecodeString(input);
    // NOTE(@kitten): This fixes a bug in whatwg-url-without-unicode where domain isn't normalized to be lowercase
    const asciiDomain = normalizeDomain(domain);
    if (asciiDomain === null || containsForbiddenHostCodePoint(asciiDomain)) {
      return null;
    } else if (isIPv4(asciiDomain)) {
      return parseIPv4(asciiDomain);
    } else {
      return asciiDomain;
    }
  }
}

function parseOpaqueHost(input: string): string | null {
  return !containsForbiddenHostCodePoint(input)
    ? utf8PercentEncodeString(input, isC0ControlPercentEncode)
    : null;
}

export function serializeHost(host: string | number | number[]): string {
  if (typeof host === 'number') {
    return serializeIPv4(host);
  } else if (Array.isArray(host)) {
    return `[${serializeIPv6(host)}]`;
  } else {
    return host;
  }
}

function trimControlChars(string: string): string {
  // Avoid using regexp because of this V8 bug: https://issues.chromium.org/issues/42204424
  let start = 0;
  let end = string.length;
  for (; start < end; ++start) {
    if (string.charCodeAt(start) > 0x20) {
      break;
    }
  }
  for (; end > start; --end) {
    if (string.charCodeAt(end - 1) > 0x20) {
      break;
    }
  }
  return string.substring(start, end);
}

function trimTabAndNewline(url: string): string {
  let idx = 0;
  for (; idx < url.length; idx++) {
    const c = url.charCodeAt(idx);
    if (c === 0x09 || c === 0x0a || c === 0x0d) break;
  }
  if (idx === url.length) return url;

  let output = url.slice(0, idx);
  for (; idx < url.length; idx++) {
    const c = url.charCodeAt(idx);
    if (c !== 0x09 && c !== 0x0a && c !== 0x0d) output += url[idx];
  }
  return output;
}

function shortenPath(url: URLAbstract) {
  if (
    url.path.length > 0 &&
    (url.path.length !== 1 ||
      url.scheme !== 'file' ||
      !isNormalizedWindowsDriveLetter(url.path[0]))
  ) {
    url.path.pop();
  }
}

function includesCredentials(url: URLAbstract): boolean {
  return url.username !== '' || url.password !== '';
}

export function cannotHaveAUsernamePasswordPort(url: URLAbstract): boolean {
  return url.host === null || url.host === '' || url.scheme === 'file';
}

function isNormalizedWindowsDriveLetter(string: string): boolean {
  return /^[A-Za-z]:$/u.test(string);
}

export interface URLAbstract {
  scheme: string;
  username: string;
  password: string;
  host: string | null;
  port: number | null;
  path: string[];
  query: string | null;
  fragment: string | null;
  opaquePath: boolean;
}

interface Parser {
  (c: number | undefined): URLParseMode;
}

let p = 0;
let i = '';
let b = '';
let v: URLAbstract | null = null;
let u: URLAbstract;
let a = false;
let pt = false;
let ib = false;
let m: URLParseMode;

export const enum URLParseMode {
  Success = 0,
  Failure,
  SchemeStart,
  Host,
  Hostname,
  Port,
  PathStart,
  Query,
  Fragment,
}

export function parseURL(
  input: string,
  url: URLAbstract | null,
  base: URLAbstract | null,
  initialMode: URLParseMode
): URLAbstract | null {
  if (!url) {
    input = trimControlChars(input);
  }
  input = trimTabAndNewline(input);

  p = 0;
  i = input;
  b = '';
  v = base || null;
  u = url || {
    scheme: '',
    username: '',
    password: '',
    host: null,
    port: null,
    path: [],
    query: null,
    fragment: null,
    opaquePath: false,
  };
  a = false;
  pt = false;
  ib = false;
  m = initialMode || URLParseMode.Success;

  let parser = parseSchemeStart;
  switch (initialMode) {
    case URLParseMode.Host:
    case URLParseMode.Hostname:
      parser = parseHostname;
      break;
    case URLParseMode.Port:
      parser = parsePort;
      break;
    case URLParseMode.PathStart:
      parser = parsePathStart;
      break;
    case URLParseMode.Query:
      parser = parseQuery;
      break;
    case URLParseMode.Fragment:
      parser = parseFragment;
      break;
  }
  const failure = parser(codePointAt(input, p)) === URLParseMode.Failure;

  return !failure ? u : null;
}

function continueParse(pointer: number, c: number | undefined): boolean {
  p += p === pointer ? codePointSize(c) : 1;
  return p <= i.length;
}

function codePointAt(input: string, pointer: number): number | undefined {
  return pointer < input.length ? input.codePointAt(pointer) : undefined;
}

function codePointSize(c: number | undefined): number {
  return c != null && c > 0xffff ? 2 : 1;
}

function codePointToString(c: number | undefined): string {
  if (c == null) return '';
  return c <= 0xffff ? String.fromCharCode(c) : String.fromCodePoint(c);
}

function asciiLowercaseCodePointToString(c: number): string {
  return String.fromCharCode(c >= 0x41 && c <= 0x5a ? c + 0x20 : c);
}

const parseSchemeStart: Parser = c => {
  const start = p;
  if (
    c != null &&
    ((c >= 0x41 && c <= 0x5a) /*A-Z*/ || (c >= 0x61 && c <= 0x7a)) /*a-z*/
  ) {
    let pointer = p;
    do {
      b += asciiLowercaseCodePointToString(c);
      pointer += codePointSize(c);
      c = codePointAt(i, pointer);
    } while (
      c != null &&
      (c === 43 /*'+'*/ ||
        c === 45 /*'-'*/ ||
        c === 46 /*'.'*/ ||
        (c >= 0x41 && c <= 0x5a) /*A-Z*/ ||
        (c >= 0x61 && c <= 0x7a) /*a-z*/ ||
        (c >= 0x30 && c <= 0x39)) /*0-9*/
    );
    p = pointer;
    return parseScheme(c);
  } else if (!m) {
    --p;
    return continueParse(start, c)
      ? parseNoScheme(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    return URLParseMode.Failure;
  }
};

const parseScheme: Parser = c => {
  const start = p;
  if (
    c != null &&
    (c === 43 /*'+'*/ ||
      c === 45 /*'-'*/ ||
      c === 46 /*'.'*/ ||
      (c >= 0x41 && c <= 0x5a) /*A-Z*/ ||
      (c >= 0x61 && c <= 0x7a) /*a-z*/ ||
      (c >= 0x30 && c <= 0x39)) /*0-9*/
  ) {
    b += asciiLowercaseCodePointToString(c);
    return continueParse(start, c)
      ? parseScheme(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (c === 58 /*':'*/) {
    if (m) {
      if (isSpecial(u.scheme) !== isSpecial(b)) {
        return URLParseMode.Success;
      } else if ((includesCredentials(u) || u.port !== null) && b === 'file') {
        return URLParseMode.Success;
      } else if (u.scheme === 'file' && u.host === '') {
        return URLParseMode.Success;
      }
    }

    u.scheme = b;
    if (m) {
      if (u.port === defaultPort(u.scheme)) u.port = null;
      return URLParseMode.Success;
    }

    b = '';
    if (u.scheme === 'file') {
      return continueParse(start, c)
        ? parseFile(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (isSpecial(u.scheme) && v !== null && v.scheme === u.scheme) {
      return continueParse(start, c)
        ? parseSpecialRelativeOrAuthority(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (isSpecial(u.scheme)) {
      return continueParse(start, c)
        ? parseSpecialAuthoritySlashes(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (codePointAt(i, p + 1) === 47 /*'/'*/) {
      p++;
      return continueParse(start, c)
        ? parsePathOrAuthority(codePointAt(i, p))
        : URLParseMode.Success;
    } else {
      u.path = [''];
      u.opaquePath = true;
      return continueParse(start, c)
        ? parseOpaquePath(codePointAt(i, p))
        : URLParseMode.Success;
    }
  } else if (!m) {
    b = '';
    p = -1;
    return continueParse(start, c)
      ? parseNoScheme(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    return URLParseMode.Failure;
  }
};

const parseNoScheme: Parser = c => {
  const start = p;
  if (v === null || (v.opaquePath && c !== 35) /*'#'*/) {
    return URLParseMode.Failure;
  } else if (v.opaquePath && c === 35 /*'#'*/) {
    u.scheme = v.scheme;
    u.path = v.path.slice();
    u.opaquePath = v.opaquePath;
    u.query = v.query;
    u.fragment = '';
    return continueParse(start, c)
      ? parseFragment(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (v.scheme === 'file') {
    p--;
    return continueParse(start, c)
      ? parseFile(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    p--;
    return continueParse(start, c)
      ? parseRelative(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseSpecialRelativeOrAuthority: Parser = c => {
  const start = p;
  if (c === 47 /*'/'*/ && codePointAt(i, p + 1) === 47 /*'/'*/) {
    ++p;
    return continueParse(start, c)
      ? parseSpecialAuthorityIgnoreSlashes(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    p--;
    return continueParse(start, c)
      ? parseRelative(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parsePathOrAuthority: Parser = c => {
  const start = p;
  if (c === 47 /*'/'*/) {
    return continueParse(start, c)
      ? parseAuthority(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    p--;
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseRelative: Parser = c => {
  const start = p;
  u.scheme = v!.scheme;
  if (c === 47 /*'/'*/) {
    return continueParse(start, c)
      ? parseRelativeSlash(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (isSpecial(u.scheme) && c === 92 /*'\\'*/) {
    return continueParse(start, c)
      ? parseRelativeSlash(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    u.username = v!.username;
    u.password = v!.password;
    u.host = v!.host;
    u.port = v!.port;
    u.path = v!.path.slice();
    u.query = v!.query;
    if (c === 63 /*'?'*/) {
      u.query = '';
      return continueParse(start, c)
        ? parseQuery(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (c === 35 /*'#'*/) {
      u.fragment = '';
      return continueParse(start, c)
        ? parseFragment(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (c != null) {
      u.query = null;
      u.path.pop();
      p--;
      return continueParse(start, c)
        ? parsePath(codePointAt(i, p))
        : URLParseMode.Success;
    } else {
      return continueParse(start, c)
        ? parseRelative(codePointAt(i, p))
        : URLParseMode.Success;
    }
  }
};

const parseRelativeSlash: Parser = c => {
  const start = p;
  if (isSpecial(u.scheme) && (c === 47 /*'/'*/ || c === 92) /*'\\'*/) {
    return continueParse(start, c)
      ? parseSpecialAuthorityIgnoreSlashes(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (c === 47 /*'/'*/) {
    return continueParse(start, c)
      ? parseAuthority(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    u.username = v!.username;
    u.password = v!.password;
    u.host = v!.host;
    u.port = v!.port;
    p--;
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseSpecialAuthoritySlashes: Parser = c => {
  const start = p;
  if (c === 47 /*'/'*/ && codePointAt(i, p + 1) === 47 /*'/'*/) {
    p++;
  } else {
    p--;
  }
  return continueParse(start, c)
    ? parseSpecialAuthorityIgnoreSlashes(codePointAt(i, p))
    : URLParseMode.Success;
};

const parseSpecialAuthorityIgnoreSlashes: Parser = c => {
  const start = p;
  if (c !== 47 /*'/*/ && c !== 92 /*'\\'*/) {
    p--;
    return continueParse(start, c)
      ? parseAuthority(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    return continueParse(start, c)
      ? parseSpecialAuthorityIgnoreSlashes(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseAuthority: Parser = c => {
  const start = p;
  if (
    c != null &&
    c !== 64 /*'@'*/ &&
    c !== 35 /*'#'*/ &&
    c !== 47 /*'/'*/ &&
    c !== 63 /*'?'*/ &&
    !(c === 92 /*'\\'*/ && isSpecial(u.scheme))
  ) {
    let end = p + codePointSize(c);
    while (end < i.length) {
      const next = codePointAt(i, end);
      if (
        next == null ||
        next === 64 /*'@'*/ ||
        next === 35 /*'#'*/ ||
        next === 47 /*'/'*/ ||
        next === 63 /*'?'*/ ||
        (next === 92 /*'\\'*/ && isSpecial(u.scheme))
      ) {
        break;
      }
      end += codePointSize(next);
    }
    b += i.slice(p, end);
    p = end - 1;
    return continueParse(start, c)
      ? parseAuthority(codePointAt(i, p))
      : URLParseMode.Success;
  }

  if (c === 64 /*'@'*/) {
    if (a) b = `%40${b}`;
    a = true;
    for (let idx = 0; idx < b.length; idx++) {
      const codePoint = b.codePointAt(idx);
      if (codePoint === 58 /*':'*/ && !pt) {
        pt = true;
        continue;
      }
      const encodedCodePoints = utf8PercentEncodeCodePoint(
        codePoint,
        isUserinfoPercentEncode
      );
      if (pt) {
        u.password += encodedCodePoints;
      } else {
        u.username += encodedCodePoints;
      }
      if (codePoint != null && codePoint > 0xffff) idx++;
    }
    b = '';
    return continueParse(start, c)
      ? parseAuthority(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (
    c == null ||
    c === 35 /*'#'*/ ||
    c === 47 /*'/'*/ ||
    c === 63 /*'?'*/ ||
    (c === 92 /*'\\'*/ && isSpecial(u.scheme))
  ) {
    if (a && b === '') {
      return URLParseMode.Failure;
    }
    p -= b.length + 1;
    b = '';
    return continueParse(start, c)
      ? parseHostname(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    b += codePointToString(c);
    return continueParse(start, c)
      ? parseAuthority(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseHostname: Parser = c => {
  const start = p;
  if (m && u.scheme === 'file') {
    p--;
    return continueParse(start, c)
      ? parseFileHost(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (
    c != null &&
    c !== 58 /*':'*/ &&
    c !== 35 /*'#'*/ &&
    c !== 47 /*'/'*/ &&
    c !== 63 /*'?'*/ &&
    !(c === 92 /*'\\'*/ && isSpecial(u.scheme))
  ) {
    let end = p + codePointSize(c);
    if (c === 91 /*'['*/) ib = true;
    else if (c === 93 /*']'*/) ib = false;

    while (end < i.length) {
      const next = codePointAt(i, end);
      if (
        next == null ||
        (!ib && next === 58) /*':'*/ ||
        next === 35 /*'#'*/ ||
        next === 47 /*'/'*/ ||
        next === 63 /*'?'*/ ||
        (next === 92 /*'\\'*/ && isSpecial(u.scheme))
      ) {
        break;
      }
      if (next === 91 /*'['*/) ib = true;
      else if (next === 93 /*']'*/) ib = false;
      end += codePointSize(next);
    }

    b += i.slice(p, end);
    p = end - 1;
    return continueParse(start, c)
      ? parseHostname(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (c === 58 /*':'*/ && !ib) {
    if (b === '') {
      return URLParseMode.Failure;
    }

    if (m === URLParseMode.Hostname) {
      return URLParseMode.Failure;
    }

    const host = parseHost(b, !isSpecial(u.scheme));
    if (host === null) {
      return URLParseMode.Failure;
    }

    u.host = serializeHost(host);
    b = '';
    return continueParse(start, c)
      ? parsePort(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (
    c == null ||
    c === 35 /*'#'*/ ||
    c === 47 /*'/'*/ ||
    c === 63 /*'?'*/ ||
    (c === 92 /*'\\'*/ && isSpecial(u.scheme))
  ) {
    p--;
    if (isSpecial(u.scheme) && b === '') {
      return URLParseMode.Failure;
    } else if (m && b === '' && (includesCredentials(u) || u.port !== null)) {
      return URLParseMode.Failure;
    }

    const host = parseHost(b, !isSpecial(u.scheme));
    if (host === null) {
      return URLParseMode.Failure;
    }

    u.host = serializeHost(host);
    b = '';
    return m
      ? URLParseMode.Success
      : continueParse(start, c)
        ? parsePathStart(codePointAt(i, p))
        : URLParseMode.Success;
  } else {
    b += codePointToString(c);
    return continueParse(start, c)
      ? parseHostname(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parsePort: Parser = c => {
  const start = p;
  if (c != null && c >= 0x30 && c <= 0x39 /*0-9*/) {
    let end = p + 1;
    while (end < i.length) {
      const next = i.charCodeAt(end);
      if (next < 0x30 || next > 0x39) break;
      end++;
    }
    b += i.slice(p, end);
    p = end - 1;
    return continueParse(start, c)
      ? parsePort(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (
    m ||
    c == null ||
    c === 35 /*'#'*/ ||
    c === 47 /*'/'*/ ||
    c === 63 /*'?'*/ ||
    (c === 92 /*'\\'*/ && isSpecial(u.scheme))
  ) {
    if (b !== '') {
      const port = parseInt(b, 10);
      if (port > 2 ** 16 - 1) {
        return URLParseMode.Failure;
      }
      u.port = port === defaultPort(u.scheme) ? null : port;
      b = '';
      if (m) {
        return URLParseMode.Success;
      }
    }
    if (m) {
      return URLParseMode.Failure;
    } else {
      p--;
      return continueParse(start, c)
        ? parsePathStart(codePointAt(i, p))
        : URLParseMode.Success;
    }
  } else {
    return URLParseMode.Failure;
  }
};

function startsWithWindowsDriveLetter(input: string, pointer: number): boolean {
  const length = input.length - pointer;
  if (length < 2) {
    return false;
  }
  const c0 = codePointAt(input, pointer)!;
  const c1 = codePointAt(input, pointer + 1)!;
  if (!isWindowsDriveLetterCodePoints(c0, c1)) {
    return false;
  } else if (length === 2) {
    return true;
  } else {
    const c2 = codePointAt(input, pointer + 2);
    return (
      c2 === 47 /*'/'*/ ||
      c2 === 92 /*'\\'*/ ||
      c2 === 63 /*'?'*/ ||
      c2 === 35 /*'#'*/
    );
  }
}

const parseFile: Parser = c => {
  const start = p;
  u.scheme = 'file';
  u.host = '';
  if (c === 47 /*'/'*/ || c === 92 /*'\\'*/) {
    return continueParse(start, c)
      ? parseFileSlash(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (v?.scheme === 'file') {
    u.host = v.host;
    u.path = v.path.slice();
    u.opaquePath = v.opaquePath;
    u.query = v.query;
    if (c === 63 /*'?'*/) {
      u.query = '';
      return continueParse(start, c)
        ? parseQuery(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (c === 35 /*'#'*/) {
      u.fragment = '';
      return continueParse(start, c)
        ? parseFragment(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (c != null) {
      u.query = null;
      if (!startsWithWindowsDriveLetter(i, p)) {
        shortenPath(u);
      } else {
        u.path = [];
      }
      p--;
      return continueParse(start, c)
        ? parsePath(codePointAt(i, p))
        : URLParseMode.Success;
    } else {
      return continueParse(start, c)
        ? parseFile(codePointAt(i, p))
        : URLParseMode.Success;
    }
  } else {
    p--;
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseFileSlash: Parser = c => {
  const start = p;
  if (c === 47 /*'/'*/ || c === 92 /*'\\'*/) {
    return continueParse(start, c)
      ? parseFileHost(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    if (v !== null && v.scheme === 'file') {
      if (
        !startsWithWindowsDriveLetter(i, p) &&
        isNormalizedWindowsDriveLetterString(v.path[0])
      ) {
        u.path.push(v.path[0]);
      }
      u.host = v.host;
    }
    p--;
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseFileHost: Parser = c => {
  const start = p;
  if (
    c != null &&
    c !== 47 /*'/'*/ &&
    c !== 92 /*'\\'*/ &&
    c !== 63 /*'?'*/ &&
    c !== 35 /*'#'*/
  ) {
    let end = p + codePointSize(c);
    while (end < i.length) {
      const next = codePointAt(i, end);
      if (
        next == null ||
        next === 47 /*'/'*/ ||
        next === 92 /*'\\'*/ ||
        next === 63 /*'?'*/ ||
        next === 35 /*'#'*/
      ) {
        break;
      }
      end += codePointSize(next);
    }
    b += i.slice(p, end);
    p = end - 1;
    return continueParse(start, c)
      ? parseFileHost(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (
    c == null ||
    c === 47 /*'/'*/ ||
    c === 92 /*'\\'*/ ||
    c === 63 /*'?'*/ ||
    c === 35 /*'#'*/
  ) {
    p--;
    if (!m && isWindowsDriveLetterString(b)) {
      return continueParse(start, c)
        ? parsePath(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (b === '') {
      u.host = '';
      return m
        ? URLParseMode.Success
        : continueParse(start, c)
          ? parsePathStart(codePointAt(i, p))
          : URLParseMode.Success;
    } else {
      let host = parseHost(b, !isSpecial(u.scheme));
      if (host === null) {
        return URLParseMode.Failure;
      }
      if (host === 'localhost') {
        host = '';
      }
      u.host = serializeHost(host);
      b = '';
      return m
        ? URLParseMode.Success
        : continueParse(start, c)
          ? parsePathStart(codePointAt(i, p))
          : URLParseMode.Success;
    }
  }
  return URLParseMode.Failure;
};

const parsePathStart: Parser = c => {
  const start = p;
  if (isSpecial(u.scheme)) {
    if (c !== 92 /*'\\'*/ && c !== 47 /*'/'*/) {
      p--;
    }
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (!m && c === 63 /*'?'*/) {
    u.query = '';
    return continueParse(start, c)
      ? parseQuery(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (!m && c === 35 /*'#'*/) {
    u.fragment = '';
    return continueParse(start, c)
      ? parseFragment(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (c != null) {
    if (c !== 47 /*'/'*/) p--;
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (m && u.host === null) {
    u.path.push('');
    return continueParse(start, c)
      ? parsePathStart(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    return continueParse(start, c)
      ? parsePathStart(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parsePath: Parser = c => {
  const start = p;
  if (
    c != null &&
    c !== 47 /*'/'*/ &&
    !(isSpecial(u.scheme) && c === 92) /*'\\'*/ &&
    (m || (c !== 63 /*'?'*/ && c !== 35)) /*'#'*/
  ) {
    let end = p + codePointSize(c);
    while (end < i.length) {
      const next = codePointAt(i, end);
      if (
        next == null ||
        next === 47 /*'/'*/ ||
        (isSpecial(u.scheme) && next === 92) /*'\\'*/ ||
        (!m && (next === 63 /*'?'*/ || next === 35)) /*'#'*/
      ) {
        break;
      }
      end += codePointSize(next);
    }
    b += utf8PercentEncodeString(i.slice(p, end), isPathPercentEncode);
    p = end;
    c = codePointAt(i, end);
  }

  if (
    c == null ||
    c === 47 /*'/'*/ ||
    (isSpecial(u.scheme) && c === 92) /*'\\'*/ ||
    (!m && (c === 63 /*'?'*/ || c === 35)) /*'#'*/
  ) {
    const hasInvalidEscape = isSpecial(u.scheme) && c === 92; /*'\\'*/
    if (isDoubleDot(b)) {
      shortenPath(u);
      if (c !== 47 /*'/'*/ && !hasInvalidEscape) u.path.push('');
    } else if (isSingleDot(b) && c !== 47 /*'/'*/ && !hasInvalidEscape) {
      u.path.push('');
    } else if (!isSingleDot(b)) {
      if (
        u.scheme === 'file' &&
        u.path.length === 0 &&
        isWindowsDriveLetterString(b)
      )
        b = `${b[0]}:`;
      u.path.push(b);
    }
    b = '';
    if (c === 63 /*'?'*/) {
      u.query = '';
      return continueParse(start, c)
        ? parseQuery(codePointAt(i, p))
        : URLParseMode.Success;
    } else if (c === 35 /*'#'*/) {
      u.fragment = '';
      return continueParse(start, c)
        ? parseFragment(codePointAt(i, p))
        : URLParseMode.Success;
    } else {
      return continueParse(start, c)
        ? parsePath(codePointAt(i, p))
        : URLParseMode.Success;
    }
  } else {
    b += utf8PercentEncodeCodePoint(c, isPathPercentEncode);
    return continueParse(start, c)
      ? parsePath(codePointAt(i, p))
      : URLParseMode.Success;
  }
};

const parseOpaquePath: Parser = c => {
  const start = p;
  if (c === 63 /*'?'*/) {
    u.query = '';
    return continueParse(start, c)
      ? parseQuery(codePointAt(i, p))
      : URLParseMode.Success;
  } else if (c === 35 /*'#'*/) {
    u.fragment = '';
    return continueParse(start, c)
      ? parseFragment(codePointAt(i, p))
      : URLParseMode.Success;
  } else {
    if (c != null) {
      let end = p + codePointSize(c);
      while (end < i.length) {
        const next = codePointAt(i, end);
        if (next === 63 /*'?'*/ || next === 35 /*'#'*/) break;
        end += codePointSize(next);
      }

      const segment = i.slice(p, end);
      if (
        end < i.length &&
        segment.charCodeAt(segment.length - 1) === 32 /*' '*/
      ) {
        u.path[0] +=
          utf8PercentEncodeString(
            segment.slice(0, -1),
            isC0ControlPercentEncode
          ) + '%20';
      } else {
        u.path[0] += utf8PercentEncodeString(segment, isC0ControlPercentEncode);
      }

      p = end;
      c = codePointAt(i, end);
      if (c === 63 /*'?'*/) {
        u.query = '';
        return continueParse(start, c)
          ? parseQuery(codePointAt(i, p))
          : URLParseMode.Success;
      } else if (c === 35 /*'#'*/) {
        u.fragment = '';
        return continueParse(start, c)
          ? parseFragment(codePointAt(i, p))
          : URLParseMode.Success;
      }
    }
    return continueParse(start, c)
      ? parseOpaquePath(codePointAt(i, p))
      : URLParseMode.Success;
  }
};
const parseQuery: Parser = c => {
  const start = p;
  let end = p;
  if (c != null) {
    if (!m) {
      const fragmentIdx = i.indexOf('#', p);
      end = fragmentIdx === -1 ? i.length : fragmentIdx;
    } else {
      end = i.length;
    }
    const queryPercentEncodePredicate = isSpecial(u.scheme)
      ? isSpecialQueryPercentEncode
      : isQueryPercentEncode;
    u.query += utf8PercentEncodeString(
      i.slice(p, end),
      queryPercentEncodePredicate
    );
  }
  p = end;
  if (codePointAt(i, end) === 35 /*'#'*/ && !m) {
    u.fragment = '';
    return continueParse(start, c)
      ? parseFragment(codePointAt(i, p))
      : URLParseMode.Success;
  }
  return continueParse(start, c)
    ? parseQuery(codePointAt(i, p))
    : URLParseMode.Success;
};

const parseFragment: Parser = c => {
  const start = p;
  if (c != null) {
    u.fragment += utf8PercentEncodeString(i.slice(p), isFragmentPercentEncode);
    p = i.length;
  }
  return continueParse(start, c)
    ? parseFragment(codePointAt(i, p))
    : URLParseMode.Success;
};

export function serializeURL(
  url: URLAbstract,
  excludeFragment: boolean
): string {
  let output = `${url.scheme}:`;
  if (url.host !== null) {
    output += '//';
    if (url.username !== '' || url.password !== '') {
      output += url.username;
      if (url.password !== '') {
        output += `:${url.password}`;
      }
      output += '@';
    }
    output += url.host;
    if (url.port !== null) {
      output += `:${url.port}`;
    }
  }
  if (
    url.host === null &&
    !url.opaquePath &&
    url.path.length > 1 &&
    url.path[0] === ''
  )
    output += '/.';
  output += serializePath(url);
  if (url.query !== null) output += `?${url.query}`;
  if (!excludeFragment && url.fragment !== null) output += `#${url.fragment}`;
  return output;
}

function serializeOrigin(url: URLAbstract): string {
  let result = `${url.scheme}://`;
  result += url.host;
  if (url.port !== null) result += `:${url.port}`;
  return result;
}

export function serializePath(url: URLAbstract): string {
  if (url.opaquePath) {
    return url.path[0];
  } else {
    let output = '';
    for (const segment of url.path) output += `/${segment}`;
    return output;
  }
}

export function serializeURLOrigin(url: URLAbstract): string {
  // https://url.spec.whatwg.org/#concept-url-origin
  switch (url.scheme) {
    case 'blob': {
      const pathURL = parseURL(
        serializePath(url),
        null,
        null,
        URLParseMode.Success
      );
      if (pathURL === null) {
        return 'null';
      } else if (pathURL.scheme !== 'http' && pathURL.scheme !== 'https') {
        return 'null';
      } else {
        return serializeURLOrigin(pathURL);
      }
    }

    case 'ftp':
    case 'http':
    case 'https':
    case 'ws':
    case 'wss':
      return serializeOrigin(url);

    case 'file':
      // The spec says:
      // > Unfortunate as it is, this is left as an exercise to the reader. When in doubt, return a new opaque origin.
      // Browsers tested so far:
      // - Chrome says "file://", but treats file: URLs as cross-origin for most (all?) purposes; see e.g.
      //   https://bugs.chromium.org/p/chromium/issues/detail?id=37586
      // - Firefox says "null", but treats file: URLs as same-origin sometimes based on directory stuff; see
      //   https://developer.mozilla.org/en-US/docs/Archive/Misc_top_level/Same-origin_policy_for_file:_URIs
      return 'null';

    default:
      return 'null';
  }
}

export function setURLUsername(url: URLAbstract, username: string): void {
  url.username = utf8PercentEncodeString(username, isUserinfoPercentEncode);
}

export function setURLPassword(url: URLAbstract, password: string): void {
  url.password = utf8PercentEncodeString(password, isUserinfoPercentEncode);
}
