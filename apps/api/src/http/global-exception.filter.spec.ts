import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from './global-exception.filter';
import { errorBodyOf } from './testing/error-body';

/** Routes that fail in every way the filter has to tell apart. */
@Controller('boom')
class BoomController {
  @Get('bug')
  bug(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.7:5432 with password hunter2');
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('photo is empty');
  }

  @Get('bad-gateway')
  badGateway(): never {
    throw new BadGatewayException('The recognition service is unavailable');
  }

  @Get('list')
  list(): never {
    throw new BadRequestException(['first problem', 'second problem']);
  }
}

/** The filter over real HTTP, on an ephemeral port. Called inside a `describe`. */
function aRunningApiWithTheFilter() {
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  return async (path: string) => fetch(`${baseUrl}${path}`);
}

/** What the filter writes: the fields Cloud Logging reads, proven rather than asserted. */
interface LogEntry {
  readonly severity: string;
  readonly message: string;
  readonly stack_trace: string;
  readonly path: string;
}

function isLogEntry(value: unknown): value is LogEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'severity' in value &&
    typeof value.severity === 'string' &&
    'message' in value &&
    typeof value.message === 'string' &&
    'stack_trace' in value &&
    typeof value.stack_trace === 'string' &&
    'path' in value &&
    typeof value.path === 'string'
  );
}

/** Every line the filter wrote to stderr, parsed — Cloud Logging reads one JSON per line. */
function captureLog() {
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

  return {
    lines: () =>
      write.mock.calls.map(([chunk]) => {
        const entry: unknown = JSON.parse(String(chunk));
        if (!isLogEntry(entry)) {
          throw new TypeError(`not a log entry: ${String(chunk)}`);
        }

        return entry;
      }),
    restore: () => {
      write.mockRestore();
    },
  };
}

describe('GlobalExceptionFilter, for an error nobody modelled', () => {
  const get = aRunningApiWithTheFilter();
  let log: ReturnType<typeof captureLog>;

  beforeEach(() => {
    log = captureLog();
  });

  afterEach(() => {
    log.restore();
  });

  it('answers 500 with a generic body, and no stack, cause or detail', async () => {
    const response = await get('/boom/bug?token=abc');

    expect(response.status).toBe(500);
    const body = await errorBodyOf(response);
    expect(body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
      path: '/boom/bug',
    });
    expect(new Set(Object.keys(body))).toStrictEqual(
      new Set(['message', 'path', 'statusCode', 'timestamp']),
    );
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|hunter2|at .*\.ts/u);
  });

  it('writes the error, stack included, as a severity ERROR JSON line', async () => {
    await get('/boom/bug');

    const [entry] = log.lines();
    expect(entry).toMatchObject({
      severity: 'ERROR',
      message: 'connect ECONNREFUSED 10.0.0.7:5432 with password hunter2',
      path: '/boom/bug',
    });
    expect(entry.stack_trace).toContain('BoomController');
  });
});

describe('GlobalExceptionFilter, for an HttpException a route chose to raise', () => {
  const get = aRunningApiWithTheFilter();

  it('keeps its status, and takes the uniform body', async () => {
    const response = await get('/boom/bad-request');

    expect(response.status).toBe(400);
    await expect(errorBodyOf(response)).resolves.toMatchObject({
      statusCode: 400,
      message: 'photo is empty',
      path: '/boom/bad-request',
    });
  });

  it('keeps a 5xx status as well — a modelled failure is not a bug', async () => {
    const response = await get('/boom/bad-gateway');

    expect(response.status).toBe(502);
    await expect(errorBodyOf(response)).resolves.toMatchObject({
      statusCode: 502,
      message: 'The recognition service is unavailable',
    });
  });

  it('carries a timestamp that is an ISO date', async () => {
    const { timestamp } = await errorBodyOf(await get('/boom/bad-request'));

    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('joins a list of messages into one', async () => {
    const { message } = await errorBodyOf(await get('/boom/list'));

    expect(message).toBe('first problem; second problem');
  });

  it('does not log an error a route raised on purpose', async () => {
    const log = captureLog();

    await get('/boom/bad-request');

    expect(log.lines()).toStrictEqual([]);
    log.restore();
  });
});

describe('GlobalExceptionFilter, for a route that does not exist', () => {
  const get = aRunningApiWithTheFilter();

  it('answers 404 in the same shape', async () => {
    const response = await get('/nowhere');

    expect(response.status).toBe(404);
    await expect(errorBodyOf(response)).resolves.toMatchObject({
      statusCode: 404,
      path: '/nowhere',
    });
  });
});
