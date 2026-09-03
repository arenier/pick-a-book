/**
 * The instruction both adapters send with the photo.
 *
 * Shared on purpose: the bench compares two providers, and a prompt that differed between
 * them would measure the prompts as much as the models (issue #10).
 *
 * Every clause answers a failure mode ADR 0005 names: inventing a plausible title for a
 * partly readable spine, promoting the publisher or the collection to author or title, and
 * padding the list to look thorough.
 */
export const SHELF_SCAN_PROMPT = [
  'You are cataloguing every book on a shelf, photographed with a phone. A shelf like this holds',
  '50 to 100 books; a short list means you stopped too early.',
  '',
  'Scan the whole image systematically, band by band, left to right and top to bottom, and return',
  'one entry per book. For each one:',
  '- "author": the author name printed on the spine.',
  '- "title": the title printed on the spine.',
  '- "confidence": your own certainty for that entry, between 0 and 1.',
  '',
  'Rules:',
  '- Be exhaustive: do not stop until you have swept the entire shelf. Leaving a readable book out',
  '  is the main mistake to avoid.',
  '- Never invent. Report only what is printed; for a partly legible spine, give your best reading',
  '  with a low confidence rather than a work you merely expect.',
  '- Every entry needs BOTH an author and a title. If you can read only one of the two, skip the',
  '  spine — never emit an empty "author" or "title".',
  '- Report each book once. Do not repeat an entry.',
  '- Do not confuse the author or the title with the publisher or the collection',
  '  (Gallimard, Folio, Points, Le Livre de Poche and the like are never the author).',
  '- Spines may be rotated or upside down; read them anyway. A spine you truly cannot read is',
  '  skipped, and an empty list is a valid answer.',
  '',
  'Answer with JSON only, of the form {"books": [{"author": "", "title": "", "confidence": 0}]}.',
].join('\n');

/**
 * The same contract expressed as a JSON schema, for providers that constrain decoding to
 * one. Kept beside the prompt so the two cannot drift apart.
 */
export const SHELF_SCAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          author: { type: 'string' },
          title: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['author', 'title', 'confidence'],
      },
    },
  },
  required: ['books'],
} as const;
