import { getCallSites } from 'node:util';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, test, assert, expect } from 'vitest';
import { URL, URLSearchParams } from '../../index';

const cwd = process.cwd();
const wptDir = resolve(cwd, 'src', '__tests__', 'wpt');

globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
(globalThis as any).self = globalThis;

globalThis.fetch = async (url: any): Promise<Response> => {
  if (`${url}` === '/interfaces/url.idl') {
    return new Response(
      await readFile(resolve(wptDir, 'interfaces', 'url.idl'), 'utf8')
    );
  }
  const { default: mod } = await import('../wpt/' + url);
  return new Response(JSON.stringify(mod, null, 2));
};

function wptTest(run: any, name: string) {
  test(name, run);
}

globalThis.test = wptTest;
globalThis.subsetTestByKey = (_key: any, _test: any, run: any, name: string) =>
  wptTest(run, name);
globalThis.promise_test = (run: any, name?: string) => {
  if (name && name !== 'Loading data…') {
    test(name, run);
    return;
  }
  const id = relative(cwd, getCallSites(2)[1].scriptName);
  describe(`resources (${id})`, run);
};
globalThis.assert_true = assert.isTrue;
globalThis.assert_false = assert.isFalse;
globalThis.assert_equals = assert.equal;
globalThis.assert_not_equals = assert.notEqual;
globalThis.assert_array_equals = assert.deepEqual;
globalThis.assert_throws_js = (throws: any, run: any) =>
  expect(run).toThrow(throws);
