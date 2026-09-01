import { ShelfScanFailed } from '@pick-a-book/recognition-domain';
import type { DetectedBook, ShelfPhoto, ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { z } from 'zod';

import { SHELF_SCAN_PROMPT } from './shelf-scan-prompt.js';
import { toDetectedBooks } from './shelf-scan-response.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'qwen/qwen3-vl-235b-a22b-instruct';

export interface QwenConfiguration {
  readonly apiKey: string;
  /** The exact catalogue reference is picked at bench time — it moves too fast to freeze. */
  readonly model?: string;
  /**
   * Any OpenAI-compatible endpoint. Pointing this at a local Ollama is how the prompt gets
   * iterated on for free; the numbers of the decision still come from the hosted model, which
   * is a different weight class from a quantised local one (issue #10).
   */
  readonly baseUrl?: string;
}

/** The slice of the chat-completions envelope this adapter depends on, and nothing more. */
const chatEnvelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).nonempty(),
});

/**
 * Reads a shelf photo with Qwen3-VL through an OpenAI-compatible endpoint (ADR 0005).
 *
 * The second of the two adapters the V1 benches. OpenRouter rather than DashScope: the
 * latter wants an Alibaba Cloud account with identity verification even on its free tier —
 * a relationship with a new cloud provider to save a few cents a month (issue #10).
 *
 * Being an OpenAI-compatible client is the point, not an implementation detail: the same
 * class serves OpenRouter and a local Ollama, so trying another host is configuration.
 */
export class QwenShelfScannerAdapter implements ShelfScannerPort {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configuration: QwenConfiguration,
    private readonly transport: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.model = configuration.model ?? DEFAULT_MODEL;
    this.baseUrl = configuration.baseUrl ?? DEFAULT_BASE_URL;
  }

  async scan(photo: ShelfPhoto): Promise<DetectedBook[]> {
    const response = await this.post(photo);
    const envelope = chatEnvelopeSchema.safeParse(await readJson(response));
    if (!envelope.success) {
      throw new ShelfScanFailed(`Qwen returned an unusable envelope (${envelope.error.message})`, {
        cause: envelope.error,
      });
    }

    return toDetectedBooks(envelope.data.choices[0].message.content);
  }

  private async post(photo: ShelfPhoto): Promise<Response> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SHELF_SCAN_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:${photo.mediaType};base64,${Buffer.from(photo.bytes).toString('base64')}`,
              },
            },
          ],
        },
      ],
      // `json_object` is the OpenAI-compatible way to ask for JSON. Weaker than Gemini's
      // schema-constrained decoding, which is exactly why the answer is validated downstream
      // rather than trusted.
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    let response: Response;
    try {
      response = await this.transport(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.configuration.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new ShelfScanFailed(`Qwen is unreachable (${describe(cause)})`, { cause });
    }

    if (!response.ok) {
      throw new ShelfScanFailed(`Qwen answered ${response.status} (${await readText(response)})`);
    }

    return response;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ShelfScanFailed(`Qwen did not answer JSON (${describe(cause)})`, { cause });
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
