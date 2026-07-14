import {
  utf8Decode,
  percentDecodeString,
  utf8PercentEncodeCodePoint,
  utf8PercentEncodeString,
  isC0ControlPercentEncode,
  isFragmentPercentEncode,
  isQueryPercentEncode,
  isSpecialQueryPercentEncode,
  isPathPercentEncode,
  isUserinfoPercentEncode,
  normalizeDomain,
} from './encoding';

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
      input.indexOf('%') === -1
        ? input
        : utf8Decode(percentDecodeString(input));
    // NOTE(@kitten): This fixes a bug in whatwg-url-without-unicode where domain isn't normalized to be lowercase
    if (isIPv4(domain)) {
      return parseIPv4(domain);
    } else if (containsForbiddenHostCodePoint(domain)) {
      return null;
    } else {
      return normalizeDomain(domain);
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

interface URLParseState {
  pointer: number;
  input: string;
  buffer: string;
  base: URLAbstract | null;
  url: URLAbstract;
  failure: boolean;
  atSignSeen: boolean;
  passwordTokenSeen: boolean;
  insideBrackets: boolean;
  initialMode: URLParseMode;
}

interface Parser {
  (state: URLParseState, c: number | undefined): URLParseMode;
}

export const enum URLParseMode {
  Success = 0,
  Failure,
  SchemeStart,
  Scheme,
  NoScheme,
  SpecialRelativeOrAuthority,
  PathOrAuthority,
  Relative,
  RelativeSlash,
  SpecialAuthoritySlashes,
  SpecialAuthorityIgnoreSlashes,
  Authority,
  Host,
  Hostname,
  Port,
  File,
  FileSlash,
  FileHost,
  PathStart,
  Path,
  OpaquePath,
  Query,
  Fragment,
}

export function parseURLRaw(
  input: string,
  url: URLAbstract | null,
  base: URLAbstract | null,
  initialMode: URLParseMode | null
): URLParseState {
  if (!url) {
    input = trimControlChars(input);
  }
  input = trimTabAndNewline(input);

  const state: URLParseState = {
    pointer: 0,
    input,
    buffer: '',
    base: base || null,
    url: url || {
      scheme: '',
      username: '',
      password: '',
      host: null,
      port: null,
      path: [],
      query: null,
      fragment: null,
      opaquePath: false,
    },
    failure: false,
    atSignSeen: false,
    passwordTokenSeen: false,
    insideBrackets: false,
    initialMode: initialMode || URLParseMode.Success,
  };

  state.failure =
    parserForMode(initialMode || URLParseMode.SchemeStart)(
      state,
      codePointAt(input, state.pointer)
    ) === URLParseMode.Failure;

  return state;
}

export function parseURL(
  input: string,
  url: URLAbstract | null,
  base: URLAbstract | null,
  initialMode: URLParseMode
): URLAbstract | null {
  const usm = parseURLRaw(input, url, base, initialMode);
  return !usm.failure ? usm.url : null;
}

function parserForMode(mode: URLParseMode): Parser {
  switch (mode) {
    case URLParseMode.SchemeStart:
      return parseSchemeStart;
    case URLParseMode.Scheme:
      return parseScheme;
    case URLParseMode.NoScheme:
      return parseNoScheme;
    case URLParseMode.SpecialRelativeOrAuthority:
      return parseSpecialRelativeOrAuthority;
    case URLParseMode.PathOrAuthority:
      return parsePathOrAuthority;
    case URLParseMode.Relative:
      return parseRelative;
    case URLParseMode.RelativeSlash:
      return parseRelativeSlash;
    case URLParseMode.SpecialAuthoritySlashes:
      return parseSpecialAuthoritySlashes;
    case URLParseMode.SpecialAuthorityIgnoreSlashes:
      return parseSpecialAuthorityIgnoreSlashes;
    case URLParseMode.Authority:
      return parseAuthority;
    case URLParseMode.Host:
    case URLParseMode.Hostname:
      return parseHostname;
    case URLParseMode.Port:
      return parsePort;
    case URLParseMode.File:
      return parseFile;
    case URLParseMode.FileSlash:
      return parseFileSlash;
    case URLParseMode.FileHost:
      return parseFileHost;
    case URLParseMode.PathStart:
      return parsePathStart;
    case URLParseMode.Path:
      return parsePath;
    case URLParseMode.OpaquePath:
      return parseOpaquePath;
    case URLParseMode.Query:
      return parseQuery;
    case URLParseMode.Fragment:
      return parseFragment;
    default:
      return parseSchemeStart;
  }
}

function continueParse(
  state: URLParseState,
  pointer: number,
  c: number | undefined
): boolean {
  state.pointer += state.pointer === pointer ? codePointSize(c) : 1;
  return state.pointer <= state.input.length;
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

const parseSchemeStart: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c != null &&
    ((c >= 0x41 && c <= 0x5a) /*A-Z*/ || (c >= 0x61 && c <= 0x7a)) /*a-z*/
  ) {
    let pointer = state.pointer;
    do {
      state.buffer += asciiLowercaseCodePointToString(c);
      pointer += codePointSize(c);
      c = codePointAt(state.input, pointer);
    } while (
      c != null &&
      (c === 43 /*'+'*/ ||
        c === 45 /*'-'*/ ||
        c === 46 /*'.'*/ ||
        (c >= 0x41 && c <= 0x5a) /*A-Z*/ ||
        (c >= 0x61 && c <= 0x7a) /*a-z*/ ||
        (c >= 0x30 && c <= 0x39)) /*0-9*/
    );
    state.pointer = pointer;
    return parseScheme(state, c);
  } else if (!state.initialMode) {
    --state.pointer;
    return continueParse(state, start, c)
      ? parseNoScheme(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    return URLParseMode.Failure;
  }
};

const parseScheme: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c != null &&
    (c === 43 /*'+'*/ ||
      c === 45 /*'-'*/ ||
      c === 46 /*'.'*/ ||
      (c >= 0x41 && c <= 0x5a) /*A-Z*/ ||
      (c >= 0x61 && c <= 0x7a) /*a-z*/ ||
      (c >= 0x30 && c <= 0x39)) /*0-9*/
  ) {
    state.buffer += asciiLowercaseCodePointToString(c);
    return continueParse(state, start, c)
      ? parseScheme(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (c === 58 /*':'*/) {
    if (state.initialMode) {
      if (isSpecial(state.url.scheme) !== isSpecial(state.buffer)) {
        return URLParseMode.Success;
      } else if (
        (includesCredentials(state.url) || state.url.port !== null) &&
        state.buffer === 'file'
      ) {
        return URLParseMode.Success;
      } else if (state.url.scheme === 'file' && state.url.host === '') {
        return URLParseMode.Success;
      }
    }

    state.url.scheme = state.buffer;
    if (state.initialMode) {
      if (state.url.port === defaultPort(state.url.scheme))
        state.url.port = null;
      return URLParseMode.Success;
    }

    state.buffer = '';
    if (state.url.scheme === 'file') {
      return continueParse(state, start, c)
        ? parseFile(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (
      isSpecial(state.url.scheme) &&
      state.base !== null &&
      state.base.scheme === state.url.scheme
    ) {
      return continueParse(state, start, c)
        ? parseSpecialRelativeOrAuthority(
            state,
            codePointAt(state.input, state.pointer)
          )
        : URLParseMode.Success;
    } else if (isSpecial(state.url.scheme)) {
      return continueParse(state, start, c)
        ? parseSpecialAuthoritySlashes(
            state,
            codePointAt(state.input, state.pointer)
          )
        : URLParseMode.Success;
    } else if (codePointAt(state.input, state.pointer + 1) === 47 /*'/'*/) {
      state.pointer++;
      return continueParse(state, start, c)
        ? parsePathOrAuthority(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else {
      state.url.path = [''];
      state.url.opaquePath = true;
      return continueParse(state, start, c)
        ? parseOpaquePath(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    }
  } else if (!state.initialMode) {
    state.buffer = '';
    state.pointer = -1;
    return continueParse(state, start, c)
      ? parseNoScheme(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    return URLParseMode.Failure;
  }
};

const parseNoScheme: Parser = (state, c) => {
  const start = state.pointer;
  if (state.base === null || (state.base.opaquePath && c !== 35) /*'#'*/) {
    return URLParseMode.Failure;
  } else if (state.base.opaquePath && c === 35 /*'#'*/) {
    state.url.scheme = state.base.scheme;
    state.url.path = state.base.path.slice();
    state.url.opaquePath = state.base.opaquePath;
    state.url.query = state.base.query;
    state.url.fragment = '';
    return continueParse(state, start, c)
      ? parseFragment(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (state.base.scheme === 'file') {
    state.pointer--;
    return continueParse(state, start, c)
      ? parseFile(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    state.pointer--;
    return continueParse(state, start, c)
      ? parseRelative(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseSpecialRelativeOrAuthority: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c === 47 /*'/'*/ &&
    codePointAt(state.input, state.pointer + 1) === 47 /*'/'*/
  ) {
    ++state.pointer;
    return continueParse(state, start, c)
      ? parseSpecialAuthorityIgnoreSlashes(
          state,
          codePointAt(state.input, state.pointer)
        )
      : URLParseMode.Success;
  } else {
    state.pointer--;
    return continueParse(state, start, c)
      ? parseRelative(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parsePathOrAuthority: Parser = (state, c) => {
  const start = state.pointer;
  if (c === 47 /*'/'*/) {
    return continueParse(state, start, c)
      ? parseAuthority(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    state.pointer--;
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseRelative: Parser = (state, c) => {
  const start = state.pointer;
  state.url.scheme = state.base!.scheme;
  if (c === 47 /*'/'*/) {
    return continueParse(state, start, c)
      ? parseRelativeSlash(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (isSpecial(state.url.scheme) && c === 92 /*'\\'*/) {
    return continueParse(state, start, c)
      ? parseRelativeSlash(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    state.url.username = state.base!.username;
    state.url.password = state.base!.password;
    state.url.host = state.base!.host;
    state.url.port = state.base!.port;
    state.url.path = state.base!.path.slice();
    state.url.query = state.base!.query;
    if (c === 63 /*'?'*/) {
      state.url.query = '';
      return continueParse(state, start, c)
        ? parseQuery(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return continueParse(state, start, c)
        ? parseFragment(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (c != null) {
      state.url.query = null;
      state.url.path.pop();
      state.pointer--;
      return continueParse(state, start, c)
        ? parsePath(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else {
      return continueParse(state, start, c)
        ? parseRelative(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    }
  }
};

const parseRelativeSlash: Parser = (state, c) => {
  const start = state.pointer;
  if (isSpecial(state.url.scheme) && (c === 47 /*'/'*/ || c === 92) /*'\\'*/) {
    return continueParse(state, start, c)
      ? parseSpecialAuthorityIgnoreSlashes(
          state,
          codePointAt(state.input, state.pointer)
        )
      : URLParseMode.Success;
  } else if (c === 47 /*'/'*/) {
    return continueParse(state, start, c)
      ? parseAuthority(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    state.url.username = state.base!.username;
    state.url.password = state.base!.password;
    state.url.host = state.base!.host;
    state.url.port = state.base!.port;
    state.pointer--;
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseSpecialAuthoritySlashes: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c === 47 /*'/'*/ &&
    codePointAt(state.input, state.pointer + 1) === 47 /*'/'*/
  ) {
    state.pointer++;
  } else {
    state.pointer--;
  }
  return continueParse(state, start, c)
    ? parseSpecialAuthorityIgnoreSlashes(
        state,
        codePointAt(state.input, state.pointer)
      )
    : URLParseMode.Success;
};

const parseSpecialAuthorityIgnoreSlashes: Parser = (state, c) => {
  const start = state.pointer;
  if (c !== 47 /*'/*/ && c !== 92 /*'\\'*/) {
    state.pointer--;
    return continueParse(state, start, c)
      ? parseAuthority(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    return continueParse(state, start, c)
      ? parseSpecialAuthorityIgnoreSlashes(
          state,
          codePointAt(state.input, state.pointer)
        )
      : URLParseMode.Success;
  }
};

const parseAuthority: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c != null &&
    c !== 64 /*'@'*/ &&
    c !== 35 /*'#'*/ &&
    c !== 47 /*'/'*/ &&
    c !== 63 /*'?'*/ &&
    !(c === 92 /*'\\'*/ && isSpecial(state.url.scheme))
  ) {
    let end = state.pointer + codePointSize(c);
    while (end < state.input.length) {
      const next = codePointAt(state.input, end);
      if (
        next == null ||
        next === 64 /*'@'*/ ||
        next === 35 /*'#'*/ ||
        next === 47 /*'/'*/ ||
        next === 63 /*'?'*/ ||
        (next === 92 /*'\\'*/ && isSpecial(state.url.scheme))
      ) {
        break;
      }
      end += codePointSize(next);
    }
    state.buffer += state.input.slice(state.pointer, end);
    state.pointer = end - 1;
    return continueParse(state, start, c)
      ? parseAuthority(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }

  if (c === 64 /*'@'*/) {
    if (state.atSignSeen) state.buffer = `%40${state.buffer}`;
    state.atSignSeen = true;
    for (let idx = 0; idx < state.buffer.length; idx++) {
      const codePoint = state.buffer.codePointAt(idx);
      if (codePoint === 58 /*':'*/ && !state.passwordTokenSeen) {
        state.passwordTokenSeen = true;
        continue;
      }
      const encodedCodePoints = utf8PercentEncodeCodePoint(
        codePoint,
        isUserinfoPercentEncode
      );
      if (state.passwordTokenSeen) {
        state.url.password += encodedCodePoints;
      } else {
        state.url.username += encodedCodePoints;
      }
      if (codePoint != null && codePoint > 0xffff) idx++;
    }
    state.buffer = '';
    return continueParse(state, start, c)
      ? parseAuthority(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (
    c == null ||
    c === 35 /*'#'*/ ||
    c === 47 /*'/'*/ ||
    c === 63 /*'?'*/ ||
    (c === 92 /*'\\'*/ && isSpecial(state.url.scheme))
  ) {
    if (state.atSignSeen && state.buffer === '') {
      return URLParseMode.Failure;
    }
    state.pointer -= state.buffer.length + 1;
    state.buffer = '';
    return continueParse(state, start, c)
      ? parseHostname(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    state.buffer += codePointToString(c);
    return continueParse(state, start, c)
      ? parseAuthority(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseHostname: Parser = (state, c) => {
  const start = state.pointer;
  if (state.initialMode && state.url.scheme === 'file') {
    state.pointer--;
    return continueParse(state, start, c)
      ? parseFileHost(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (
    c != null &&
    c !== 58 /*':'*/ &&
    c !== 35 /*'#'*/ &&
    c !== 47 /*'/'*/ &&
    c !== 63 /*'?'*/ &&
    !(c === 92 /*'\\'*/ && isSpecial(state.url.scheme))
  ) {
    let end = state.pointer + codePointSize(c);
    if (c === 91 /*'['*/) state.insideBrackets = true;
    else if (c === 93 /*']'*/) state.insideBrackets = false;

    while (end < state.input.length) {
      const next = codePointAt(state.input, end);
      if (
        next == null ||
        (!state.insideBrackets && next === 58) /*':'*/ ||
        next === 35 /*'#'*/ ||
        next === 47 /*'/'*/ ||
        next === 63 /*'?'*/ ||
        (next === 92 /*'\\'*/ && isSpecial(state.url.scheme))
      ) {
        break;
      }
      if (next === 91 /*'['*/) state.insideBrackets = true;
      else if (next === 93 /*']'*/) state.insideBrackets = false;
      end += codePointSize(next);
    }

    state.buffer += state.input.slice(state.pointer, end);
    state.pointer = end - 1;
    return continueParse(state, start, c)
      ? parseHostname(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (c === 58 /*':'*/ && !state.insideBrackets) {
    if (state.buffer === '') {
      return URLParseMode.Failure;
    }

    if (state.initialMode === URLParseMode.Hostname) {
      return URLParseMode.Failure;
    }

    const host = parseHost(state.buffer, !isSpecial(state.url.scheme));
    if (host === null) {
      return URLParseMode.Failure;
    }

    state.url.host = serializeHost(host);
    state.buffer = '';
    return continueParse(state, start, c)
      ? parsePort(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (
    c == null ||
    c === 35 /*'#'*/ ||
    c === 47 /*'/'*/ ||
    c === 63 /*'?'*/ ||
    (c === 92 /*'\\'*/ && isSpecial(state.url.scheme))
  ) {
    state.pointer--;
    if (isSpecial(state.url.scheme) && state.buffer === '') {
      return URLParseMode.Failure;
    } else if (
      state.initialMode &&
      state.buffer === '' &&
      (includesCredentials(state.url) || state.url.port !== null)
    ) {
      return URLParseMode.Failure;
    }

    const host = parseHost(state.buffer, !isSpecial(state.url.scheme));
    if (host === null) {
      return URLParseMode.Failure;
    }

    state.url.host = serializeHost(host);
    state.buffer = '';
    return state.initialMode
      ? URLParseMode.Success
      : continueParse(state, start, c)
        ? parsePathStart(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
  } else {
    state.buffer += codePointToString(c);
    return continueParse(state, start, c)
      ? parseHostname(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parsePort: Parser = (state, c) => {
  const start = state.pointer;
  if (c != null && c >= 0x30 && c <= 0x39 /*0-9*/) {
    let end = state.pointer + 1;
    while (end < state.input.length) {
      const next = state.input.charCodeAt(end);
      if (next < 0x30 || next > 0x39) break;
      end++;
    }
    state.buffer += state.input.slice(state.pointer, end);
    state.pointer = end - 1;
    return continueParse(state, start, c)
      ? parsePort(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (
    state.initialMode ||
    c == null ||
    c === 35 /*'#'*/ ||
    c === 47 /*'/'*/ ||
    c === 63 /*'?'*/ ||
    (c === 92 /*'\\'*/ && isSpecial(state.url.scheme))
  ) {
    if (state.buffer !== '') {
      const port = parseInt(state.buffer, 10);
      if (port > 2 ** 16 - 1) {
        return URLParseMode.Failure;
      }
      state.url.port = port === defaultPort(state.url.scheme) ? null : port;
      state.buffer = '';
      if (state.initialMode) {
        return URLParseMode.Success;
      }
    }
    if (state.initialMode) {
      return URLParseMode.Failure;
    } else {
      state.pointer--;
      return continueParse(state, start, c)
        ? parsePathStart(state, codePointAt(state.input, state.pointer))
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

const parseFile: Parser = (state, c) => {
  const start = state.pointer;
  state.url.scheme = 'file';
  state.url.host = '';
  if (c === 47 /*'/'*/ || c === 92 /*'\\'*/) {
    return continueParse(state, start, c)
      ? parseFileSlash(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (state.base?.scheme === 'file') {
    state.url.host = state.base.host;
    state.url.path = state.base.path.slice();
    state.url.opaquePath = state.base.opaquePath;
    state.url.query = state.base.query;
    if (c === 63 /*'?'*/) {
      state.url.query = '';
      return continueParse(state, start, c)
        ? parseQuery(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return continueParse(state, start, c)
        ? parseFragment(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (c != null) {
      state.url.query = null;
      if (!startsWithWindowsDriveLetter(state.input, state.pointer)) {
        shortenPath(state.url);
      } else {
        state.url.path = [];
      }
      state.pointer--;
      return continueParse(state, start, c)
        ? parsePath(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else {
      return continueParse(state, start, c)
        ? parseFile(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    }
  } else {
    state.pointer--;
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseFileSlash: Parser = (state, c) => {
  const start = state.pointer;
  if (c === 47 /*'/'*/ || c === 92 /*'\\'*/) {
    return continueParse(state, start, c)
      ? parseFileHost(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    if (state.base !== null && state.base.scheme === 'file') {
      if (
        !startsWithWindowsDriveLetter(state.input, state.pointer) &&
        isNormalizedWindowsDriveLetterString(state.base.path[0])
      ) {
        state.url.path.push(state.base.path[0]);
      }
      state.url.host = state.base.host;
    }
    state.pointer--;
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseFileHost: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c != null &&
    c !== 47 /*'/'*/ &&
    c !== 92 /*'\\'*/ &&
    c !== 63 /*'?'*/ &&
    c !== 35 /*'#'*/
  ) {
    let end = state.pointer + codePointSize(c);
    while (end < state.input.length) {
      const next = codePointAt(state.input, end);
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
    state.buffer += state.input.slice(state.pointer, end);
    state.pointer = end - 1;
    return continueParse(state, start, c)
      ? parseFileHost(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (
    c == null ||
    c === 47 /*'/'*/ ||
    c === 92 /*'\\'*/ ||
    c === 63 /*'?'*/ ||
    c === 35 /*'#'*/
  ) {
    state.pointer--;
    if (!state.initialMode && isWindowsDriveLetterString(state.buffer)) {
      return continueParse(state, start, c)
        ? parsePath(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (state.buffer === '') {
      state.url.host = '';
      return state.initialMode
        ? URLParseMode.Success
        : continueParse(state, start, c)
          ? parsePathStart(state, codePointAt(state.input, state.pointer))
          : URLParseMode.Success;
    } else {
      let host = parseHost(state.buffer, !isSpecial(state.url.scheme));
      if (host === null) {
        return URLParseMode.Failure;
      }
      if (host === 'localhost') {
        host = '';
      }
      state.url.host = serializeHost(host);
      state.buffer = '';
      return state.initialMode
        ? URLParseMode.Success
        : continueParse(state, start, c)
          ? parsePathStart(state, codePointAt(state.input, state.pointer))
          : URLParseMode.Success;
    }
  }
  return URLParseMode.Failure;
};

const parsePathStart: Parser = (state, c) => {
  const start = state.pointer;
  if (isSpecial(state.url.scheme)) {
    if (c !== 92 /*'\\'*/ && c !== 47 /*'/'*/) {
      state.pointer--;
    }
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (!state.initialMode && c === 63 /*'?'*/) {
    state.url.query = '';
    return continueParse(state, start, c)
      ? parseQuery(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (!state.initialMode && c === 35 /*'#'*/) {
    state.url.fragment = '';
    return continueParse(state, start, c)
      ? parseFragment(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (c != null) {
    if (c !== 47 /*'/'*/) state.pointer--;
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (state.initialMode && state.url.host === null) {
    state.url.path.push('');
    return continueParse(state, start, c)
      ? parsePathStart(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    return continueParse(state, start, c)
      ? parsePathStart(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parsePath: Parser = (state, c) => {
  const start = state.pointer;
  if (
    c != null &&
    c !== 47 /*'/'*/ &&
    !(isSpecial(state.url.scheme) && c === 92) /*'\\'*/ &&
    (state.initialMode || (c !== 63 /*'?'*/ && c !== 35)) /*'#'*/
  ) {
    let end = state.pointer + codePointSize(c);
    while (end < state.input.length) {
      const next = codePointAt(state.input, end);
      if (
        next == null ||
        next === 47 /*'/'*/ ||
        (isSpecial(state.url.scheme) && next === 92) /*'\\'*/ ||
        (!state.initialMode && (next === 63 /*'?'*/ || next === 35)) /*'#'*/
      ) {
        break;
      }
      end += codePointSize(next);
    }
    state.buffer += utf8PercentEncodeString(
      state.input.slice(state.pointer, end),
      isPathPercentEncode
    );
    state.pointer = end;
    c = codePointAt(state.input, end);
  }

  if (
    c == null ||
    c === 47 /*'/'*/ ||
    (isSpecial(state.url.scheme) && c === 92) /*'\\'*/ ||
    (!state.initialMode && (c === 63 /*'?'*/ || c === 35)) /*'#'*/
  ) {
    const hasInvalidEscape = isSpecial(state.url.scheme) && c === 92; /*'\\'*/
    if (isDoubleDot(state.buffer)) {
      shortenPath(state.url);
      if (c !== 47 /*'/'*/ && !hasInvalidEscape) state.url.path.push('');
    } else if (
      isSingleDot(state.buffer) &&
      c !== 47 /*'/'*/ &&
      !hasInvalidEscape
    ) {
      state.url.path.push('');
    } else if (!isSingleDot(state.buffer)) {
      if (
        state.url.scheme === 'file' &&
        state.url.path.length === 0 &&
        isWindowsDriveLetterString(state.buffer)
      )
        state.buffer = `${state.buffer[0]}:`;
      state.url.path.push(state.buffer);
    }
    state.buffer = '';
    if (c === 63 /*'?'*/) {
      state.url.query = '';
      return continueParse(state, start, c)
        ? parseQuery(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return continueParse(state, start, c)
        ? parseFragment(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    } else {
      return continueParse(state, start, c)
        ? parsePath(state, codePointAt(state.input, state.pointer))
        : URLParseMode.Success;
    }
  } else {
    state.buffer += utf8PercentEncodeCodePoint(c, isPathPercentEncode);
    return continueParse(state, start, c)
      ? parsePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};

const parseOpaquePath: Parser = (state, c) => {
  const start = state.pointer;
  if (c === 63 /*'?'*/) {
    state.url.query = '';
    return continueParse(state, start, c)
      ? parseQuery(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else if (c === 35 /*'#'*/) {
    state.url.fragment = '';
    return continueParse(state, start, c)
      ? parseFragment(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  } else {
    if (c != null) {
      let end = state.pointer + codePointSize(c);
      while (end < state.input.length) {
        const next = codePointAt(state.input, end);
        if (next === 63 /*'?'*/ || next === 35 /*'#'*/) break;
        end += codePointSize(next);
      }

      const segment = state.input.slice(state.pointer, end);
      if (
        end < state.input.length &&
        segment.charCodeAt(segment.length - 1) === 32 /*' '*/
      ) {
        state.url.path[0] +=
          utf8PercentEncodeString(
            segment.slice(0, -1),
            isC0ControlPercentEncode
          ) + '%20';
      } else {
        state.url.path[0] += utf8PercentEncodeString(
          segment,
          isC0ControlPercentEncode
        );
      }

      state.pointer = end;
      c = codePointAt(state.input, end);
      if (c === 63 /*'?'*/) {
        state.url.query = '';
        return continueParse(state, start, c)
          ? parseQuery(state, codePointAt(state.input, state.pointer))
          : URLParseMode.Success;
      } else if (c === 35 /*'#'*/) {
        state.url.fragment = '';
        return continueParse(state, start, c)
          ? parseFragment(state, codePointAt(state.input, state.pointer))
          : URLParseMode.Success;
      }
    }
    return continueParse(state, start, c)
      ? parseOpaquePath(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
};
const parseQuery: Parser = (state, c) => {
  const start = state.pointer;
  let end = state.pointer;
  if (c != null) {
    if (!state.initialMode) {
      const fragmentIdx = state.input.indexOf('#', state.pointer);
      end = fragmentIdx === -1 ? state.input.length : fragmentIdx;
    } else {
      end = state.input.length;
    }
    const queryPercentEncodePredicate = isSpecial(state.url.scheme)
      ? isSpecialQueryPercentEncode
      : isQueryPercentEncode;
    state.url.query += utf8PercentEncodeString(
      state.input.slice(state.pointer, end),
      queryPercentEncodePredicate
    );
  }
  state.pointer = end;
  if (codePointAt(state.input, end) === 35 /*'#'*/ && !state.initialMode) {
    state.url.fragment = '';
    return continueParse(state, start, c)
      ? parseFragment(state, codePointAt(state.input, state.pointer))
      : URLParseMode.Success;
  }
  return continueParse(state, start, c)
    ? parseQuery(state, codePointAt(state.input, state.pointer))
    : URLParseMode.Success;
};

const parseFragment: Parser = (state, c) => {
  const start = state.pointer;
  if (c != null) {
    state.url.fragment += utf8PercentEncodeString(
      state.input.slice(state.pointer),
      isFragmentPercentEncode
    );
    state.pointer = state.input.length;
  }
  return continueParse(state, start, c)
    ? parseFragment(state, codePointAt(state.input, state.pointer))
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
