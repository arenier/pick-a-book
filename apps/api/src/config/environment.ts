import { OwnerId } from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';

import { readDailyScanLimit } from './daily-scan-limit';

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
  /** Which VLM answers a scan, and the key it needs (ADR 0005). */
  readonly shelfScanner: ShelfScannerConfiguration;
  /** Bucket that keeps the shelf photos (ADR 0004). */
  readonly bucketName: string;
  /**
   * Development only: where the GCS emulator listens. Absent in production, where the SDK
   * talks to the real API.
   */
  readonly bucketEmulatorHost: string | undefined;
  /**
   * Owner segment of every bucket key (`{ownerId}/shelf_photo/{id}`). A fixed value until
   * there are user accounts — changing where it comes from will not move a single object.
   */
  readonly ownerId: OwnerId;
  /**
   * Analyses allowed per day, uploads and re-scans together: what bounds the bill while access
   * is open (specs/002-upload-history, FR-015).
   */
  readonly dailyScanLimit: number;
  /** Origin of the frontend, the one CORS lets through (ADR 0004: two origins). */
  readonly webOrigin: string;
  /**
   * The GCP project the API runs in. Optional: it only lets a log line name its trace by the
   * resource Cloud Logging links on (`projects/{project}/traces/{id}`).
   */
  readonly googleCloudProject: string | undefined;
}

/**
 * Provider selection (ADR 0005).
 *
 * The V1 builds two adapters and settles between them on real photos, so the provider is a
 * runtime choice rather than a hardcoded one. `stub` is the default: it calls nothing, and
 * lets the API boot — and the frontend be worked on — without a key or a bill.
 *
 * Modelled as a discriminated union rather than a provider plus a bag of optional keys:
 * `stub` genuinely has no key, and the two real providers have exactly one each. A shape
 * that allows a provider without its key would push the check down to the adapter, which is
 * one request too late.
 */
export type ShelfScannerProvider = 'gemini' | 'qwen' | 'stub';

export type ShelfScannerConfiguration =
  | { readonly provider: 'stub' }
  | { readonly provider: 'gemini'; readonly apiKey: string }
  | { readonly provider: 'qwen'; readonly apiKey: string };

const SHELF_SCANNER_PROVIDERS: readonly ShelfScannerProvider[] = ['gemini', 'qwen', 'stub'];

/**
 * The environment variable each provider reads its key from.
 *
 * Qwen goes through OpenRouter rather than DashScope: DashScope requires an Alibaba Cloud
 * account with identity verification even on its free tier, which is a lot of relationship
 * for a few cents a month (issue #10).
 */
const PROVIDER_KEY_VARIABLES = {
  gemini: 'GEMINI_API_KEY',
  qwen: 'OPENROUTER_API_KEY',
} as const;

const NODE_ENVIRONMENTS: readonly NodeEnvironment[] = ['development', 'test', 'production'];

const DEFAULT_OWNER_ID = 'default';

/** The port of `yarn web`: the frontend a fresh checkout talks to. */
const DEFAULT_WEB_ORIGIN = 'http://localhost:4200';

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

  const shelfScanner = readShelfScanner(source, problems);

  const photoStorage = readPhotoStorage(source, problems);
  const dailyScanLimit = readDailyScanLimit(optional(source, 'DAILY_SCAN_LIMIT'), problems);
  const webOrigin = readWebOrigin(source, nodeEnv, problems);

  if (problems.length > 0) {
    throw new InvalidEnvironment(problems);
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    shelfScanner,
    ...photoStorage,
    dailyScanLimit,
    webOrigin,
    googleCloudProject: optional(source, 'GOOGLE_CLOUD_PROJECT'),
  };
}

function readPhotoStorage(
  source: NodeJS.ProcessEnv,
  problems: string[],
): Pick<Environment, 'bucketName' | 'bucketEmulatorHost' | 'ownerId'> {
  const bucketName = required(source, 'BUCKET_NAME', problems);

  // The name the emulator docs suggest is a trap: the GCS SDK reads it by itself, as an
  // experimental switch, and builds its download URLs from it without the /storage/v1
  // prefix — uploads work and every read 404s. Ours is passed explicitly instead.
  if (optional(source, 'STORAGE_EMULATOR_HOST') !== undefined) {
    problems.push(
      'STORAGE_EMULATOR_HOST is set — the GCS SDK reads it on its own and misroutes downloads; ' +
        'use BUCKET_EMULATOR_HOST instead',
    );
  }

  return {
    bucketName,
    bucketEmulatorHost: optional(source, 'BUCKET_EMULATOR_HOST'),
    ownerId: readOwnerId(source, problems),
  };
}

/** What makes a valid owner id is the recognition context's rule (`OwnerId`), not ours. */
function readOwnerId(source: NodeJS.ProcessEnv, problems: string[]): OwnerId {
  const raw = optional(source, 'OWNER_ID') ?? DEFAULT_OWNER_ID;
  const ownerId = OwnerId.of(raw);
  if (ownerId.ok) {
    return ownerId.value;
  }

  problems.push(`OWNER_ID is "${raw}" — ${ownerId.error.message}`);
  // The fallback never escapes: a non-empty `problems` throws before the caller returns.
  return unwrap(OwnerId.of(DEFAULT_OWNER_ID));
}

/**
 * Defaults to the port of `yarn web` in development, so the stack starts with no
 * configuration. In production there is no sensible default — the front is another Cloud Run
 * service on its own origin (ADR 0004) — and a browser front without it is unusable, so its
 * absence fails the boot, like any other required variable.
 */
function readWebOrigin(
  source: NodeJS.ProcessEnv,
  nodeEnv: NodeEnvironment,
  problems: string[],
): string {
  const configured = optional(source, 'WEB_ORIGIN');
  if (configured === undefined && nodeEnv === 'production') {
    problems.push('WEB_ORIGIN is required in production and is not set');
  }

  const webOrigin = configured ?? DEFAULT_WEB_ORIGIN;
  if (!isHttpOrigin(webOrigin)) {
    problems.push(`WEB_ORIGIN is "${webOrigin}" — expected an http:// or https:// origin`);
  }

  return webOrigin;
}

function readShelfScanner(
  source: NodeJS.ProcessEnv,
  problems: string[],
): ShelfScannerConfiguration {
  const raw = source.SHELF_SCANNER_PROVIDER ?? 'stub';
  if (!isShelfScannerProvider(raw)) {
    problems.push(
      `SHELF_SCANNER_PROVIDER is "${raw}" — expected one of ${SHELF_SCANNER_PROVIDERS.join(', ')}`,
    );
    // The fallback never escapes: a non-empty `problems` throws before the caller returns.
    return { provider: 'stub' };
  }

  if (raw === 'stub') {
    return { provider: 'stub' };
  }

  const variable = PROVIDER_KEY_VARIABLES[raw];
  const apiKey = source[variable];
  if (!isPresent(apiKey)) {
    problems.push(`${variable} is required and is not set (SHELF_SCANNER_PROVIDER=${raw})`);
    return { provider: 'stub' };
  }

  return { provider: raw, apiKey };
}

function isShelfScannerProvider(value: string): value is ShelfScannerProvider {
  return SHELF_SCANNER_PROVIDERS.some((candidate) => candidate === value);
}

function required(source: NodeJS.ProcessEnv, name: string, problems: string[]): string {
  const value = source[name];
  if (isPresent(value)) {
    return value;
  }

  problems.push(`${name} is required and is not set`);
  return '';
}

/** An optional variable: absent and blank both read as `undefined`, never as `''`. */
function optional(source: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = source[name];

  return isPresent(value) ? value.trim() : undefined;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
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

/**
 * CORS compares the `Origin` header byte for byte: `localhost:4200` without a scheme would
 * never match, and the frontend would get opaque CORS errors instead of a failed boot.
 */
function isHttpOrigin(value: string): boolean {
  const parsed = URL.parse(value);

  return parsed !== null && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return NODE_ENVIRONMENTS.some((candidate) => candidate === value);
}

/** Injection token for the validated configuration. */
export const ENVIRONMENT = 'Environment';
