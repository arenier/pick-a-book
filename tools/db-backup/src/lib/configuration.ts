/**
 * The job's configuration, validated before anything runs: a missing or odd value fails the
 * execution at once, with the full list of what is wrong — and the failed execution is what
 * the freshness alert sees.
 */
export interface Configuration {
  /** Direct (unpooled) Postgres URL: pg_dump does not go through PgBouncer's transaction mode. */
  readonly databaseUrl: string;
  readonly bucketName: string;
  /** How many snapshots stay after a successful run (ADR 0006, issue #22). */
  readonly generations: number;
  /** Local runs and specs only: where the GCS emulator listens. */
  readonly bucketEmulatorHost: string | undefined;
}

export class InvalidConfiguration extends Error {
  constructor(problems: readonly string[]) {
    super(
      ['Invalid configuration, backup aborted:', ...problems.map((p) => `  - ${p}`)].join('\n'),
    );
    this.name = 'InvalidConfiguration';
  }
}

export function loadConfiguration(
  source: Readonly<Record<string, string | undefined>>,
): Configuration {
  const problems: string[] = [];

  const databaseUrl = required(source, 'DATABASE_URL', problems);
  // Checked by parsing, and reported without the value: the URL carries the password, and
  // this message ends up in the logs.
  if (databaseUrl !== '' && !isPostgresUrl(databaseUrl)) {
    problems.push(
      'DATABASE_URL is not a Postgres connection string — expected postgres:// or postgresql://',
    );
  }

  const bucketName = required(source, 'BACKUP_BUCKET', problems);

  const rawGenerations = required(source, 'BACKUP_GENERATIONS', problems);
  const generations = Number(rawGenerations);
  if (rawGenerations !== '' && (!Number.isInteger(generations) || generations < 1)) {
    problems.push(
      `BACKUP_GENERATIONS is "${rawGenerations}" — expected a whole number of at least 1`,
    );
  }

  if (problems.length > 0) {
    throw new InvalidConfiguration(problems);
  }

  return {
    databaseUrl,
    bucketName,
    generations,
    bucketEmulatorHost: optional(source, 'BUCKET_EMULATOR_HOST'),
  };
}

function required(
  source: Readonly<Record<string, string | undefined>>,
  name: string,
  problems: string[],
): string {
  const value = optional(source, name);
  if (value !== undefined) {
    return value;
  }

  problems.push(`${name} is required and is not set`);
  return '';
}

function optional(
  source: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const value = source[name]?.trim();

  return value === undefined || value === '' ? undefined : value;
}

function isPostgresUrl(value: string): boolean {
  const parsed = URL.parse(value);

  return parsed !== null && (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:');
}
