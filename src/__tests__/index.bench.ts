// Benchmarks adapted from react-native-url-polyfill, MIT License.
// Copyright (c) Nicolas Charpentier

import { createRequire } from 'node:module';
import { bench, describe } from 'vitest';
import {
  URL as LocalURL,
  URLSearchParams as LocalURLSearchParams,
} from './fixtures/lib';

type URLConstructor = {
  new (input: string, base?: string): URL;
  canParse?: (input: string, base?: string) => boolean;
  parse?: (input: string, base?: string) => URL | null;
};

type URLSearchParamsConstructor = {
  new (input?: string): URLSearchParams;
};

type Engine = {
  label: string;
  URL: URLConstructor;
  URLSearchParams: URLSearchParamsConstructor;
};

const require = createRequire(import.meta.url);

const ABSOLUTE_URLS = [
  'https://example.com/',
  'http://user:pass@example.com:8080/path/to/resource?a=1&b=2&c=3#section',
  'https://[2001:db8::1]:443/ipv6',
  'ftp://192.168.0.1/file.txt',
  'https://example.com/a/b/c/../../d/./e/f',
  'mailto:someone@example.com',
  'https://example.com/search?q=hello+world&lang=en-US&page=42',
  'file:///C:/Users/test/file.txt',
];

const RELATIVE_URLS = [
  ['../sibling', 'https://example.com/a/b/c'],
  ['//other.com/path', 'https://example.com/'],
  ['?newquery', 'https://example.com/page'],
  ['#anchor', 'https://example.com/page?q=1'],
  ['path/file', 'https://example.com/base/'],
];

const IDNA_URLS = [
  'https://faß.de/path?x=1',
  'https://βόλος.com/',
  'https://نامه‌ای.com/',
  'https://Bücher.de/',
  'https://www．lookout．net/',
  'https://xn--zca.xn--zca/',
];

const INVALID_IDNA_URLS = [
  'https://يa/',
  'https://look־out.net/',
  'https://xn--a.ß/',
];

const QUERIES = [
  'a=1&b=2&c=3&d=4&e=5',
  'name=John+Doe&email=john%40example.com&msg=Hello%2C+World%21',
  `key=${'x'.repeat(200)}&other=value`,
  'arr=1&arr=2&arr=3&arr=4&arr=5&arr=6',
];

const PERCENT_HEAVY_QUERIES = [
  `ascii=${'%41'.repeat(64)}&space=${'+'.repeat(64)}&reserved=${'%2F%3F%23%5B%5D%40'.repeat(16)}`,
  `utf8=${'%E8%B7%AF%E5%BE%84%20%F0%9F%92%A9'.repeat(32)}`,
  `mixed=${'value%20'.repeat(64)}&literal=%zz%20x&trailing=%`,
  `malformed=${'%FE%FF%C2'.repeat(32)}`,
];

const engines: Engine[] = [
  {
    label: 'whatwg-url-minimum',
    URL: LocalURL,
    URLSearchParams: LocalURLSearchParams,
  },
];
let sink = 0;

const IDNA_ENGINE_LABELS = new Set(['whatwg-url-minimum', 'whatwg-url']);

await addReactNativeURLPolyfill();
addEngine('whatwg-url-without-unicode', 'whatwg-url-without-unicode');
addEngine('whatwg-url', 'whatwg-url');

const BENCHMARKS: Record<
  string,
  (
    URL: URLConstructor,
    URLSearchParams: URLSearchParamsConstructor
  ) => (() => number) | null
> = {
  'URL construction (absolute)': URL => () => {
    let object: URL | null = null;
    for (const input of ABSOLUTE_URLS) {
      object = new URL(input);
    }
    return object!.protocol.length + object!.pathname.length;
  },
  'URL construction (relative + base)': URL => () => {
    let object: URL | null = null;
    for (const [input, base] of RELATIVE_URLS) {
      object = new URL(input, base);
    }
    return object!.protocol.length + object!.pathname.length;
  },
  'URL construction (IDNA/TR46)': URL => () => {
    let object: URL | null = null;
    for (const input of IDNA_URLS) {
      object = new URL(input);
    }
    return object!.host.length + object!.href.length;
  },
  'URL.canParse (invalid IDNA/TR46)': URL => {
    if (!URL.canParse) return null;
    return () => {
      let valid = false;
      for (const input of INVALID_IDNA_URLS) {
        valid = URL.canParse!(input);
      }
      return Number(valid);
    };
  },
  'URL.canParse (valid)': URL => {
    if (!URL.canParse) return null;
    return () => {
      let valid = false;
      for (const input of ABSOLUTE_URLS) {
        valid = URL.canParse!(input);
      }
      return Number(valid);
    };
  },
  'URL.canParse (invalid)': URL =>
    URL.canParse ? () => Number(URL.canParse!('https://[invalid-host/')) : null,
  'URL.parse': URL => {
    if (!URL.parse) return null;
    return () => {
      let object: URL | null = null;
      for (const input of ABSOLUTE_URLS) {
        object = URL.parse!(input);
      }
      return object!.href.length;
    };
  },
  'URL construction (percent-encoding)': URL => {
    const input = `https://example.com/${'路径 😀/'.repeat(100)}`;
    return () => new URL(input).href.length;
  },
  'URL property getters': URL => {
    const objects = ABSOLUTE_URLS.map(input => new URL(input));
    return () => {
      let length = 0;
      for (const object of objects) {
        length += object.href.length;
        length += object.protocol.length;
        length += object.host.length;
        length += object.hostname.length;
        length += object.pathname.length;
        length += object.search.length;
        length += object.hash.length;
        length += object.origin.length;
      }
      return length;
    };
  },
  'URL setters': URL => {
    const object = new URL('https://example.com/path?q=1');
    return () => {
      object.protocol = 'http:';
      object.hostname = 'test.org';
      object.port = '9090';
      object.pathname = '/new/path';
      object.search = '?a=1&b=2';
      object.hash = '#top';
      return object.href.length;
    };
  },
  'URLSearchParams parse': (_URL, URLSearchParams) => () => {
    let params: URLSearchParams | null = null;
    for (const query of QUERIES) {
      params = new URLSearchParams(query);
    }
    return params!.toString().length;
  },
  'URLSearchParams percent-heavy parse': (_URL, URLSearchParams) => () => {
    let params: URLSearchParams | null = null;
    for (const query of PERCENT_HEAVY_QUERIES) {
      params = new URLSearchParams(query);
    }
    return params!.size + (params!.get('malformed')?.length || 0);
  },
  'URLSearchParams percent-heavy stringify': (_URL, URLSearchParams) => {
    const params = new URLSearchParams();
    for (let index = 0; index < 100; index++) {
      params.append(`键 ${index}`, '值 😀'.repeat(10));
    }
    return () => params.toString().length;
  },
  'URLSearchParams manipulate + stringify': (_URL, URLSearchParams) => () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    params.append('d', '4');
    params.set('a', 'updated');
    params.delete('b');
    params.sort();
    return params.toString().length;
  },
  'URLSearchParams repeated mutation': (_URL, URLSearchParams) => {
    const query = Array.from(
      { length: 100 },
      (_, index) => `key${index}=${index}`
    ).join('&');
    const params = new URLSearchParams(query);
    return () => {
      params.set('key50', 'updated');
      params.delete('missing');
      return params.size;
    };
  },
  'URL + searchParams roundtrip': URL => () => {
    const url = new URL('https://example.com/search?a=1&b=2&c=3');
    url.searchParams.append('d', '4');
    url.searchParams.set('a', 'z');
    return url.href.length;
  },
  'URL + searchParams repeated append': URL => () => {
    const url = new URL('https://example.com/search');
    for (let index = 0; index < 100; index++) {
      url.searchParams.append(`key${index}`, `value${index}`);
    }
    return url.href.length;
  },
};

for (const [label, createBenchmark] of Object.entries(BENCHMARKS)) {
  describe(label, () => {
    for (const engine of engines) {
      if (
        label.includes('IDNA/TR46') &&
        !IDNA_ENGINE_LABELS.has(engine.label)
      ) {
        continue;
      }
      const run = createBenchmark(engine.URL, engine.URLSearchParams);
      if (run) {
        bench(engine.label, () => {
          sink ^= run();
        });
      }
    }
  });
}

function addEngine(label: string, packageName: string): void {
  try {
    const implementation = require(packageName);
    if (implementation.URL && implementation.URLSearchParams) {
      engines.push({
        label,
        URL: implementation.URL,
        URLSearchParams: implementation.URLSearchParams,
      });
    }
  } catch {
    // Optional benchmark competitor is not installed or not loadable in Node.
  }
}

async function addReactNativeURLPolyfill(): Promise<void> {
  try {
    const implementation = await import('react-native-url-polyfill/js/URL.js');
    engines.push({
      label: 'react-native-url-polyfill',
      URL: implementation.URL as unknown as URLConstructor,
      URLSearchParams:
        implementation.URLSearchParams as unknown as URLSearchParamsConstructor,
    });
  } catch {
    // Optional benchmark competitor is not installed or not loadable in Node.
  }
}
