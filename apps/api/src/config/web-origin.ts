/** The port of `yarn web`: the frontend a fresh checkout talks to. */
const DEFAULT_WEB_ORIGIN = 'http://localhost:4200';

/**
 * Defaults to the port of `yarn web` in development, so the stack starts with no
 * configuration. In production there is no sensible default — the front is another Cloud Run
 * service on its own origin (ADR 0004) — and a browser front without it is unusable, so its
 * absence fails the boot, like any other required variable.
 */
export function readWebOrigin(
  configured: string | undefined,
  nodeEnv: string,
  problems: string[],
): string {
  if (configured === undefined && nodeEnv === 'production') {
    problems.push('WEB_ORIGIN is required in production and is not set');
  }

  const webOrigin = configured ?? DEFAULT_WEB_ORIGIN;
  if (!isHttpOrigin(webOrigin)) {
    problems.push(`WEB_ORIGIN is "${webOrigin}" — expected an http:// or https:// origin`);
  }

  return webOrigin;
}

/**
 * CORS compares the `Origin` header byte for byte: `localhost:4200` without a scheme would
 * never match, and the frontend would get opaque CORS errors instead of a failed boot.
 */
function isHttpOrigin(value: string): boolean {
  const parsed = URL.parse(value);

  return parsed !== null && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}
