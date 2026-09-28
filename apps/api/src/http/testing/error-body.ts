import type { ErrorBody } from '../global-exception.filter';

/**
 * Proves that a parsed JSON value is the uniform error body, rather than asserting it: the
 * convention forbids `as`, and a spec that reads `body.path` should know it is there.
 * Excluded from the app build (`tsconfig.app.json`).
 */
export function isErrorBody(value: unknown): value is ErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    typeof value.statusCode === 'number' &&
    'message' in value &&
    typeof value.message === 'string' &&
    'timestamp' in value &&
    typeof value.timestamp === 'string' &&
    'path' in value &&
    typeof value.path === 'string'
  );
}

export async function errorBodyOf(response: Response): Promise<ErrorBody> {
  const body: unknown = await response.json();
  if (!isErrorBody(body)) {
    throw new TypeError(`not the uniform error body: ${JSON.stringify(body)}`);
  }

  return body;
}
