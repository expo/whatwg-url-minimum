import {
  allowedIDNAPropertyRanges,
  idnaBitmaps,
  mappedIDNACodePoints,
  mappedIDNAValues,
  viramaRanges,
} from './generated/uts46';

export function normalizeDomain(domain: string): string | null {
  const domainHasNonASCII = /[^\0-\x7f]/.test(domain);
  if (domainHasNonASCII) {
    if (hasDisallowedIDNACodePoint(domain)) return null;
    domain = mapIDNADomain(domain)
      .normalize('NFKC')
      .replace(/[\u3002\uff0e\uff61]/g, '.')
      .toLowerCase();
  } else {
    domain = domain.toLowerCase();
  }
  const labels = domain.split('.');
  for (let idx = 0; idx < labels.length; idx++) {
    const label = labels[idx];
    if (label === '') continue;
    const hasNonASCII = domainHasNonASCII && /[^\0-\x7f]/.test(label);
    if (
      containsInvalidDomainCodePoint(label) ||
      (hasNonASCII &&
        (/^\p{Mark}/u.test(label) ||
          !hasValidJoiners(label) ||
          label.startsWith('xn--')))
    ) {
      return null;
    }
    if (hasNonASCII) {
      labels[idx] = `xn--${encodePunycode(label)}`;
    }
  }
  domain = labels.join('.');
  return domain !== '' ? domain : null;
}

function containsInvalidDomainCodePoint(domain: string): boolean {
  for (let idx = 0; idx < domain.length; idx++) {
    const c = domain.codePointAt(idx)!;
    if (c > 0xffff) idx++;
    if (
      c <= 0x20 ||
      c === 0x25 /*'%'*/ ||
      c === 0x7f ||
      (c >= 0xd800 && c <= 0xdfff) ||
      (c >= 0x80 && c <= 0x9f) ||
      (c >= 0xfdd0 && c <= 0xfdef) ||
      (c & 0xfffe) === 0xfffe ||
      c === 0xfffd
    ) {
      return true;
    }
  }
  return false;
}

type BitmapData = readonly [readonly number[], string, string];
type BitmapLookup = [number[], number[], Uint8Array];

const [
  disallowedIDNALookup,
  joiningBeforeLookup,
  joiningAfterLookup,
  joiningTLookup,
] = idnaBitmaps.map(prepareBitmap);

function prepareBitmap([full, pages, bitmap]: BitmapData): BitmapLookup {
  return [
    full as number[],
    pages.split(',').map(page => parseInt(page, 36)),
    Uint8Array.from(atob(bitmap), c => c.charCodeAt(0)),
  ];
}

function mapIDNADomain(input: string): string {
  let output = '';
  for (const char of input) {
    const codePoint = char.codePointAt(0)!;
    if (
      codePoint !== 0x200c &&
      codePoint !== 0x200d &&
      /\p{Default_Ignorable_Code_Point}/u.test(char)
    ) {
      continue;
    }
    const mapped = mapIDNACodePoint(char, codePoint);
    if (mapped) {
      output += mapped;
      continue;
    }
    const mappedIndex = mappedIDNACodePoints.indexOf(codePoint);
    output += mappedIndex < 0 ? char : mappedIDNAValues[mappedIndex];
  }
  return output;
}

function mapIDNACodePoint(char: string, codePoint: number): string {
  if (
    codePoint === 0x03a3 ||
    codePoint === 0x03f2 ||
    codePoint === 0x1d6d3 ||
    codePoint === 0x1d70d ||
    codePoint === 0x1d747 ||
    codePoint === 0x1d781 ||
    codePoint === 0x1d7bb
  ) {
    return 'σ';
  } else if (codePoint >= 0x13f8 && codePoint <= 0x13fd) {
    return String.fromCodePoint(codePoint - 8);
  } else if (codePoint >= 0xab70 && codePoint <= 0xabbf) {
    return String.fromCodePoint(codePoint - 0x97d0);
  } else if (codePoint >= 0x16ea0 && codePoint <= 0x16eb8) {
    return String.fromCodePoint(codePoint + 0x1b);
  } else if (
    codePoint === 0x0345 ||
    codePoint === 0x037a ||
    (codePoint >= 0x1f80 && codePoint <= 0x1faf) ||
    (codePoint >= 0x1fb2 && codePoint <= 0x1ffc)
  ) {
    return char
      .normalize('NFD')
      .replace(/\u0345/g, 'ι')
      .normalize('NFC')
      .toLowerCase();
  } else {
    return '';
  }
}

function hasCodePointInRanges(ranges: number[], codePoint: number): boolean {
  for (let idx = 0; idx < ranges.length; idx += 2) {
    if (codePoint >= ranges[idx] && codePoint <= ranges[idx + 1]) {
      return true;
    }
  }
  return false;
}

function hasCodePointInBitmap(data: BitmapLookup, codePoint: number): boolean {
  const [fullPageRanges, partialPageList, partialBytes] = data;
  const page = codePoint >> 8;
  for (let idx = 0; idx < fullPageRanges.length; idx += 2) {
    if (page >= fullPageRanges[idx] && page <= fullPageRanges[idx + 1]) {
      return true;
    }
  }
  const pageIndex = partialPageList.indexOf(page);
  if (pageIndex < 0) return false;
  const offset = codePoint & 0xff;
  return !!(partialBytes[pageIndex * 32 + (offset >> 3)] & (1 << (offset & 7)));
}

function hasDisallowedIDNACodePoint(input: string): boolean {
  for (const char of input) {
    const codePoint = char.codePointAt(0)!;
    if (
      (/[\p{Cn}\p{Co}\p{Cs}\p{Noncharacter_Code_Point}]/u.test(char) &&
        !hasCodePointInRanges(allowedIDNAPropertyRanges, codePoint)) ||
      hasCodePointInBitmap(disallowedIDNALookup, codePoint)
    ) {
      return true;
    }
  }
  return false;
}

function hasValidJoiners(label: string): boolean {
  const codePoints = Array.from(label, char => char.codePointAt(0)!);
  for (let idx = 0; idx < codePoints.length; idx++) {
    const c = codePoints[idx];
    if (c !== 0x200c && c !== 0x200d) continue;
    if (idx > 0 && hasCodePointInRanges(viramaRanges, codePoints[idx - 1])) {
      continue;
    }
    if (c === 0x200d) return false;

    let before = idx - 1;
    while (
      before >= 0 &&
      hasCodePointInBitmap(joiningTLookup, codePoints[before])
    ) {
      before--;
    }
    let after = idx + 1;
    while (
      after < codePoints.length &&
      hasCodePointInBitmap(joiningTLookup, codePoints[after])
    ) {
      after++;
    }
    if (
      before >= 0 &&
      after < codePoints.length &&
      hasCodePointInBitmap(joiningBeforeLookup, codePoints[before]) &&
      hasCodePointInBitmap(joiningAfterLookup, codePoints[after])
    ) {
      continue;
    }
    return false;
  }
  return true;
}

// Adapted from @stacksjs/ts-punycode, MIT License.
// Copyright (c) 2024 Open Web Foundation

const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128;
const maxInt = 2147483647;

function digitToBasic(digit: number): string {
  return String.fromCharCode(digit + 22 + 75 * Number(digit < 26));
}

function adapt(delta: number, points: number, first: boolean): number {
  let k = 0;
  delta = first ? Math.floor(delta / damp) : delta >> 1;
  delta += Math.floor(delta / points);
  for (; delta > ((base - tMin) * tMax) >> 1; k += base) {
    delta = Math.floor(delta / (base - tMin));
  }
  return Math.floor(k + ((base - tMin + 1) * delta) / (delta + skew));
}

function encodePunycode(input: string): string {
  const codePoints = Array.from(input, c => c.codePointAt(0)!);
  let output = '';
  let handled = 0;
  for (let idx = 0; idx < codePoints.length; idx++) {
    const c = codePoints[idx];
    if (c < 0x80) {
      output += String.fromCharCode(c);
      handled++;
    }
  }
  const basic = handled;
  if (basic) output += '-';
  let n = initialN;
  let delta = 0;
  let bias = initialBias;
  while (handled < codePoints.length) {
    let m = maxInt;
    for (let idx = 0; idx < codePoints.length; idx++) {
      const c = codePoints[idx];
      if (c >= n && c < m) m = c;
    }
    delta += (m - n) * (handled + 1);
    n = m;
    for (let idx = 0; idx < codePoints.length; idx++) {
      const c = codePoints[idx];
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k = base; ; k += base) {
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (q < t) break;
          output += digitToBasic(t + ((q - t) % (base - t)));
          q = Math.floor((q - t) / (base - t));
        }
        output += digitToBasic(q);
        bias = adapt(delta, handled + 1, handled === basic);
        delta = 0;
        handled++;
      }
    }
    delta++;
    n++;
  }
  return output;
}
