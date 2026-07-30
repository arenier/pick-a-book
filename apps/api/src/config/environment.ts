/**
 * Configuration validation at startup.
 *
 * The principle: a missing required variable fails the boot immediately, with the full list
 * of what is missing — rather than an obscure error on the first request that touches the
 * bucket or the database.
 *
 * Hand-written rather than backed by a schema library: a handful of variables, no extra
 * dependency, and the error message is ours. The day the configuration grows, a schema will
 * earn its keep.
 */

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface Environment {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  /**
   * Path to the SQLite file on the mounted bucket (ADR 0006).
   * The domain knows nothing about it: only `infrastructure` uses it.
   */
  readonly databasePath: string;
  /** Bucket holding the shelf photos (ADR 0004). */
  readonly storageBucket: string;
  /**
   * Endpoint of an object storage emulator, for local development (`fake-gcs-server` from
   * the docker-compose stack). Absent in production.
   */
  readonly storageEmulatorHost: string | undefined;
  /**
   * VLM provider key (ADR 0005). Optional as long as the active adapter is the stub;
   * required the day the real adapter is wired in.
   */
  readonly shelfScannerApiKey: string | undefined;
}

const NODE_ENVIRONMENTS: readonly NodeEnvironment[] = ['development', 'test', 'production'];

export class InvalidEnvironment extends Error {
  constructor(problems: readonly string[]) {
    super(
      [
        'Invalid configuration, startup aborted:',
        ...problems.map((problem) => `  - ${problem}`),
        '',
        'See .env.example for the list of variables and what they are for.',
      ].join('\n'),
    );
    this.name = 'InvalidEnvironment';
  }
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const problems: string[] = [];

  // Every value is read through a narrowing helper rather than asserted with `as` at the
  // end: the placeholders below never escape, since a non-empty `problems` throws first.
  const databasePath = required(source, 'DATABASE_PATH', problems);
  const storageBucket = required(source, 'STORAGE_BUCKET', problems);

  let nodeEnv: NodeEnvironment = 'development';
  const rawNodeEnv = source.NODE_ENV ?? 'development';
  if (isNodeEnvironment(rawNodeEnv)) {
    nodeEnv = rawNodeEnv;
  } else {
    problems.push(`NODE_ENV is "${rawNodeEnv}" — expected one of ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  const rawPort = source.PORT ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT is "${rawPort}" — expected an integer between 1 and 65535`);
  }

  if (problems.length > 0) {
    throw new InvalidEnvironment(problems);
  }

  return {
    nodeEnv,
    port,
    databasePath,
    storageBucket,
    storageEmulatorHost: optional(source.STORAGE_EMULATOR_HOST),
    shelfScannerApiKey: optional(source.SHELF_SCANNER_API_KEY),
  };
}

function required(source: NodeJS.ProcessEnv, name: string, problems: string[]): string {
  const value = source[name];
  if (isPresent(value)) {
    return value;
  }

  problems.push(`${name} is required and is not set`);
  return '';
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function optional(value: string | undefined): string | undefined {
  return isPresent(value) ? value : undefined;
}

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return NODE_ENVIRONMENTS.some((candidate) => candidate === value);
}

/** Injection token for the validated configuration. */
export const ENVIRONMENT = 'Environment';
