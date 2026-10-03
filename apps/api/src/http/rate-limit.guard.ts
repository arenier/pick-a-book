import { type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/** The part of a response this guard writes to: a header, nothing else. */
interface HeaderWritable {
  setHeader(name: string, value: string): unknown;
}

function canSetHeader(value: unknown): value is HeaderWritable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'setHeader' in value &&
    typeof value.setHeader === 'function'
  );
}

/**
 * The global limit on requests per source (specs/002-upload-history, FR-014, research.md §9),
 * with the answer the contract promises when it trips: a 429 with the stable code
 * `TOO_MANY_REQUESTS` (the front tells it from the daily cap by that code) and a plain
 * `Retry-After`, in seconds.
 *
 * `@nestjs/throttler` names its headers after the tier that tripped (`Retry-After-write`), which
 * no client reads: it is told not to write headers at all (`setHeaders: false`), and this guard
 * writes the one the contract names. The body is shaped by the global exception filter, like
 * every other error of the API.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response: unknown = context.switchToHttp().getResponse();
    if (canSetHeader(response)) {
      response.setHeader('Retry-After', String(detail.timeToBlockExpire));
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests from this source: try again in a minute',
        error: 'Too Many Requests',
        code: 'TOO_MANY_REQUESTS',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
