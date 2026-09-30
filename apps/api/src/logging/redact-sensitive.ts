/**
 * What must never reach a log line, whatever the depth somebody logs it at: a provider key
 * (ADR 0005), a credential, the bytes of a photo.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'apiKey',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'authorization',
  'cookie',
  'bytes',
  'buffer',
  'image',
]);

const CIRCULAR = '[Circular]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
 * Walks `value` and leaves behind the sensitive keys, at any depth.
 *
 * pino's own `redact` lists one path per depth, so it always stops somewhere, and a secret
 * logged one level below the stop goes through: a promise of "never" needs a walk that does not
 * stop. The key is removed rather than masked — a mask says a secret was there.
 *
 * Only plain objects and arrays are rebuilt. An `Error` is left as it is: pino serialises it from
 * the instance, stack included, and a rebuilt copy would turn that stack into a bare property.
 * `ancestors` holds the objects being walked, not every object seen: the same object reached
 * twice is logged twice, and only a true cycle is cut.
 */
function walk(value: unknown, ancestors: WeakSet<object>): unknown {
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return value;
  }
  if (ancestors.has(value)) {
    return CIRCULAR;
  }

  ancestors.add(value);
  const rebuilt = Array.isArray(value)
    ? value.map((item: unknown) => walk(item, ancestors))
    : Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !SENSITIVE_KEYS.has(key))
          .map(([key, inner]) => [key, walk(inner, ancestors)]),
      );
  ancestors.delete(value);

  return rebuilt;
}

/** The fields of a log line, without the sensitive keys — a copy, the caller's object is left alone. */
export function redactSensitive(line: Record<string, unknown>): Record<string, unknown> {
  const redacted = walk(line, new WeakSet());

  return isPlainObject(redacted) ? redacted : {};
}
