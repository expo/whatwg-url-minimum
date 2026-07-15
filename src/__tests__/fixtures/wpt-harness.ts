import { getCallSites } from 'node:util';
import { relative } from 'node:path';
import { describe, test, assert, expect } from 'vitest';
import { URL, URLSearchParams } from '../../index';

const cwd = process.cwd();

globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;

globalThis.fetch = async (url: any): Promise<Response> => {
  const { default: mod } = await import('../wpt/' + url);
  return new Response(JSON.stringify(mod, null, 2));
};

function wptTest(run: any, name: string) {
  test(name, run);
}

globalThis.test = wptTest;
globalThis.subsetTestByKey = (_key: any, _test: any, run: any, name: string) =>
  wptTest(run, name);
globalThis.promise_test = (run: any) => {
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
