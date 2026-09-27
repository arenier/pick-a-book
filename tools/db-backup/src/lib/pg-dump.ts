import { stat } from 'node:fs/promises';

import { ToolFailed, runTool } from './run-tool.js';

/**
 * A dump that did not happen or cannot be trusted. Its message is built from the tools' own
 * diagnostics only — never from the command line, which carries the database URL and its
 * password.
 */
export class DumpFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DumpFailed';
  }
}

/**
 * `pg_dump --format=custom`: compressed, and restorable table by table with pg_restore.
 * pg_dump must be of the server's major version or newer — the image pins both (ADR 0006).
 *
 * The URL goes through `--dbname`: libpq expands a connection string there, and the job's
 * container runs this single process, so the argument is not visible to anyone else.
 */
export async function dumpDatabase(databaseUrl: string, file: string): Promise<void> {
  try {
    await runTool('pg_dump', [
      '--format=custom',
      '--no-password',
      `--file=${file}`,
      `--dbname=${databaseUrl}`,
    ]);
  } catch (error) {
    throw new DumpFailed(`pg_dump failed: ${diagnostics(error, databaseUrl)}`);
  }
}

export interface DumpSummary {
  /** Tables whose data the archive holds. */
  readonly tables: number;
}

/**
 * Proves the archive before it counts as a backup: pg_restore must read its table of
 * contents, and that table of contents must hold data for at least one table. An empty or
 * truncated file, or the dump of an empty database, is refused.
 */
export async function verifyDump(file: string): Promise<DumpSummary> {
  const { size } = await stat(file);
  if (size === 0) {
    throw new DumpFailed('the dump is empty');
  }

  let toc: string;
  try {
    toc = await runTool('pg_restore', ['--list', file]);
  } catch (error) {
    throw new DumpFailed(`pg_restore cannot read the dump: ${diagnostics(error)}`);
  }

  const tables = toc.split('\n').filter((line) => line.includes(' TABLE DATA ')).length;
  if (tables === 0) {
    throw new DumpFailed('the dump holds no table data — no table to back up');
  }

  return { tables };
}

/** The tool's stderr, with the password of the URL masked should it ever appear there. */
function diagnostics(error: unknown, databaseUrl?: string): string {
  if (!(error instanceof ToolFailed)) {
    return error instanceof Error ? error.message : 'unknown error';
  }

  const message = error.stderr === '' ? 'no diagnostic on stderr' : error.stderr;
  const password = databaseUrl === undefined ? '' : (URL.parse(databaseUrl)?.password ?? '');

  return password === ''
    ? message
    : message.replaceAll(password, '***').replaceAll(decodeURIComponent(password), '***');
}
