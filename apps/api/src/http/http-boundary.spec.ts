import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyHttpBoundary } from './http-boundary';
import { errorBodyOf } from './testing/error-body';

@Controller('ping')
class PingController {
  @Get()
  ping(): { readonly pong: true } {
    return { pong: true };
  }
}

const front = 'https://front.run.app';

/** The API hardened as `main.ts` hardens it, on an ephemeral port. Called inside a `describe`. */
function aHardenedApi() {
  let app: NestExpressApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [PingController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    applyHttpBoundary(app, { webOrigin: front });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  return async (init: RequestInit = {}, path = '/ping') => fetch(`${baseUrl}${path}`, init);
}

// ADR 0004: the front is a second service, on its own origin. A browser asks first — the
// preflight — and only sends the call if the answer names its origin.
describe('applyHttpBoundary, CORS', () => {
  const request = aHardenedApi();

  const preflight = async (origin: string) =>
    request({
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST' },
    });

  it('lets the configured origin through its preflight', async () => {
    const response = await preflight(front);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(front);
  });

  // `Retry-After` is not in the list a browser lets a cross-origin script read: the front, on
  // another origin, only sees it if the API names it.
  it('lets the front read Retry-After on a call it made', async () => {
    const response = await request({ headers: { origin: front } });

    expect(response.headers.get('access-control-expose-headers')).toBe('Retry-After');
  });

  it('answers the preflight of any other origin without naming it', async () => {
    const response = await preflight('https://evil.example');

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('names the configured origin on the call itself', async () => {
    const response = await request({ headers: { origin: front } });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(front);
  });
});

describe('applyHttpBoundary, exceptions', () => {
  const request = aHardenedApi();

  // The uniform body has a timestamp and a path, which Nest's own answer never carries: seeing
  // them proves the global filter is registered, not merely that the route is unknown.
  it('registers the global filter: an unknown route answers in the uniform shape', async () => {
    const response = await request({}, '/nowhere');

    expect(response.status).toBe(404);
    const { statusCode, path, timestamp } = await errorBodyOf(response);
    expect({ statusCode, path }).toStrictEqual({ statusCode: 404, path: '/nowhere' });
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
