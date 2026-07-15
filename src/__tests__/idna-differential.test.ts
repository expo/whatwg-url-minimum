import { describe, expect, it } from 'vitest';
import { URL } from '../index';
import { URL as WhatwgURL } from 'whatwg-url';
import toasciiTests from './wpt/resources/toascii.json';

const unsupportedInputs = new Set([
  // Requires decoding and revalidating a pre-existing xn-- label.
  'xn--a.ß',
]);

function parseHost(URLImpl: typeof URL, input: string): string | null {
  try {
    return new URLImpl(`https://${input}/x`).host;
  } catch {
    return null;
  }
}

describe('IDNA/TR46 differential coverage against whatwg-url', () => {
  for (const testCase of toasciiTests) {
    if (typeof testCase === 'string' || unsupportedInputs.has(testCase.input)) {
      continue;
    }

    it(`matches whatwg-url for ${testCase.input}`, () => {
      expect(parseHost(URL, testCase.input)).toBe(
        parseHost(WhatwgURL, testCase.input)
      );
    });
  }
});

describe('seeded IDNA/TR46 differential fuzz cases', () => {
  const latin = ['a', 'ss', 'Test'];
  const rtl = ['ي', 'א', '־'];
  const rtlMarksAndDigits = ['۫', '۰', '݅'];
  const valid = ['faß', 'βόλος', 'نامه‌ای', 'Bücher', 'www．lookout'];

  for (const left of latin) {
    for (const right of rtl) {
      for (const input of [`${left}${right}`, `${right}${left}`]) {
        it(`matches whatwg-url for mixed Latin/RTL label ${input}`, () => {
          expect(parseHost(URL, input)).toBe(parseHost(WhatwgURL, input));
        });
      }
    }
  }

  for (const left of latin) {
    for (const right of rtlMarksAndDigits) {
      for (const input of [`${left}${right}`, `${right}${left}`]) {
        it(`matches whatwg-url for Latin with RTL mark/digit ${input}`, () => {
          expect(parseHost(URL, input)).toBe(parseHost(WhatwgURL, input));
        });
      }
    }
  }

  for (const left of valid) {
    for (const right of valid) {
      const input = `${left}.${right}`;
      it(`matches whatwg-url for valid IDNA label pair ${input}`, () => {
        expect(parseHost(URL, input)).toBe(parseHost(WhatwgURL, input));
      });
    }
  }
});
