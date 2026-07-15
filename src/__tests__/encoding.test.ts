import { describe, expect, it } from 'vitest';
import { percentDecodeString } from '../encoding';

describe('percentDecodeString', () => {
  it('decodes valid percent-encoded UTF-8 without a platform decoder', () => {
    expect(percentDecodeString('a%C3%A9')).toBe('aé');
    expect(percentDecodeString('%F0%9F%92%A9')).toBe('💩');
  });

  it('preserves a leading UTF-8 BOM', () => {
    expect(percentDecodeString('%EF%BB%BFA')).toBe('\ufeffA');
  });

  it('uses replacement characters for malformed UTF-8', () => {
    expect(percentDecodeString('%C3(')).toBe('\ufffd(');
    expect(percentDecodeString('%E2(%A1')).toBe('\ufffd(\ufffd');
    expect(percentDecodeString('%E2%82(')).toBe('\ufffd\ufffd(');
    expect(percentDecodeString('%ED%A0%80')).toBe('\ufffd\ufffd\ufffd');
  });

  it('keeps invalid percent sequences literal', () => {
    expect(percentDecodeString('%')).toBe('%');
    expect(percentDecodeString('%x')).toBe('%x');
    expect(percentDecodeString('%zz%20x')).toBe('%zz x');
  });

  it('keeps non-percent-encoded code points on the scalar path', () => {
    expect(percentDecodeString('aé%20💩')).toBe('aé 💩');
  });

  it('optionally decodes plus signs as spaces', () => {
    expect(percentDecodeString('a+b%2Bc', true)).toBe('a b+c');
  });
});
