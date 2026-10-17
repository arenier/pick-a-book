import { isRecord } from '../model/history-entry';
import type { HistoryFailure } from '../model/history-state';

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

export const baseUrlOf = (options: ApiOptions): string => options.baseUrl ?? API_BASE_URL;

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
    response = await send(`${baseUrlOf(options)}${path}`, init);
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

/** The stable `code` an error body carries (research.md §10) — never its `message`. */
export function codeOf(body: unknown): string | undefined {
  return isRecord(body) && typeof body['code'] === 'string' ? body['code'] : undefined;
}

/**
 * Why a read of the history failed, from a response that was not the one expected: nothing
 * answered, the limit by source tripped, or something the front does not know.
 */
export function failureOf(answer: Answer): HistoryFailure {
  if (!answer.reached) {
    return 'offline';
  }

  return answer.status === 429 && codeOf(answer.body) === 'TOO_MANY_REQUESTS'
    ? 'rateLimited'
    : 'unexpected';
}
