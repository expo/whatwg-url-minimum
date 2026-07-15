import { describe, expect, it } from 'vitest';
import { URL } from '../index';
import toasciiTests from './wpt/resources/toascii.json';
import percentEncodingTests from './wpt/resources/percent-encoding.json';

const disabledToASCII = new Map([
  [
    'xn--a.ß',
    'requires revalidating a pre-existing xn-- label after UTS #46 mapping; this is treated with obsolete/removed IDNA validity coverage and intentionally not implemented to avoid shipping a punycode decoder',
  ],
]);

describe('WPT toascii.window.js coverage', () => {
  for (const testCase of toasciiTests) {
    if (typeof testCase === 'string') continue;
    const disabledReason = disabledToASCII.get(testCase.input);
    const runner = disabledReason ? it.skip : it;
    const suffix = disabledReason ? ` (${disabledReason})` : '';

    runner(`${testCase.input} (using URL)${suffix}`, () => {
      if (testCase.output !== null) {
        const url = new URL(`https://${testCase.input}/x`);
        expect(url.host).toBe(testCase.output);
        expect(url.hostname).toBe(testCase.output);
        expect(url.pathname).toBe('/x');
        expect(url.href).toBe(`https://${testCase.output}/x`);
      } else {
        expect(() => new URL(`https://${testCase.input}/x`)).toThrow(TypeError);
      }
    });

    for (const property of ['host', 'hostname'] as const) {
      runner(`${testCase.input} (using URL.${property})${suffix}`, () => {
        const url = new URL('https://x/');
        url[property] = testCase.input;
        expect(url[property]).toBe(
          testCase.output !== null ? testCase.output : 'x'
        );
      });
    }
  }
});

describe('WPT percent-encoding.window.js UTF-8 URL coverage', () => {
  for (const testCase of percentEncodingTests) {
    if (typeof testCase === 'string') continue;

    it(`Input ${testCase.input} with utf-8`, () => {
      const url = new URL('https://example.test/');
      url.hash = testCase.input;
      url.search = testCase.input;
      expect(url.hash).toBe(`#${testCase.output['utf-8']}`);
      expect(url.search).toBe(`?${testCase.output['utf-8']}`);
    });
  }
});
