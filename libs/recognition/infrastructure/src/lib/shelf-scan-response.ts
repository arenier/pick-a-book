import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  ShelfScanFailed,
} from '@pick-a-book/recognition-domain';
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
 * Turns a raw provider answer into domain objects, or fails.
 *
 * There is no third outcome: a payload that cannot be fully proven raises `ShelfScanFailed`
 * rather than yielding a partial list. Dropping the offending entry and keeping the rest
 * would hand the domain a silently truncated shelf, which is the failure mode ADR 0005 is
 * least able to detect downstream.
 */
export function toDetectedBooks(raw: string): DetectedBook[] {
  const parsed = shelfScanResponseSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new ShelfScanFailed(`the provider answered off-contract (${parsed.error.message})`, {
      cause: parsed.error,
    });
  }

  // The value objects validate a second time, on their own terms — an author the schema
  // accepts as a string may still be empty once trimmed. Their errors belong to the domain,
  // so they are wrapped: a caller of the port catches `ShelfScanFailed`, nothing else.
  try {
    return parsed.data.books.map((book) =>
      DetectedBook.of(
        toAuthor(book.author),
        BookTitle.of(book.title),
        Confidence.of(book.confidence),
      ),
    );
  } catch (cause) {
    throw new ShelfScanFailed(
      `the provider answered a value the domain refuses (${describe(cause)})`,
      {
        cause,
      },
    );
  }
}

/**
 * An author only when the spine actually carried one. Absent or blank collapses to `undefined`
 * — a title-only reading, not a failure (ADR 0005, 2026-09-04 amendment). `Author.of` still
 * guards length once a real name is there.
 */
function toAuthor(raw: string | null | undefined): Author | undefined {
  return raw !== null && raw !== undefined && raw.trim().length > 0 ? Author.of(raw) : undefined;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(stripCodeFence(raw));
  } catch (cause) {
    throw new ShelfScanFailed(`the provider did not answer JSON (${describe(cause)})`, { cause });
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
