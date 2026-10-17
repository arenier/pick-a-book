import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildLoggerOptions } from '../logging/logger-options';
import { aCapturedLog } from '../logging/testing/captured-log';
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

  @Get('coded')
  coded(): never {
    throw new ConflictException({ message: 'busy', error: 'Conflict', code: 'SCAN_IN_PROGRESS' });
  }

  @Get('numeric-code')
  numericCode(): never {
    throw new BadRequestException({ message: 'odd', code: 42 });
  }
}

/**
 * One application for the whole file — nestjs-pino keeps a single pino-http per process. It is
 * wired as `main.ts` wires it: pino behind `useLogger`, so the filter logs through it.
 */
function aRunningApiWithTheFilter() {
  const log = aCapturedLog();
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const options = buildLoggerOptions({ nodeEnv: 'production', googleCloudProject: undefined });
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: [options, log.stream] })],
      controllers: [BoomController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(PinoLogger));
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  return { log, get: async (path: string) => fetch(`${baseUrl}${path}`) };
}

const { log, get } = aRunningApiWithTheFilter();

/** The ERROR lines that concern a path: what a route raised on purpose must not be among them. */
const errorLinesAbout = (path: string) =>
  log.lines().filter((line) => line['severity'] === 'ERROR' && JSON.stringify(line).includes(path));

describe('GlobalExceptionFilter, for an error nobody modelled', () => {
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

  // The promise "no stack to the client" only holds if the stack goes somewhere else: through
  // the application logger, as the ERROR line Cloud Logging files under its own level.
  it('logs the error through the application logger, stack included', async () => {
    await get('/boom/bug');

    const [line] = errorLinesAbout('/boom/bug');
    expect(line).toMatchObject({
      severity: 'ERROR',
      message: 'connect ECONNREFUSED 10.0.0.7:5432 with password hunter2',
      req: { method: 'GET', path: '/boom/bug' },
    });
    expect(line).toHaveProperty('stack_trace', expect.stringContaining('BoomController'));
  });
});

describe('GlobalExceptionFilter, for an HttpException a route chose to raise', () => {
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
    await get('/boom/bad-request');

    expect(errorLinesAbout('/boom/bad-request')).toStrictEqual([]);
  });
});

describe('GlobalExceptionFilter, for a route that does not exist', () => {
  it('answers 404 in the same shape', async () => {
    const response = await get('/nowhere');

    expect(response.status).toBe(404);
    await expect(errorBodyOf(response)).resolves.toMatchObject({
      statusCode: 404,
      path: '/nowhere',
    });
  });
});

// A status is not always enough to pick the message the front shows: two 409s, two 429s
// (specs/002-upload-history, research.md §10). The route says which with a stable `code`.
describe('GlobalExceptionFilter, for an HttpException that carries a code', () => {
  it('lets the code through, with the uniform body', async () => {
    const response = await get('/boom/coded');

    expect(response.status).toBe(409);
    await expect(errorBodyOf(response)).resolves.toMatchObject({
      statusCode: 409,
      message: 'busy',
      code: 'SCAN_IN_PROGRESS',
      path: '/boom/coded',
    });
  });

  it('ignores a code that is not a string, and leaves the body as it was', async () => {
    const body = await errorBodyOf(await get('/boom/numeric-code'));

    expect(Object.keys(body)).not.toContain('code');
  });
});
