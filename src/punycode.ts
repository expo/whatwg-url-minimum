// Adapted from @stacksjs/ts-punycode, MIT License.
// Copyright (c) 2024 Open Web Foundation

export function normalizeDomain(domain: string): string | null {
  domain = domain
    .normalize('NFKC')
    .replace(/[\u00ad\u034f\u061c\u1806\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\u3002\uff0e\uff61]/g, '.')
    .toLowerCase();
  const labels = domain.split('.');
  for (let idx = 0; idx < labels.length; idx++) {
    const label = labels[idx];
    if (label === '') continue;
    if (containsInvalidDomainCodePoint(label)) return null;
    if (label.startsWith('xn--')) {
      if (!label.slice(4) || decodePunycode(label.slice(4)) == null) {
        return null;
      }
    } else if (/[^\0-\x7f]/.test(label)) {
      labels[idx] = `xn--${encodePunycode(label)}`;
    }
  }
  domain = labels.join('.');
  return domain !== '' && !containsInvalidDomainCodePoint(domain)
    ? domain
    : null;
}

function containsInvalidDomainCodePoint(domain: string): boolean {
  for (let idx = 0; idx < domain.length; idx++) {
    const c = domain.codePointAt(idx)!;
    if (c > 0xffff) idx++;
    if (
      c <= 0x20 ||
      c === 0x25 /*'%'*/ ||
      c === 0x7f ||
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

function basicToDigit(c: number): number {
  return c < 58 ? c - 22 : c < 91 ? c - 65 : c < 123 ? c - 97 : base;
}

function adapt(delta: number, points: number, first: boolean): number {
  let k = 0;
  delta = Math.floor((first ? delta / damp : delta >> 1) + delta / points);
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
  if (handled) output += '-';
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
        bias = adapt(delta, handled + 1, handled === output.length - 1);
        delta = 0;
        handled++;
      }
    }
    delta++;
    n++;
  }
  return output;
}

function decodePunycode(input: string): string | null {
  const output: number[] = [];
  let i = 0;
  let n = initialN;
  let bias = initialBias;
  let basic = input.lastIndexOf('-');
  if (basic < 0) basic = 0;
  for (let idx = 0; idx < basic; idx++) {
    const c = input.charCodeAt(idx);
    if (c >= 0x80) return null;
    output.push(c);
  }
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const old = i;
    let w = 1;
    for (let k = base; ; k += base) {
      if (idx >= input.length) return null;
      const digit = basicToDigit(input.charCodeAt(idx++));
      if (digit >= base || digit > Math.floor((maxInt - i) / w)) return null;
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      if (w > Math.floor(maxInt / (base - t))) return null;
      w *= base - t;
    }
    const length = output.length + 1;
    bias = adapt(i - old, length, old === 0);
    if (Math.floor(i / length) > maxInt - n) return null;
    n += Math.floor(i / length);
    i %= length;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}
