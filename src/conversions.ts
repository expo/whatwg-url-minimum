export function toUSVString(value: unknown): string {
  // NOTE(@kitten): We skip the unpaired surrogate replacements here, since we assume
  // all strings are well-formed unicode strings
  // NOTE(@kitten): The specification says that a built-in error will be issued for symbols,
  // so we don't bother issuing a custom error message, since the specification doesn't say
  // what kind of message needs to be raised
  return typeof value === 'string' ? value : String(value);
}

const unpairedSurrogatePattern =
  /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g;

export function toWellFormed(value: string): string {
  // TODO(@kitten): Replace with toWellFormed once it's widely available (blocked on old Hermes)
  return value.replace(unpairedSurrogatePattern, '$1\ufffd');
}

export function toObject<T = object>(value: unknown, context?: string): T {
  if (typeof value !== 'object' || value == null) {
    let message = context ? `${context}: ` : '';
    message += 'The provided value is not an object';
    throw new TypeError(message);
  }
  return value as T;
}

export function toIterator(value: unknown): Iterator<any> | undefined {
  if (
    value != null &&
    typeof value === 'object' &&
    typeof value[Symbol.iterator] === 'function'
  ) {
    const iterator = value[Symbol.iterator]();
    if (!iterator || typeof iterator !== 'object') {
      throw new TypeError(
        'Result of the Symbol.iterator method is not an object'
      );
    }
    return iterator;
  } else {
    return undefined;
  }
}

export function toQueryPair(value: unknown): [string, string] {
  let iterator: Iterator<any> | undefined;
  if (Array.isArray(value)) {
    if (value.length === 2) {
      const tuple = value as [unknown, unknown];
      tuple[0] = toUSVString(tuple[0]);
      tuple[1] = toUSVString(tuple[1]);
      return tuple as [string, string];
    }
  } else if ((iterator = toIterator(value)) != null) {
    const a = toObject<IteratorResult<unknown>>(iterator.next());
    const b = toObject<IteratorResult<unknown>>(iterator.next());
    if (!a.done && !b.done) {
      return [toUSVString(a.value), toUSVString(b.value)];
    }
  }
  throw new TypeError(
    'Each query pair must be an iterable [name, value] tuple'
  );
}
