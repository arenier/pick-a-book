import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  ShelfScanFailed,
  type InvalidValue,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';
import { z } from 'zod';

/**
 * The JSON contract both VLM adapters ask their provider for, and the only shape either is
 * allowed to hand back to the domain.
 *
 * Validated with a schema rather than trusted: a model answers in prose whenever it feels
 * like it, and the convention forbids asserting a type with `as` (CLAUDE.md). Every field is
 * proven here, or the whole answer is refused.
 *
 * `author` is optional (ADR 0005, 2026-09-04 amendment): a spine may not print one, and the
 * prompt asks the model to omit it rather than invent it. Absent or blank both mean "no
 * author"; the title still identifies the book and is always required.
 *
 * `confidence` is bounded in [0, 1] at this level too, even though `Confidence` checks it
 * again: the schema says what the provider promised, the value object says what the domain
 * accepts. Both failing on the same value is fine; only one of them failing would be a bug.
 */
const shelfScanResponseSchema = z.object({
  books: z.array(
    z.object({
      author: z.string().nullish(),
      title: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

/**
 * Turns a raw provider answer into domain objects, or says why it cannot.
 *
 * There is no third outcome: a payload that cannot be fully proven is a `ShelfScanFailed`
 * rather than a partial list. Dropping the offending entry and keeping the rest would hand
 * the domain a silently truncated shelf, which is the failure mode ADR 0005 is least able to
 * detect downstream.
 */
export function toDetectedBooks(raw: string): Result<DetectedBook[], ShelfScanFailed> {
  const json = parseJson(raw);
  if (!json.ok) {
    return json;
  }

  const parsed = shelfScanResponseSchema.safeParse(json.value);
  if (!parsed.success) {
    return err(
      new ShelfScanFailed(`the provider answered off-contract (${parsed.error.message})`, {
        cause: parsed.error,
      }),
    );
  }

  // The value objects validate a second time, on their own terms — an author the schema
  // accepts as a string may still be empty once trimmed. Their failures belong to the domain,
  // so they are wrapped: a caller of the port hears `ShelfScanFailed`, nothing else.
  const books: DetectedBook[] = [];
  for (const entry of parsed.data.books) {
    const book = toDetectedBook(entry);
    if (!book.ok) {
      return book;
    }
    books.push(book.value);
  }

  return ok(books);
}

function toDetectedBook(entry: {
  readonly author?: string | null | undefined;
  readonly title: string;
  readonly confidence: number;
}): Result<DetectedBook, ShelfScanFailed> {
  const author = toAuthor(entry.author);
  const title = BookTitle.of(entry.title);
  const confidence = Confidence.of(entry.confidence);

  if (author?.ok === false) {
    return err(refused(author.error));
  }
  if (!title.ok) {
    return err(refused(title.error));
  }
  if (!confidence.ok) {
    return err(refused(confidence.error));
  }

  return ok(DetectedBook.of(author?.value, title.value, confidence.value));
}

function refused(cause: InvalidValue): ShelfScanFailed {
  return new ShelfScanFailed(
    `the provider answered a value the domain refuses (${cause.message})`,
    {
      cause,
    },
  );
}

/**
 * An author only when the spine actually carried one. Absent or blank collapses to
 * `undefined` — a title-only reading, not a failure (ADR 0005, 2026-09-04 amendment).
 * `Author.of` still guards length once a real name is there.
 */
function toAuthor(raw: string | null | undefined): Result<Author, InvalidValue> | undefined {
  return raw !== null && raw !== undefined && raw.trim().length > 0 ? Author.of(raw) : undefined;
}

function parseJson(raw: string): Result<unknown, ShelfScanFailed> {
  try {
    return ok(JSON.parse(stripCodeFence(raw)));
  } catch (cause) {
    return err(
      new ShelfScanFailed(`the provider did not answer JSON (${describe(cause)})`, { cause }),
    );
  }
}

/**
 * Providers wrap JSON in a markdown fence often enough that refusing it would cost real
 * scans. Unwrapping is safe: what the fence contains is still parsed and validated in full,
 * so nothing is assumed about the payload — only about its packaging.
 */
function stripCodeFence(raw: string): string {
  const fenced = /^\s*```(?:json)?\s*\n(?<payload>[\s\S]*?)\n?\s*```\s*$/u.exec(raw);

  return fenced?.groups?.['payload'] ?? raw;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
