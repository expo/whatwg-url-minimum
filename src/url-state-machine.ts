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

function toCodePoints(input: string): (number | undefined)[] {
  const output: (number | undefined)[] = [];
  for (let idx = 0; idx < input.length; idx++) {
    const c = input.charCodeAt(idx);
    if (c >= 0xd800 && c <= 0xdbff && idx + 1 < input.length) {
      const next = input.charCodeAt(idx + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output.push(((c - 0xd800) << 10) + next - 0xdc00 + 0x10000);
        idx++;
        continue;
      }
    }
    output.push(c);
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
  input: (number | undefined)[];
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
  (state: URLParseState, c: number | undefined, cStr: string): URLParseMode;
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
    input: toCodePoints(input),
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

  for (
    let mode: URLParseMode = initialMode || URLParseMode.SchemeStart;
    state.pointer <= state.input.length;
    ++state.pointer
  ) {
    const c = state.input[state.pointer];
    const cStr = c != null ? String.fromCodePoint(c) : '';
    mode = next(mode, state, c, cStr);
    if (mode === URLParseMode.Success) {
      state.failure = false;
      break;
    } else if (mode === URLParseMode.Failure) {
      state.failure = true;
      break;
    }
  }

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

function next(
  mode: URLParseMode,
  state: URLParseState,
  c: number | undefined,
  cStr: string
) {
  switch (mode) {
    case URLParseMode.Failure:
    case URLParseMode.Success:
      return mode;
    case URLParseMode.SchemeStart:
      return parseSchemeStart(state, c, cStr);
    case URLParseMode.Scheme:
      return parseScheme(state, c, cStr);
    case URLParseMode.NoScheme:
      return parseNoScheme(state, c, cStr);
    case URLParseMode.SpecialRelativeOrAuthority:
      return parseSpecialRelativeOrAuthority(state, c, cStr);
    case URLParseMode.PathOrAuthority:
      return parsePathOrAuthority(state, c, cStr);
    case URLParseMode.Relative:
      return parseRelative(state, c, cStr);
    case URLParseMode.RelativeSlash:
      return parseRelativeSlash(state, c, cStr);
    case URLParseMode.SpecialAuthoritySlashes:
      return parseSpecialAuthoritySlashes(state, c, cStr);
    case URLParseMode.SpecialAuthorityIgnoreSlashes:
      return parseSpecialAuthorityIgnoreSlashes(state, c, cStr);
    case URLParseMode.Authority:
      return parseAuthority(state, c, cStr);
    case URLParseMode.Host:
    case URLParseMode.Hostname:
      return parseHostname(state, c, cStr);
    case URLParseMode.Port:
      return parsePort(state, c, cStr);
    case URLParseMode.File:
      return parseFile(state, c, cStr);
    case URLParseMode.FileSlash:
      return parseFileSlash(state, c, cStr);
    case URLParseMode.FileHost:
      return parseFileHost(state, c, cStr);
    case URLParseMode.PathStart:
      return parsePathStart(state, c, cStr);
    case URLParseMode.Path:
      return parsePath(state, c, cStr);
    case URLParseMode.OpaquePath:
      return parseOpaquePath(state, c, cStr);
    case URLParseMode.Query:
      return parseQuery(state, c, cStr);
    case URLParseMode.Fragment:
      return parseFragment(state, c, cStr);
  }
}

const parseSchemeStart: Parser = (state, c, cStr) => {
  if (
    c != null &&
    ((c >= 0x41 && c <= 0x5a) /*A-Z*/ || (c >= 0x61 && c <= 0x7a)) /*a-z*/
  ) {
    state.buffer += cStr.toLowerCase();
    return URLParseMode.Scheme;
  } else if (!state.initialMode) {
    --state.pointer;
    return URLParseMode.NoScheme;
  } else {
    return URLParseMode.Failure;
  }
};

const parseScheme: Parser = (state, c, cStr) => {
  if (
    c != null &&
    (c === 43 /*'+'*/ ||
      c === 45 /*'-'*/ ||
      c === 46 /*'.'*/ ||
      (c >= 0x41 && c <= 0x5a) /*A-Z*/ ||
      (c >= 0x61 && c <= 0x7a) /*a-z*/ ||
      (c >= 0x30 && c <= 0x39)) /*0-9*/
  ) {
    state.buffer += cStr.toLowerCase();
    return URLParseMode.Scheme;
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
      return URLParseMode.File;
    } else if (
      isSpecial(state.url.scheme) &&
      state.base !== null &&
      state.base.scheme === state.url.scheme
    ) {
      return URLParseMode.SpecialRelativeOrAuthority;
    } else if (isSpecial(state.url.scheme)) {
      return URLParseMode.SpecialAuthoritySlashes;
    } else if (state.input[state.pointer + 1] === 47 /*'/'*/) {
      state.pointer++;
      return URLParseMode.PathOrAuthority;
    } else {
      state.url.path = [''];
      state.url.opaquePath = true;
      return URLParseMode.OpaquePath;
    }
  } else if (!state.initialMode) {
    state.buffer = '';
    state.pointer = -1;
    return URLParseMode.NoScheme;
  } else {
    return URLParseMode.Failure;
  }
};

const parseNoScheme: Parser = (state, c, _cStr) => {
  if (state.base === null || (state.base.opaquePath && c !== 35) /*'#'*/) {
    return URLParseMode.Failure;
  } else if (state.base.opaquePath && c === 35 /*'#'*/) {
    state.url.scheme = state.base.scheme;
    state.url.path = state.base.path.slice();
    state.url.opaquePath = state.base.opaquePath;
    state.url.query = state.base.query;
    state.url.fragment = '';
    return URLParseMode.Fragment;
  } else if (state.base.scheme === 'file') {
    state.pointer--;
    return URLParseMode.File;
  } else {
    state.pointer--;
    return URLParseMode.Relative;
  }
};

const parseSpecialRelativeOrAuthority: Parser = (state, c, _cStr) => {
  if (c === 47 /*'/'*/ && state.input[state.pointer + 1] === 47 /*'/'*/) {
    ++state.pointer;
    return URLParseMode.SpecialAuthorityIgnoreSlashes;
  } else {
    state.pointer--;
    return URLParseMode.Relative;
  }
};

const parsePathOrAuthority: Parser = (state, c, _cStr) => {
  if (c === 47 /*'/'*/) {
    return URLParseMode.Authority;
  } else {
    state.pointer--;
    return URLParseMode.Path;
  }
};

const parseRelative: Parser = (state, c, _cStr) => {
  state.url.scheme = state.base!.scheme;
  if (c === 47 /*'/'*/) {
    return URLParseMode.RelativeSlash;
  } else if (isSpecial(state.url.scheme) && c === 92 /*'\\'*/) {
    return URLParseMode.RelativeSlash;
  } else {
    state.url.username = state.base!.username;
    state.url.password = state.base!.password;
    state.url.host = state.base!.host;
    state.url.port = state.base!.port;
    state.url.path = state.base!.path.slice();
    state.url.query = state.base!.query;
    if (c === 63 /*'?'*/) {
      state.url.query = '';
      return URLParseMode.Query;
    } else if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return URLParseMode.Fragment;
    } else if (c != null) {
      state.url.query = null;
      state.url.path.pop();
      state.pointer--;
      return URLParseMode.Path;
    } else {
      return URLParseMode.Relative;
    }
  }
};

const parseRelativeSlash: Parser = (state, c, _cStr) => {
  if (isSpecial(state.url.scheme) && (c === 47 /*'/'*/ || c === 92) /*'\\'*/) {
    return URLParseMode.SpecialAuthorityIgnoreSlashes;
  } else if (c === 47 /*'/'*/) {
    return URLParseMode.Authority;
  } else {
    state.url.username = state.base!.username;
    state.url.password = state.base!.password;
    state.url.host = state.base!.host;
    state.url.port = state.base!.port;
    state.pointer--;
    return URLParseMode.Path;
  }
};

const parseSpecialAuthoritySlashes: Parser = (state, c, _cStr) => {
  if (c === 47 /*'/'*/ && state.input[state.pointer + 1] === 47 /*'/'*/) {
    state.pointer++;
  } else {
    state.pointer--;
  }
  return URLParseMode.SpecialAuthorityIgnoreSlashes;
};

const parseSpecialAuthorityIgnoreSlashes: Parser = (state, c, _cStr) => {
  if (c !== 47 /*'/*/ && c !== 92 /*'\\'*/) {
    state.pointer--;
    return URLParseMode.Authority;
  } else {
    return URLParseMode.SpecialAuthorityIgnoreSlashes;
  }
};

const parseAuthority: Parser = (state, c, cStr) => {
  if (c === 64 /*'@'*/) {
    if (state.atSignSeen) state.buffer = `%40${state.buffer}`;
    state.atSignSeen = true;
    const bufferCodePoints = Array.from(state.buffer, c => c.codePointAt(0));
    for (let idx = 0; idx < bufferCodePoints.length; idx++) {
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
    }
    state.buffer = '';
    return URLParseMode.Authority;
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
    state.pointer -= [...state.buffer].length + 1;
    state.buffer = '';
    return URLParseMode.Hostname;
  } else {
    state.buffer += cStr;
    return URLParseMode.Authority;
  }
};

const parseHostname: Parser = (state, c, cStr) => {
  if (state.initialMode && state.url.scheme === 'file') {
    state.pointer--;
    return URLParseMode.FileHost;
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
    return URLParseMode.Port;
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
    return state.initialMode ? URLParseMode.Success : URLParseMode.PathStart;
  } else {
    if (c === 91 /*'['*/) {
      state.insideBrackets = true;
    } else if (c === 93 /*']'*/) {
      state.insideBrackets = false;
    }
    state.buffer += cStr;
    return URLParseMode.Hostname;
  }
};

const parsePort: Parser = (state, c, cStr) => {
  if (c != null && c >= 0x30 && c <= 0x39 /*0-9*/) {
    state.buffer += cStr;
    return URLParseMode.Port;
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
      return URLParseMode.PathStart;
    }
  } else {
    return URLParseMode.Failure;
  }
};

function startsWithWindowsDriveLetter(
  input: (number | undefined)[],
  pointer: number
): boolean {
  const length = input.length - pointer;
  if (length < 2) {
    return false;
  }
  const c0 = input[pointer]!;
  const c1 = input[pointer + 1]!;
  if (!isWindowsDriveLetterCodePoints(c0, c1)) {
    return false;
  } else if (length === 2) {
    return true;
  } else {
    const c2 = input[pointer + 2];
    return (
      c2 === 47 /*'/'*/ ||
      c2 === 92 /*'\\'*/ ||
      c2 === 63 /*'?'*/ ||
      c2 === 35 /*'#'*/
    );
  }
}

const parseFile: Parser = (state, c, _cStr) => {
  state.url.scheme = 'file';
  state.url.host = '';
  if (c === 47 /*'/'*/ || c === 92 /*'\\'*/) {
    return URLParseMode.FileSlash;
  } else if (state.base?.scheme === 'file') {
    state.url.host = state.base.host;
    state.url.path = state.base.path.slice();
    state.url.opaquePath = state.base.opaquePath;
    state.url.query = state.base.query;
    if (c === 63 /*'?'*/) {
      state.url.query = '';
      return URLParseMode.Query;
    } else if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return URLParseMode.Fragment;
    } else if (c != null) {
      state.url.query = null;
      if (!startsWithWindowsDriveLetter(state.input, state.pointer)) {
        shortenPath(state.url);
      } else {
        state.url.path = [];
      }
      state.pointer--;
      return URLParseMode.Path;
    } else {
      return URLParseMode.File;
    }
  } else {
    state.pointer--;
    return URLParseMode.Path;
  }
};

const parseFileSlash: Parser = (state, c, _cStr) => {
  if (c === 47 /*'/'*/ || c === 92 /*'\\'*/) {
    return URLParseMode.FileHost;
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
    return URLParseMode.Path;
  }
};

const parseFileHost: Parser = (state, c, cStr) => {
  if (
    c == null ||
    c === 47 /*'/'*/ ||
    c === 92 /*'\\'*/ ||
    c === 63 /*'?'*/ ||
    c === 35 /*'#'*/
  ) {
    state.pointer--;
    if (!state.initialMode && isWindowsDriveLetterString(state.buffer)) {
      return URLParseMode.Path;
    } else if (state.buffer === '') {
      state.url.host = '';
      return state.initialMode ? URLParseMode.Success : URLParseMode.PathStart;
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
      return state.initialMode ? URLParseMode.Success : URLParseMode.PathStart;
    }
  } else {
    state.buffer += cStr;
    return URLParseMode.FileHost;
  }
};

const parsePathStart: Parser = (state, c, _cStr) => {
  if (isSpecial(state.url.scheme)) {
    if (c !== 92 /*'\\'*/ && c !== 47 /*'/'*/) {
      state.pointer--;
    }
    return URLParseMode.Path;
  } else if (!state.initialMode && c === 63 /*'?'*/) {
    state.url.query = '';
    return URLParseMode.Query;
  } else if (!state.initialMode && c === 35 /*'#'*/) {
    state.url.fragment = '';
    return URLParseMode.Fragment;
  } else if (c != null) {
    if (c !== 47 /*'/'*/) state.pointer--;
    return URLParseMode.Path;
  } else if (state.initialMode && state.url.host === null) {
    state.url.path.push('');
    return URLParseMode.PathStart;
  } else {
    return URLParseMode.PathStart;
  }
};

const parsePath: Parser = (state, c, _cStr) => {
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
      return URLParseMode.Query;
    } else if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return URLParseMode.Fragment;
    } else {
      return URLParseMode.Path;
    }
  } else {
    state.buffer += utf8PercentEncodeCodePoint(c, isPathPercentEncode);
    return URLParseMode.Path;
  }
};

const parseOpaquePath: Parser = (state, c, _cStr) => {
  if (c === 63 /*'?'*/) {
    state.url.query = '';
    return URLParseMode.Query;
  } else if (c === 35 /*'#'*/) {
    state.url.fragment = '';
    return URLParseMode.Fragment;
  } else if (c === 32 /*' '*/) {
    const remaining = state.input[state.pointer + 1];
    if (remaining === 63 /*'?'*/ || remaining === 35 /*'#'*/) {
      state.url.path[0] += '%20';
    } else {
      state.url.path[0] += ' ';
    }
    return URLParseMode.OpaquePath;
  } else {
    if (c != null) {
      state.url.path[0] += utf8PercentEncodeCodePoint(
        c,
        isC0ControlPercentEncode
      );
    }
    return URLParseMode.OpaquePath;
  }
};

const parseQuery: Parser = (state, c, cStr) => {
  if (c == null || (!state.initialMode && c === 35) /*'#'*/) {
    const queryPercentEncodePredicate = isSpecial(state.url.scheme)
      ? isSpecialQueryPercentEncode
      : isQueryPercentEncode;
    state.url.query += utf8PercentEncodeString(
      state.buffer,
      queryPercentEncodePredicate
    );
    state.buffer = '';
    if (c === 35 /*'#'*/) {
      state.url.fragment = '';
      return URLParseMode.Fragment;
    } else {
      return URLParseMode.Query;
    }
  } else {
    state.buffer += cStr;
    return URLParseMode.Query;
  }
};

const parseFragment: Parser = (state, c, _cStr) => {
  if (c != null) {
    state.url.fragment += utf8PercentEncodeCodePoint(
      c,
      isFragmentPercentEncode
    );
  }
  return URLParseMode.Fragment;
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
