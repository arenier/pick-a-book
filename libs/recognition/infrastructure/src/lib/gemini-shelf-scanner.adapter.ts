import { ShelfScanFailed } from '@pick-a-book/recognition-domain';
import type { DetectedBook, ShelfPhoto, ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { z } from 'zod';

import { SHELF_SCAN_JSON_SCHEMA, SHELF_SCAN_PROMPT } from './shelf-scan-prompt.js';
import { toDetectedBooks } from './shelf-scan-response.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.6-flash';

export interface GeminiConfiguration {
  readonly apiKey: string;
  /** Overridable so the bench can pin a model without a code change (issue #10). */
  readonly model?: string;
  readonly baseUrl?: string;
}

/**
 * The slice of Gemini's envelope this adapter depends on.
 *
 * Deliberately narrow: everything else the API returns (safety ratings, token counts,
 * finish reasons) is not part of what makes an answer usable, and depending on it would
 * turn a harmless API addition into a breakage.
 */
const geminiEnvelopeSchema = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })) }) }))
    .nonempty(),
});

/**
 * Reads a shelf photo with Gemini (ADR 0005, option B).
 *
 * One of the two adapters the V1 puts head to head on real photos before settling on a
 * default. Gemini's draw is native schema-constrained decoding: the model is told the shape
 * of the answer, not merely asked for it.
 *
 * `fetch` is injected rather than reached for globally — that is what lets the tests replay
 * recorded answers with no network, no key and no bill (ADR 0005).
 */
export class GeminiShelfScannerAdapter implements ShelfScannerPort {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configuration: GeminiConfiguration,
    private readonly transport: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.model = configuration.model ?? DEFAULT_MODEL;
    this.baseUrl = configuration.baseUrl ?? DEFAULT_BASE_URL;
  }

  async scan(photo: ShelfPhoto): Promise<DetectedBook[]> {
    const response = await this.post(photo);
    const envelope = geminiEnvelopeSchema.safeParse(await readJson(response));
    if (!envelope.success) {
      throw new ShelfScanFailed(
        `Gemini returned an unusable envelope (${envelope.error.message})`,
        {
          cause: envelope.error,
        },
      );
    }

    // A candidate's answer can be split across several parts; joining them is the documented
    // way to recover the whole text.
    const text = envelope.data.candidates[0].content.parts.map((part) => part.text).join('');

    return toDetectedBooks(text);
  }

  private async post(photo: ShelfPhoto): Promise<Response> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const body = {
      contents: [
        {
          parts: [
            { text: SHELF_SCAN_PROMPT },
            {
              inline_data: {
                mime_type: photo.mediaType,
                data: Buffer.from(photo.bytes).toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: SHELF_SCAN_JSON_SCHEMA,
        // The reading is meant to be reproducible: same photo, same answer, as far as the
        // provider allows. The bench compares models, not sampling luck.
        temperature: 0,
      },
    };

    let response: Response;
    try {
      response = await this.transport(url, {
        method: 'POST',
        // The key travels in a header, not in the query string: a URL ends up in access logs
        // and in error messages.
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.configuration.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new ShelfScanFailed(`Gemini is unreachable (${describe(cause)})`, { cause });
    }

    if (!response.ok) {
      throw new ShelfScanFailed(`Gemini answered ${response.status} (${await readText(response)})`);
    }

    return response;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ShelfScanFailed(`Gemini did not answer JSON (${describe(cause)})`, { cause });
  }
}

/** Best effort: the body is only used to make the failure message legible. */
async function readText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return 'body unavailable';
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
