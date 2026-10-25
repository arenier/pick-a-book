import { readFileSync } from 'node:fs';

/**
 * The recorded answers of the BnF (`fixtures/README.md` says where each one comes from). Read
 * by the specs only, and left out of the build with the other `testing` helpers.
 */
export function fixture(name: string): string {
  return readFileSync(new URL(`fixtures/${name}.xml`, import.meta.url), 'utf8');
}
