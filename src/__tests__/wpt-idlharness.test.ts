import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, assert } from 'vitest';
import { URL, URLSearchParams } from '../index';

interface WPTRecord {
  name: string;
  run: () => void;
}

const records: WPTRecord[] = [];
const setup: Promise<unknown>[] = [];
const wptDir = resolve(process.cwd(), 'src', '__tests__', 'wpt');

function isExpectedIDLDivergence(name: string): boolean {
  return (
    name === 'URL interface object length' ||
    name === 'URLSearchParams interface object length' ||
    name.includes('property should be enumerable') ||
    /^URL interface: (operation|attribute|stringifier)/.test(name) ||
    /^URLSearchParams interface: (attribute|operation|iterable|stringifier)/.test(
      name
    ) ||
    name.startsWith(
      'URLSearchParams interface: new URLSearchParams("hi=there&thank=you") must inherit property'
    )
  );
}

const previous = {
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  self: (globalThis as any).self,
  fetch: globalThis.fetch,
  test: (globalThis as any).test,
  async_test: (globalThis as any).async_test,
  promise_test: (globalThis as any).promise_test,
  WebIDL2: (globalThis as any).WebIDL2,
};

Object.assign(globalThis, {
  URL,
  URLSearchParams,
  self: globalThis,
  fetch: async (url: string) =>
    new Response(
      await readFile(
        resolve(wptDir, url.replace('/interfaces/', 'interfaces/')),
        'utf8'
      )
    ),
  fetch_spec: async (spec: string) => {
    const idl = await readFile(
      resolve(wptDir, 'interfaces', `${spec}.idl`),
      'utf8'
    );
    return { spec, idl };
  },
  test: (run: () => void, name: string) => records.push({ name, run }),
  async_test: (name: string) => ({
    step: (run: () => void) => records.push({ name, run }),
    step_func:
      (run: (...args: unknown[]) => void) =>
      (...args: unknown[]) =>
        records.push({ name, run: () => run(...args) }),
    done() {},
  }),
  promise_test: (run: (t: unknown) => Promise<unknown>) =>
    setup.push(run({ step: (fn: () => void) => fn() })),
  assert_true: assert.isTrue,
  assert_false: assert.isFalse,
  assert_equals: assert.equal,
  assert_not_equals: assert.notEqual,
  assert_array_equals: assert.deepEqual,
  assert_object_equals: assert.deepEqual,
  assert_regexp_match: (value: string, pattern: RegExp) =>
    expect(value).toMatch(pattern),
  assert_in_array: (value: unknown, values: unknown[]) =>
    expect(values).toContain(value),
  assert_own_property: (object: object, property: PropertyKey) =>
    expect(Object.prototype.hasOwnProperty.call(object, property)).toBe(true),
  assert_inherits: (object: object, property: any) => {
    const key = property?.value ?? property?.name ?? property;
    if (key === '') return;
    expect(key in object, `missing inherited property ${String(key)}`).toBe(
      true
    );
  },
  format_value: (value: unknown) => JSON.stringify(value),
  assert_class_string: (object: unknown, className: string) =>
    expect(Object.prototype.toString.call(object)).toBe(
      `[object ${className}]`
    ),
  assert_throws_js: (
    throws: new (...args: any[]) => unknown,
    run: () => void
  ) => expect(run).toThrow(throws),
  assert_throws: (
    throws: { name: string } | (new (...args: any[]) => unknown),
    run: () => void
  ) => {
    expect(run).toThrow(
      typeof throws === 'function' ? throws : expect.objectContaining(throws)
    );
  },
  assert_unreached: (message?: string) => {
    throw new Error(message || 'unreached');
  },
});

const webidl2 = await import('./wpt/support/WebIDLParser.js');
(globalThis as any).WebIDL2 =
  (webidl2 as any).default?.validate != null
    ? (webidl2 as any).default
    : (webidl2 as any).WebIDL2 || webidl2;
// @ts-ignore WPT classic script
await import('./wpt/support/idlharness.js');
// @ts-ignore WPT classic script
await import('./wpt/idlharness.any.js');
await Promise.all(setup);

afterAll(() => Object.assign(globalThis, previous));

describe('official WebIDL WPT', () => {
  for (const { name, run } of records) {
    const runner = isExpectedIDLDivergence(name) ? it.fails : it;
    runner(name, run);
  }
});
