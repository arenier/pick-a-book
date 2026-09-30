import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildLoggerOptions } from './logger-options';
import { aCapturedLog } from './testing/captured-log';

/** A logger built from the options, writing to memory. */
function aLogger(nodeEnv: 'development' | 'test' | 'production' = 'production') {
  const log = aCapturedLog();
  const logger = pino(buildLoggerOptions({ nodeEnv, googleCloudProject: undefined }), log.stream);

  return { logger, log };
}

// Cloud Run turns a stdout line into a log entry; in JSON, `severity` decides its level and
// `message` its text (ADR 0004). In text, everything is INFO and a 500 drowns.
describe('buildLoggerOptions, the shape of a line', () => {
  it.each([
    ['info', 'INFO'],
    ['warn', 'WARNING'],
    ['error', 'ERROR'],
    ['fatal', 'CRITICAL'],
  ] as const)('writes %s as severity %s', (level, severity) => {
    const { logger, log } = aLogger();

    logger[level]('something happened');

    const [line] = log.lines();
    expect(line).toMatchObject({ severity, message: 'something happened' });
  });
});

describe('buildLoggerOptions, a line that says more', () => {
  it('names the level by severity alone, not by its number', () => {
    const { logger, log } = aLogger();

    logger.info('hello');

    expect(log.lines()[0]).not.toHaveProperty('level');
  });

  it('stamps the line with an ISO date', () => {
    const { logger, log } = aLogger();

    logger.info('hello');

    const time = String(log.lines()[0]?.['time']);
    expect(new Date(time).toISOString()).toBe(time);
  });

  // Error Reporting groups crashes by the stack it finds in `stack_trace`.
  it('copies the stack of a logged error to stack_trace', () => {
    const { logger, log } = aLogger();
    const failure = new Error('bucket unavailable');

    logger.error({ err: failure }, 'could not store');

    const [line] = log.lines();
    expect(line).toMatchObject({ severity: 'ERROR', message: 'could not store' });
    expect(line).toHaveProperty('stack_trace', expect.stringContaining('bucket unavailable'));
  });

  it('adds no stack_trace to a line that carries no error', () => {
    const { logger, log } = aLogger();

    logger.info('hello');

    expect(log.lines()[0]).not.toHaveProperty('stack_trace');
  });
});

// Non-negotiable (issue #45): a provider key, an authorization header or the bytes of a photo
// never reach the logs, whatever the depth at which somebody logs them.
describe('buildLoggerOptions, redaction', () => {
  it.each([
    ['a provider key', { apiKey: 'sk-secret-key' }, 'sk-secret-key'],
    ['a provider key, nested', { provider: { apiKey: 'sk-secret-key' } }, 'sk-secret-key'],
    ['a provider key, deeper', { a: { b: { apiKey: 'sk-secret-key' } } }, 'sk-secret-key'],
    [
      'a provider key, ten levels down',
      {
        l1: {
          l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { apiKey: 'sk-secret-key' } } } } } } } },
        },
      },
      'sk-secret-key',
    ],
    ['GEMINI_API_KEY', { env: { GEMINI_API_KEY: 'gm-secret-key' } }, 'gm-secret-key'],
    ['OPENROUTER_API_KEY', { env: { OPENROUTER_API_KEY: 'or-secret-key' } }, 'or-secret-key'],
    ['an authorization header', { headers: { authorization: 'Bearer tok-secret' } }, 'tok-secret'],
    ['a cookie', { headers: { cookie: 'session=cookie-secret' } }, 'cookie-secret'],
    ['the bytes of a photo', { photo: { bytes: [255, 216, 255, 224, 42, 42] } }, '255,216'],
    ['a buffer', { upload: { buffer: 'BUFFER-CONTENT' } }, 'BUFFER-CONTENT'],
    ['an image', { image: 'BASE64-IMAGE-CONTENT' }, 'BASE64-IMAGE-CONTENT'],
  ])('never writes %s', (_label, fields, secret) => {
    const { logger, log } = aLogger();

    logger.info(fields, 'context');

    expect(log.text()).not.toContain(secret);
    expect(log.lines()[0]).toMatchObject({ message: 'context' });
  });

  it('keeps what is not sensitive', () => {
    const { logger, log } = aLogger();

    logger.info({ scanId: '1f9c2e3a', photoSizeBytes: 2_345_678 }, 'stored');

    expect(log.lines()[0]).toMatchObject({ scanId: '1f9c2e3a', photoSizeBytes: 2_345_678 });
  });
});

describe('buildLoggerOptions, development and production', () => {
  // A person reads the terminal in development; Cloud Logging reads stdout in production.
  it('pretty-prints in development', () => {
    const options = buildLoggerOptions({ nodeEnv: 'development', googleCloudProject: undefined });

    expect(options.transport).toMatchObject({ target: 'pino-pretty' });
  });

  it.each(['production', 'test'] as const)('writes raw JSON to stdout in %s', (nodeEnv) => {
    const options = buildLoggerOptions({ nodeEnv, googleCloudProject: undefined });

    expect(options.transport).toBeUndefined();
  });

  // pino-pretty reads the numeric level to colour a line: mapping it to `severity` there would
  // print a level-less line in the terminal.
  it('keeps the level readable in development, severity being for Cloud Logging', () => {
    const options = buildLoggerOptions({ nodeEnv: 'development', googleCloudProject: undefined });

    expect(options.formatters?.level).toBeUndefined();
  });
});
