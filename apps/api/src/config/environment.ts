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
   * Postgres connection string, as Neon hands it out (ADR 0006).
   * The domain knows nothing about it: only `infrastructure` uses it.
   */
  readonly databaseUrl: string;
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
  const databaseUrl = required(source, 'DATABASE_URL', problems);
  if (databaseUrl !== '' && !isPostgresUrl(databaseUrl)) {
    problems.push(
      'DATABASE_URL is not a Postgres connection string — expected a postgres:// or ' +
        'postgresql:// URL',
    );
  }
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
    databaseUrl,
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

/**
 * A connection string that is merely non-empty is not enough: the previous persistence took a
 * filesystem path here (ADR 0006 replaced it), and a leftover path would fail deep inside the
 * driver rather than at boot. Parsing proves the scheme instead of assuming it.
 */
function isPostgresUrl(value: string): boolean {
  const parsed = URL.parse(value);

  return parsed !== null && (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:');
}

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return NODE_ENVIRONMENTS.some((candidate) => candidate === value);
}

/** Injection token for the validated configuration. */
export const ENVIRONMENT = 'Environment';
