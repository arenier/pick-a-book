import type { ReconciliationFailure } from '../model/reconciliation-failure';

/**
 * Origin of the API. Inlined by Vite at build time: the frontend is served as static files from a
 * bucket (ADR 0004), with no server left to proxy anything at runtime.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export interface ApiOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

/** One request, told apart from no answer at all. A body that is not JSON reads as `null`. */
export type Answer =
  | { readonly reached: false }
  | { readonly reached: true; readonly status: number; readonly body: unknown };

/**
 * `fetch` rejects only when nothing came back — a cut connection, a server out of reach — and a
 * response that is not JSON is not an error of the transport: it is a body no guard accepts.
 */
export async function ask(
  options: ApiOptions,
  path: string,
  init: RequestInit = {},
): Promise<Answer> {
  const send = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await send(`${options.baseUrl ?? API_BASE_URL}${path}`, init);
  } catch {
    return { reached: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: left as null.
  }

  return { reached: true, status: response.status, body };
}

/** No answer is `offline`, a 429 is `rateLimited` (the limit by source), anything else unexpected. */
export function failureOf(answer: Answer): ReconciliationFailure {
  if (!answer.reached) {
    return 'offline';
  }

  return answer.status === 429 ? 'rateLimited' : 'unexpected';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
