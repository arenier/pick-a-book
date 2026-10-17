import { Body, Controller, Get, type INestApplication, Logger, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll } from 'vitest';

import { buildLoggerOptions } from '../logger-options';
import { aCapturedLog } from './captured-log';

@Controller('ping')
class PingController {
  @Get()
  ping(): { readonly pong: true } {
    new Logger(PingController.name).warn('a provider was slow');
    return { pong: true };
  }

  @Get('fail')
  fail(): never {
    throw new Error('a bug');
  }

  @Post()
  upload(@Body() body: unknown): { readonly received: boolean } {
    return { received: body !== undefined };
  }
}

export const traceId = '105445aa7843bc8bf206b12000100000';

/**
 * The application as `main.ts` builds it — pino behind `LoggerModule`, `useLogger` — on an
 * ephemeral port, its output captured. Called once per spec file, at its top level:
 * nestjs-pino keeps a single pino-http per process, so a second application in the same file
 * would write to the first one's stream. Excluded from the app build (`tsconfig.app.json`).
 */
export function aLoggedApi(googleCloudProject?: string) {
  const log = aCapturedLog();
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const options = buildLoggerOptions({ nodeEnv: 'production', googleCloudProject });
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: [options, log.stream] })],
      controllers: [PingController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(PinoLogger));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const request = async (path = '/ping', init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    await response.text();

    return response;
  };

  return { log, request };
}
