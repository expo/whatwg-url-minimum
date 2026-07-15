const fs = require('fs/promises');
const path = require('path');

const SOURCE_URL =
  'https://www.unicode.org/Public/idna/latest/IdnaMappingTable.txt';
const JOINING_TYPE_URL =
  'https://www.unicode.org/Public/UCD/latest/ucd/extracted/DerivedJoiningType.txt';
const UNICODE_DATA_URL =
  'https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt';
const OUT_FILE = path.resolve(__dirname, '..', 'src', 'generated', 'uts46.ts');

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const [mappingTable, joiningTypes, unicodeData] = await Promise.all([
    fetchText(SOURCE_URL),
    fetchText(JOINING_TYPE_URL),
    fetchText(UNICODE_DATA_URL),
  ]);

  const entries = parseMappingTable(mappingTable);
  const disallowedRanges = mergeRanges(
    removePropertyRanges(
      entries.filter(({ status }) => rejectsStatus(status)).map(toRange)
    )
  );
  const allowedPropertyRanges = getAllowedPropertyRanges(entries);
  const mappedEntries = entries
    .flatMap(entry => toMappedEntries(entry))
    .filter(([codePoint, value]) => !isMappedSeparator(codePoint, value));
  const joiningTypeRanges = parseJoiningTypes(joiningTypes);
  const viramaRanges = parseViramas(unicodeData);
  const joiningBeforeRanges = mergeRanges([
    ...joiningTypeRanges.L,
    ...joiningTypeRanges.D,
  ]);
  const joiningAfterRanges = mergeRanges([
    ...joiningTypeRanges.R,
    ...joiningTypeRanges.D,
  ]);
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(
    OUT_FILE,
    [
      `// Generated from ${SOURCE_URL}`,
      `// Joining data from ${JOINING_TYPE_URL} and ${UNICODE_DATA_URL}`,
      '// UTS #46 nontransitional IDNA data.',
      '// Use before NFKC/mapping; some disallowed code points normalize away.',
      toRangeDataSource('allowedIDNAPropertyRanges', allowedPropertyRanges),
      toMappedDataSource(mappedEntries),
      toBitmapDataSource('idnaBitmaps', [
        disallowedRanges,
        joiningBeforeRanges,
        joiningAfterRanges,
        joiningTypeRanges.T,
      ]),
      toRangeDataSource('viramaRanges', viramaRanges),
      '',
    ].join('\n')
  );
}

function removePropertyRanges(ranges) {
  const filtered = [];
  for (const [from, to] of ranges) {
    let start = -1;
    for (let codePoint = from; codePoint <= to; codePoint++) {
      if (!hasDisallowedProperty(codePoint)) {
        if (start < 0) start = codePoint;
      } else if (start >= 0) {
        filtered.push([start, codePoint - 1]);
        start = -1;
      }
    }
    if (start >= 0) filtered.push([start, to]);
  }
  return mergeRanges(filtered);
}

function getAllowedPropertyRanges(entries) {
  const allowedRanges = entries
    .filter(({ status }) => !rejectsStatus(status))
    .map(toRange);
  const allowed = [];
  for (const [from, to] of allowedRanges) {
    let start = -1;
    for (let codePoint = from; codePoint <= to; codePoint++) {
      if (hasDisallowedProperty(codePoint)) {
        if (start < 0) start = codePoint;
      } else if (start >= 0) {
        allowed.push([start, codePoint - 1]);
        start = -1;
      }
    }
    if (start >= 0) allowed.push([start, to]);
  }
  return mergeRanges(allowed);
}

function hasDisallowedProperty(codePoint) {
  return /[\p{Cn}\p{Co}\p{Cs}\p{Noncharacter_Code_Point}]/u.test(
    String.fromCodePoint(codePoint)
  );
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

function rejectsStatus(status) {
  switch (status) {
    case 'valid':
    case 'ignored':
    case 'mapped':
    case 'deviation':
    case 'disallowed_STD3_valid':
    case 'disallowed_STD3_mapped':
      return false;
    default:
      return true;
  }
}

function parseMappingTable(text) {
  const ranges = [];
  for (const line of text.split('\n')) {
    const row = line.split('#')[0].trim();
    if (!row) continue;

    const [range, status, mapping = ''] = row
      .split(';')
      .map(part => part.trim());
    const [from, to = from] = range.split('..');
    ranges.push({
      from: parseInt(from, 16),
      to: parseInt(to, 16),
      status,
      mapping,
    });
  }
  return ranges;
}

function parseJoiningTypes(text) {
  const ranges = { L: [], D: [], R: [], T: [] };
  for (const line of text.split('\n')) {
    const row = line.split('#')[0].trim();
    if (!row) continue;

    const [range, type] = row.split(';').map(part => part.trim());
    if (!ranges[type]) continue;
    const [from, to = from] = range.split('..');
    ranges[type].push([parseInt(from, 16), parseInt(to, 16)]);
  }
  for (const type of Object.keys(ranges)) {
    ranges[type] = mergeRanges(ranges[type]);
  }
  return ranges;
}

function parseViramas(text) {
  const ranges = [];
  for (const line of text.split('\n')) {
    const row = line.split('#')[0].trim();
    if (!row) continue;

    const [codePoint, , , combiningClass] = row.split(';');
    if (combiningClass === '9') {
      const value = parseInt(codePoint, 16);
      ranges.push([value, value]);
    }
  }
  return mergeRanges(ranges);
}

function toRange({ from, to }) {
  return [from, to];
}

function toMappedEntries({ from, to, status, mapping }) {
  if (status !== 'mapped') return [];

  const mapped = mapping
    .split(' ')
    .filter(Boolean)
    .map(value => String.fromCodePoint(parseInt(value, 16)))
    .join('');
  const entries = [];
  for (let codePoint = from; codePoint <= to; codePoint++) {
    if (hasAlgorithmicMapping(codePoint)) continue;
    if (
      codePoint === 0x03a3 ||
      mapped !== String.fromCodePoint(codePoint).normalize('NFKC').toLowerCase()
    ) {
      entries.push([codePoint, mapped]);
    }
  }
  return entries;
}

function hasAlgorithmicMapping(codePoint) {
  return (
    codePoint === 0x0345 ||
    codePoint === 0x037a ||
    codePoint === 0x03a3 ||
    codePoint === 0x03f2 ||
    codePoint === 0x1d6d3 ||
    codePoint === 0x1d70d ||
    codePoint === 0x1d747 ||
    codePoint === 0x1d781 ||
    codePoint === 0x1d7bb ||
    (codePoint >= 0x13f8 && codePoint <= 0x13fd) ||
    (codePoint >= 0xab70 && codePoint <= 0xabbf) ||
    (codePoint >= 0x16ea0 && codePoint <= 0x16eb8) ||
    (codePoint >= 0x1f80 && codePoint <= 0x1faf) ||
    (codePoint >= 0x1fb2 && codePoint <= 0x1ffc)
  );
}

function isMappedSeparator(codePoint, value) {
  return (
    value === '.' &&
    (codePoint === 0x3002 || codePoint === 0xff0e || codePoint === 0xff61)
  );
}

function mergeRanges(ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && range[0] <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function toBitmapDataSource(name, tables) {
  return `export const ${name} = [${tables.map(toBitmapTupleSource).join(',')}] as const;`;
}

function toBitmapTupleSource(ranges) {
  const pages = new Map();
  for (const [from, to] of ranges) {
    for (let codePoint = from; codePoint <= to; codePoint++) {
      const page = codePoint >> 8;
      const offset = codePoint & 0xff;
      let bytes = pages.get(page);
      if (!bytes) pages.set(page, (bytes = Buffer.alloc(32)));
      bytes[offset >> 3] |= 1 << (offset & 7);
    }
  }

  const fullPages = [];
  const partialPages = [];
  for (const [page, bytes] of pages) {
    if (bytes.every(byte => byte === 0xff)) {
      fullPages.push(page);
    } else {
      partialPages.push([page, bytes]);
    }
  }
  fullPages.sort((a, b) => a - b);
  partialPages.sort((a, b) => a[0] - b[0]);

  const fullPageRanges = mergeNumberRanges(fullPages).flat();
  const partialPageList = partialPages.map(([page]) => page.toString(36));
  const partialBitmaps = Buffer.concat(partialPages.map(([, bytes]) => bytes));

  return `[[${fullPageRanges.join(',')}],'${partialPageList.join(',')}','${chunk(partialBitmaps.toString('base64')).join(`' +\n  '`)}']`;
}

function toMappedDataSource(entries) {
  return [
    `export const mappedIDNACodePoints = [${entries.map(([codePoint]) => codePoint).join(',')}];`,
    `export const mappedIDNAValues = [${entries.map(([, value]) => JSON.stringify(value)).join(',')}];`,
  ].join('\n');
}

function toRangeDataSource(name, ranges) {
  return `export const ${name} = [${ranges.flat().join(',')}];`;
}

function mergeNumberRanges(numbers) {
  const ranges = [];
  for (const number of numbers) {
    const prev = ranges[ranges.length - 1];
    if (prev && number === prev[1] + 1) {
      prev[1] = number;
    } else {
      ranges.push([number, number]);
    }
  }
  return ranges;
}

function chunk(input) {
  return Array.from(input.match(/.{1,80}/g) || []);
}
