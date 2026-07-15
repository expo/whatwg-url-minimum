import { decodeHexDigit } from './encoding';

function parseIPv4Number(input: string): number {
  let radix = 10;
  if (
    input.length >= 2 &&
    input[0] === '0' &&
    (input[1] === 'x' || input[1] === 'X')
  ) {
    input = input.slice(2);
    radix = 16;
  } else if (input.length >= 2 && input[0] === '0') {
    input = input.slice(1);
    radix = 8;
  } else if (input === '') {
    return -1;
  }
  let value = 0;
  for (let idx = 0; idx < input.length; idx++) {
    const digit = decodeHexDigit(input.charCodeAt(idx));
    if (digit >= radix || digit < 0) return -1;
    value = value * radix + digit;
  }
  return value;
}

export function parseIPv4(input: string): number | null {
  const parts = input.split('.');
  let len = parts.length;
  if (!parts[len - 1]) len--;
  if (len > 4) return null;
  let ipv4 = 0;
  for (let i = 0; i < len - 1; i++) {
    const n = parseIPv4Number(parts[i]);
    if (n < 0 || n > 255) return null;
    ipv4 += n * (1 << (8 * (3 - i)));
  }
  const tail = parseIPv4Number(parts[len - 1]);
  if (tail < 0 || tail >= 256 ** (5 - len)) return null;
  ipv4 += tail;
  return ipv4;
}

export function serializeIPv4(addr: number): string {
  const MASK = (1 << 8) - 1;
  let ipStr = '';
  ipStr += `${((addr >>> 24) & MASK).toString(10)}.`;
  ipStr += `${((addr >>> 16) & MASK).toString(10)}.`;
  ipStr += `${((addr >>> 8) & MASK).toString(10)}.`;
  ipStr += (addr & MASK).toString(10);
  return ipStr;
}

export function parseIPv6(string: string): number[] | null {
  const address = [0, 0, 0, 0, 0, 0, 0, 0];
  let compress: number | null = null;
  let pieceIndex = 0;
  let pointer = 0;

  const input = Array.from(string, c => c.codePointAt(0));
  if (input[pointer] === 58 /*':'*/) {
    if (input[pointer + 1] !== 58 /*':'*/) {
      return null;
    }
    pointer += 2;
    pieceIndex++;
    compress = pieceIndex;
  }

  while (pointer < input.length) {
    if (pieceIndex === 8) {
      return null;
    } else if (input[pointer] === 58 /*':'*/) {
      if (compress !== null) {
        return null;
      }
      pointer++;
      pieceIndex++;
      compress = pieceIndex;
      continue;
    }

    let digit = 0;
    let value = 0;
    let length = 0;

    while (length < 4 && (digit = decodeHexDigit(input[pointer]!)) >= 0) {
      value = (value << 4) + digit;
      pointer++;
      length++;
    }

    if (input[pointer] === 46 /*'.'*/) {
      if (length === 0) return null;
      if (pieceIndex > 6) return null;
      pointer -= length;
      let numbersSeen = 0;
      while (input[pointer] !== undefined) {
        let ipv4Piece = 0;
        if (numbersSeen > 0) {
          if (input[pointer] === 46 /*'.'*/ && numbersSeen < 4) {
            pointer++;
          } else {
            return null;
          }
        }

        if (
          input[pointer] == null ||
          input[pointer]! < 0x30 ||
          input[pointer]! > 0x39 /*0-9*/
        ) {
          return null;
        }

        while (input[pointer]! >= 0x30 && input[pointer]! <= 0x39 /*0-9*/) {
          const number = decodeHexDigit(input[pointer]!);
          ipv4Piece = ipv4Piece * 10 + number;
          if (ipv4Piece > 255) {
            return null;
          }
          pointer++;
        }

        address[pieceIndex] = address[pieceIndex] * 0x100 + ipv4Piece;
        numbersSeen++;
        if (numbersSeen % 2 === 0) pieceIndex++;
      }

      if (numbersSeen !== 4) {
        return null;
      }
      break;
    } else if (input[pointer] === 58 /*':'*/) {
      if (input[++pointer] === undefined) {
        return null;
      }
    } else if (input[pointer] !== undefined) {
      return null;
    }
    address[pieceIndex] = value;
    pieceIndex++;
  }

  if (compress !== null) {
    let swaps = pieceIndex - compress;
    pieceIndex = 7;
    while (pieceIndex !== 0 && swaps > 0) {
      const temp = address[compress + swaps - 1];
      address[compress + swaps - 1] = address[pieceIndex];
      address[pieceIndex] = temp;
      pieceIndex--;
      swaps--;
    }
  } else if (compress === null && pieceIndex !== 8) {
    return null;
  }

  return address;
}

function findTheIPv6AddressCompressedPieceIndex(address: number[]): number {
  let longestIndex = -1;
  let foundIndex = -1;
  let longestSize = 1; // only find elements > 1
  let foundSize = 0;
  for (let pieceIndex = 0; pieceIndex < address.length; ++pieceIndex) {
    if (address[pieceIndex] !== 0) {
      if (foundSize > longestSize) {
        longestIndex = foundIndex;
        longestSize = foundSize;
      }
      foundIndex = -1;
      foundSize = 0;
    } else {
      if (foundIndex === -1) {
        foundIndex = pieceIndex;
      }
      ++foundSize;
    }
  }
  return foundSize > longestSize ? foundIndex : longestIndex;
}

export function serializeIPv6(address: number[]): string {
  const compress = findTheIPv6AddressCompressedPieceIndex(address);
  let output = '';
  let ignore0 = false;
  for (let pieceIndex = 0; pieceIndex <= 7; ++pieceIndex) {
    if (ignore0 && address[pieceIndex] === 0) {
      continue;
    } else if (ignore0) {
      ignore0 = false;
    }
    if (compress === pieceIndex) {
      const separator = pieceIndex === 0 ? '::' : ':';
      output += separator;
      ignore0 = true;
      continue;
    }
    output += address[pieceIndex].toString(16);
    if (pieceIndex !== 7) output += ':';
  }
  return output;
}

export function isIPv4(input: string): boolean {
  let endIdx = input.length;
  let startIdx = input.lastIndexOf('.', endIdx - 2) + 1;
  if (input.charCodeAt(endIdx - 1) === 46 /*'.'*/) endIdx--;
  if (endIdx <= startIdx) return false;
  if (parseIPv4Number(input.slice(startIdx, endIdx)) >= 0) return true;
  for (; startIdx < endIdx; startIdx++) {
    const c = input.charCodeAt(startIdx);
    if (c < 0x30 || c > 0x39 /*0-9*/) return false;
  }
  return true;
}
