// See: https://github.com/jsdom/whatwg-url/blob/v15.1.0/lib/encoding.js

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export function utf8Encode(string: string): Uint8Array {
  return utf8Encoder.encode(string);
}

export function utf8Decode(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

// See: https://github.com/jsdom/whatwg-url/blob/v15.1.0/lib/percent-encoding.js

const HEX = '0123456789ABCDEF';

// https://url.spec.whatwg.org/#percent-encode
function percentEncode(c: number): string {
  return `%${HEX[(c >> 4) & 0xf]}${HEX[c & 0xf]}`;
}

function utf8PercentEncodeScalar(
  codePoint: number,
  percentEncodePredicate: (c: number) => boolean,
  spaceAsPlus = false
): string {
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    codePoint = 0xfffd;
  }
  if (codePoint <= 0x7f) {
    if (spaceAsPlus && codePoint === 32 /*' '*/) return '+';
    return percentEncodePredicate(codePoint)
      ? percentEncode(codePoint)
      : String.fromCharCode(codePoint);
  } else if (codePoint <= 0x7ff) {
    return (
      percentEncode(0xc0 | (codePoint >> 6)) +
      percentEncode(0x80 | (codePoint & 0x3f))
    );
  } else if (codePoint <= 0xffff) {
    return (
      percentEncode(0xe0 | (codePoint >> 12)) +
      percentEncode(0x80 | ((codePoint >> 6) & 0x3f)) +
      percentEncode(0x80 | (codePoint & 0x3f))
    );
  } else {
    return (
      percentEncode(0xf0 | (codePoint >> 18)) +
      percentEncode(0x80 | ((codePoint >> 12) & 0x3f)) +
      percentEncode(0x80 | ((codePoint >> 6) & 0x3f)) +
      percentEncode(0x80 | (codePoint & 0x3f))
    );
  }
}

export function decodeHexDigit(c: number): number {
  if (c >= 0x30 && c <= 0x39 /*0-9*/) {
    return c - 0x30;
  } else if (c >= 0x41 && c <= 0x46 /*A-F*/) {
    return c - 0x41 + 10;
  } else if (c >= 0x61 && c <= 0x66 /*a-f*/) {
    return c - 0x61 + 10;
  } else {
    return -1;
  }
}

// https://url.spec.whatwg.org/#percent-decode
export function percentDecodeBytes(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.byteLength);
  let outputIndex = 0;
  for (let i = 0; i < input.byteLength; ++i) {
    const byte = input[i];
    if (byte !== 0x25 /*'%'*/) {
      output[outputIndex++] = byte;
    } else {
      const hi = decodeHexDigit(input[i + 1]);
      const lo = decodeHexDigit(input[i + 2]);
      if (hi >= 0 && lo >= 0) {
        output[outputIndex++] = (hi << 4) | lo;
        i += 2;
      } else {
        output[outputIndex++] = byte;
      }
    }
  }
  return output.slice(0, outputIndex);
}

// https://url.spec.whatwg.org/#string-percent-decode
export function percentDecodeString(input: string): Uint8Array {
  const bytes = utf8Encode(input);
  return percentDecodeBytes(bytes);
}

// https://url.spec.whatwg.org/#c0-control-percent-encode-set
export function isC0ControlPercentEncode(c: number): boolean {
  return c <= 0x1f || c > 0x7e;
}

// https://url.spec.whatwg.org/#fragment-percent-encode-set
export function isFragmentPercentEncode(c: number): boolean {
  switch (c) {
    case 32 /*' '*/:
    case 34 /*'"'*/:
    case 60 /*'<'*/:
    case 62 /*'>'*/:
    case 96 /*'`'*/:
      return true;
    default:
      return isC0ControlPercentEncode(c);
  }
}

// https://url.spec.whatwg.org/#query-percent-encode-set
export function isQueryPercentEncode(c: number): boolean {
  switch (c) {
    case 32 /*' '*/:
    case 34 /*'"'*/:
    case 35 /*'#'*/:
    case 60 /*'<'*/:
    case 62 /*'>'*/:
      return true;
    default:
      return isC0ControlPercentEncode(c);
  }
}

// https://url.spec.whatwg.org/#special-query-percent-encode-set
export function isSpecialQueryPercentEncode(c: number): boolean {
  return isQueryPercentEncode(c) || c === 39 /*"'"*/;
}

// https://url.spec.whatwg.org/#path-percent-encode-set
export function isPathPercentEncode(c: number): boolean {
  switch (c) {
    case 63 /*'?'*/:
    case 94 /*'^'*/:
    case 96 /*'`'*/:
    case 123 /*'{'*/:
    case 125 /*'}'*/:
      return true;
    default:
      return isQueryPercentEncode(c);
  }
}

// https://url.spec.whatwg.org/#userinfo-percent-encode-set
export function isUserinfoPercentEncode(c: number): boolean {
  switch (c) {
    case 47 /*'/'*/:
    case 58 /*':'*/:
    case 59 /*';'*/:
    case 61 /*'='*/:
    case 64 /*'@'*/:
    case 91 /*'['*/:
    case 92 /*'\\'*/:
    case 93 /*']'*/:
    case 124 /*'|'*/:
      return true;
    default:
      return isPathPercentEncode(c);
  }
}

// https://url.spec.whatwg.org/#component-percent-encode-set
export function isComponentPercentEncode(c: number): boolean {
  switch (c) {
    case 36 /*'$'*/:
    case 37 /*'%'*/:
    case 38 /*'&'*/:
    case 43 /*'+'*/:
    case 44 /*','*/:
      return true;
    default:
      return isUserinfoPercentEncode(c);
  }
}

// https://url.spec.whatwg.org/#application-x-www-form-urlencoded-percent-encode-set
export function isURLEncodedPercentEncode(c: number): boolean {
  switch (c) {
    case 33 /*'!'*/:
    case 39 /*"'"*/:
    case 40 /*'('*/:
    case 41 /*')'*/:
    case 126 /*'~'*/:
      return true;
    default:
      return isComponentPercentEncode(c);
  }
}

// https://url.spec.whatwg.org/#code-point-percent-encode-after-encoding
// https://url.spec.whatwg.org/#utf-8-percent-encode
// Assuming encoding is always utf-8 allows us to trim one of the logic branches. TODO: support encoding.
// The "-Internal" variant here has code points as JS strings. The external version used by other files has code points
// as JS numbers, like the rest of the codebase.
export function utf8PercentEncodeCodePoint(
  codePoint: number | undefined,
  percentEncodePredicate: (c: number) => boolean
): string {
  codePoint = codePoint || 0;
  return utf8PercentEncodeScalar(codePoint, percentEncodePredicate);
}

// https://url.spec.whatwg.org/#string-percent-encode-after-encoding
// https://url.spec.whatwg.org/#string-utf-8-percent-encode
export function utf8PercentEncodeString(
  input: string,
  percentEncodePredicate: (c: number) => boolean,
  spaceAsPlus = false
) {
  let idx = 0;
  for (; idx < input.length; idx++) {
    const c = input.charCodeAt(idx);
    if (c >= 0x80) break;
    if ((spaceAsPlus && c === 32) /*' '*/ || percentEncodePredicate(c)) break;
  }
  if (idx === input.length) return input;

  let output = input.slice(0, idx);
  for (; idx < input.length; idx++) {
    const c = input.charCodeAt(idx);
    let codePoint = c;
    if (c >= 0xd800 && c <= 0xdbff && idx + 1 < input.length) {
      const next = input.charCodeAt(idx + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = ((c - 0xd800) << 10) + next - 0xdc00 + 0x10000;
        idx++;
      }
    }
    output += utf8PercentEncodeScalar(
      codePoint,
      percentEncodePredicate,
      spaceAsPlus
    );
  }
  return output;
}

// https://url.spec.whatwg.org/#concept-urlencoded-parser
function parseUrlencodedComponent(input: string): string {
  let hasPercent = false;
  let output = '';
  for (let idx = 0; idx < input.length; idx++) {
    const c = input.charCodeAt(idx);
    if (c === 43 /*'+'*/) {
      output += ' ';
    } else {
      if (c === 37 /*'%'*/) hasPercent = true;
      output += input[idx];
    }
  }
  if (!hasPercent) return output;

  let byteIdx = 0;
  let hasNonASCIIByte = false;
  const bytes = new Uint8Array(output.length);
  for (let idx = 0; idx < output.length; idx++) {
    const c = output.charCodeAt(idx);
    if (c === 37 /*'%'*/) {
      const hi = decodeHexDigit(output.charCodeAt(idx + 1));
      const lo = decodeHexDigit(output.charCodeAt(idx + 2));
      if (hi >= 0 && lo >= 0) {
        const byte = (hi << 4) | lo;
        bytes[byteIdx++] = byte;
        if (byte >= 0x80) hasNonASCIIByte = true;
        idx += 2;
        continue;
      }
    }
    bytes[byteIdx++] = c;
  }

  if (hasNonASCIIByte) return utf8Decode(bytes.subarray(0, byteIdx));

  let decoded = '';
  for (let idx = 0; idx < byteIdx; idx++) {
    decoded += String.fromCharCode(bytes[idx]);
  }
  return decoded;
}

export function parseUrlencoded(input: string): [string, string][] {
  const entries: [string, string][] = [];
  let lastIdx = 0;
  let idx = 0;
  while (idx <= input.length) {
    idx = input.indexOf('&', lastIdx);
    if (idx < 0) idx = input.length;
    if (idx !== lastIdx) {
      const part = input.slice(lastIdx, idx);
      let equalIdx = part.indexOf('=');
      if (equalIdx < 0) equalIdx = part.length;
      entries.push([
        parseUrlencodedComponent(part.slice(0, equalIdx)),
        parseUrlencodedComponent(part.slice(equalIdx + 1)),
      ]);
    }
    lastIdx = idx + 1;
    if (idx === input.length) break;
  }
  return entries;
}

// https://url.spec.whatwg.org/#concept-urlencoded-serializer
export function serializeUrlencoded(entries: [string, string][]): string {
  let output = '';
  for (let idx = 0; idx < entries.length; idx++) {
    const name = utf8PercentEncodeString(
      entries[idx][0],
      isURLEncodedPercentEncode,
      true
    );
    const value = utf8PercentEncodeString(
      entries[idx][1],
      isURLEncodedPercentEncode,
      true
    );
    output += idx !== 0 ? `&${name}=${value}` : `${name}=${value}`;
  }
  return output;
}

export function normalizeDomain(domain: string): string | null {
  let isASCII = true;
  for (let idx = 0; idx < domain.length; idx++) {
    const c = domain.charCodeAt(idx);
    if (c > 0x7f) {
      isASCII = false;
      break;
    }
    if (c <= 0x20 || c === 0x25 /*'%'*/) {
      return null;
    }
  }
  if (isASCII) return domain.toLowerCase();

  const labels = domain
    .normalize('NFC')
    .replace(/[\u3002\uFF0E\uFF61.]/g, '.')
    .toLowerCase();
  return !/[\x00-\x20%]/g.test(labels) ? labels : null;
}
