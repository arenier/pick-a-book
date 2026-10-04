import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

import { canSetHeader } from './writable-response';

/**
 * An image never changes under its id, so the browser never asks again — and it is the user's own,
 * so no shared cache keeps it (specs/002-upload-history, research.md §7).
 */
const IMMUTABLE_PRIVATE_CACHE = 'private, max-age=31536000, immutable';

/**
 * Says so on a success only. A `@Header` is written before the handler runs, so it would also
 * ride on a 404 or a 502 and keep them for a year; here the header is written once the handler
 * has answered, and an error never reaches it.
 */
@Injectable()
export class ImmutablePrivateCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const response: unknown = context.switchToHttp().getResponse();
        if (canSetHeader(response)) {
          response.setHeader('Cache-Control', IMMUTABLE_PRIVATE_CACHE);
        }
      }),
    );
  }
}
