import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type { BookRef } from './scoring.js';

/**
 * The human-verified ground truth of the reference set (#10).
 *
 * It lives in YAML, committed as text next to the bench protocol — no image ever is. Each
 * photo names the books actually on the shelf, so recall and precision can be measured. The
 * schema is strict on purpose: a silently dropped field would corrupt the very numbers that
 * pick a provider, so a malformed truth fails loudly instead.
 *
 * ADR 0005 and the issue insist this truth be checked by a human. A VLM draft used to arbitrate
 * two VLMs measures their agreement, not their accuracy — the draft saves typing, not judgement.
 */
const bookSchema = z.object({
  // Empty is allowed: a spine may carry no author (ADR 0005, 2026-09-04 amendment). The
  // annotator leaves the field blank, and the scorer grades such a book on its title alone.
  author: z.string().trim(),
  title: z.string().trim().min(1),
});

const photoSchema = z.object({
  file: z.string().trim().min(1),
  // A free-text note on the shelf, written by the human annotator. Documentation only — it is
  // kept when present but never scored, so it stays optional (#10).
  description: z.string().trim().min(1).optional(),
  books: z.array(bookSchema),
});

const groundTruthSchema = z.object({
  version: z.literal(1),
  photos: z.array(photoSchema),
});

export type GroundTruth = z.infer<typeof groundTruthSchema>;
export type GroundTruthPhoto = z.infer<typeof photoSchema>;

/** Parses and validates ground-truth YAML. Throws on anything off-schema. */
export function parseGroundTruth(yaml: string): GroundTruth {
  return groundTruthSchema.parse(parseYaml(yaml));
}

/**
 * The books listed for one photo, or `undefined` when the photo is absent from the truth —
 * told apart from a shelf truly listed as empty, which returns `[]`.
 */
export function booksFor(truth: GroundTruth, file: string): readonly BookRef[] | undefined {
  return truth.photos.find((photo) => photo.file === file)?.books;
}
