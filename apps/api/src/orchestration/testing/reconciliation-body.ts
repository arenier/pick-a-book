import type { ShelfReconciliationDto } from '@pick-a-book/bibliography-application';

/**
 * The body of a reconciliation answer, proven rather than asserted: the convention forbids `as`,
 * and a spec that reads `books` should know they are there. Excluded from the app build
 * (`tsconfig.app.json`).
 */
export async function reconciliationOf(response: Response): Promise<ShelfReconciliationDto> {
  const body: unknown = await response.json();
  if (!isShelfReconciliation(body)) {
    throw new Error(`not a reconciliation: ${JSON.stringify(body)}`);
  }

  return body;
}

function isShelfReconciliation(value: unknown): value is ShelfReconciliationDto {
  return (
    typeof value === 'object' &&
    value !== null &&
    'books' in value &&
    Array.isArray(value.books) &&
    value.books.every(isBook)
  );
}

function isBook(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'position' in value &&
    typeof value.position === 'number' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'read' in value &&
    typeof value.read === 'object' &&
    value.read !== null &&
    'title' in value.read &&
    typeof value.read.title === 'string'
  );
}
