import { fuzzyEquals, normalizeText, similarity } from '@pick-a-book/shared-text-match';

/**
 * Scoring of a shelf reading against a human-verified ground truth (#10).
 *
 * The unit under measure is the couple `(author, title)`: a detection counts as correct only
 * when both fields match the same real book, allowing for OCR-level noise (`shared-text-match`).
 * This is where recall, precision, per-field accuracy, structuring errors and high-confidence
 * hallucination come from — the metrics ADR 0005 wants in hand before a provider is chosen.
 *
 * Pure and free of any provider: it scores records, so the same code scores Gemini and Qwen,
 * and it runs in CI with no network and no key.
 */

/** One book read off a photo, as the adapter returned it — plain fields, no domain object. */
export interface DetectionRecord {
  readonly author: string;
  readonly title: string;
  readonly confidence: number;
}

/** One book actually on the shelf, from the ground truth. */
export interface BookRef {
  readonly author: string;
  readonly title: string;
}

/** Raw counts for a single photo. Rates are derived only once, on the aggregate. */
export interface PhotoScore {
  readonly truthCount: number;
  readonly detectedCount: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /** Detections paired with a real book, right or wrong — the denominator of field accuracy. */
  readonly correspondences: number;
  readonly authorCorrect: number;
  readonly titleCorrect: number;
  readonly swapped: number;
  readonly highConfidenceHallucinations: number;
}

export interface AggregateScore extends PhotoScore {
  readonly recall: number;
  readonly precision: number;
  readonly authorAccuracy: number;
  readonly titleAccuracy: number;
}

/**
 * A detection and the truth book it most plausibly refers to.
 *
 * Establishing this correspondence — before judging whether the read is correct — is what
 * lets a half-right detection credit the field it got right, and lets a swap be told apart
 * from a plain miss.
 */
interface Correspondence {
  readonly detection: DetectionRecord;
  readonly truth: BookRef;
}

/** How close a detection sits to a truth book, ignoring which field is which. */
function affinity(detection: DetectionRecord, truth: BookRef): number {
  const aligned =
    similarity(detection.author, truth.author) + similarity(detection.title, truth.title);
  // A swap still refers to the same book; count its best reading so it corresponds rather
  // than being mistaken for a hallucination.
  const swapped =
    similarity(detection.author, truth.title) + similarity(detection.title, truth.author);

  return Math.max(aligned, swapped);
}

/**
 * Greedily pairs detections to truth books by descending affinity, one to one. Greedy rather
 * than optimal: on a real shelf the strong pairs are unambiguous, and the cost of an exact
 * assignment is not worth it for a measurement tool.
 */
function correspond(
  detected: readonly DetectionRecord[],
  truth: readonly BookRef[],
): Correspondence[] {
  const candidates: { affinity: number; detectionIndex: number; truthIndex: number }[] = [];
  detected.forEach((detection, detectionIndex) => {
    truth.forEach((book, truthIndex) => {
      candidates.push({ affinity: affinity(detection, book), detectionIndex, truthIndex });
    });
  });
  candidates.sort((left, right) => right.affinity - left.affinity);

  const usedDetections = new Set<number>();
  const usedTruth = new Set<number>();
  const pairs: Correspondence[] = [];

  for (const candidate of candidates) {
    // Below one field's worth of resemblance, this is not the same book: leave the detection
    // to stand as a hallucination and the truth book as a miss.
    if (candidate.affinity <= 0) {
      break;
    }
    if (usedDetections.has(candidate.detectionIndex) || usedTruth.has(candidate.truthIndex)) {
      continue;
    }
    usedDetections.add(candidate.detectionIndex);
    usedTruth.add(candidate.truthIndex);
    pairs.push({
      detection: detected[candidate.detectionIndex],
      truth: truth[candidate.truthIndex],
    });
  }

  return pairs;
}

export function scorePhoto(
  detected: readonly DetectionRecord[],
  truth: readonly BookRef[],
  highConfidenceThreshold: number,
): PhotoScore {
  const distinct = dedupe(detected);
  const pairs = correspond(distinct, truth);
  const fields = tallyFields(pairs);

  return {
    truthCount: truth.length,
    detectedCount: distinct.length,
    truePositives: fields.truePositives,
    falsePositives: distinct.length - fields.truePositives,
    falseNegatives: truth.length - fields.truePositives,
    correspondences: pairs.length,
    authorCorrect: fields.authorCorrect,
    titleCorrect: fields.titleCorrect,
    swapped: fields.swapped,
    highConfidenceHallucinations: countHighConfidenceHallucinations(
      distinct,
      pairs,
      highConfidenceThreshold,
    ),
  };
}

/**
 * Collapses repeated detections of the same book. The exhaustive prompt makes the model list a
 * spine twice now and then (issue #10); keyed on the normalized `(author, title)`, only the
 * highest-confidence copy survives — so a doubled read is neither double-counted nor charged as a
 * false positive. It is not a matching step: two genuinely different books stay apart.
 */
function dedupe(detected: readonly DetectionRecord[]): DetectionRecord[] {
  const byKey = new Map<string, DetectionRecord>();

  for (const detection of detected) {
    // Newline separates the fields: normalization never emits one, so "a b" + "c"
    // cannot collide with "a" + "b c".
    const key = `${normalizeText(detection.author)}\n${normalizeText(detection.title)}`;
    const kept = byKey.get(key);
    if (kept === undefined || detection.confidence > kept.confidence) {
      byKey.set(key, detection);
    }
  }

  return [...byKey.values()];
}

interface FieldTally {
  readonly truePositives: number;
  readonly authorCorrect: number;
  readonly titleCorrect: number;
  readonly swapped: number;
}

/** Judges each correspondence: right pair, right field, or an author/title swap. */
function tallyFields(pairs: readonly Correspondence[]): FieldTally {
  let truePositives = 0;
  let authorCorrect = 0;
  let titleCorrect = 0;
  let swapped = 0;

  for (const { detection, truth: book } of pairs) {
    const authorRight = fuzzyEquals(detection.author, book.author);
    const titleRight = fuzzyEquals(detection.title, book.title);

    if (authorRight) {
      authorCorrect++;
    }
    if (titleRight) {
      titleCorrect++;
    }
    if (authorRight && titleRight) {
      truePositives++;
    } else if (isSwap(detection, book)) {
      swapped++;
    }
  }

  return { truePositives, authorCorrect, titleCorrect, swapped };
}

function isSwap(detection: DetectionRecord, book: BookRef): boolean {
  return fuzzyEquals(detection.author, book.title) && fuzzyEquals(detection.title, book.author);
}

/**
 * A hallucination is a detection that matched no real book as a correct pair; the ones that did
 * so while confident are the failure ADR 0005 watches to justify option C one day.
 */
function countHighConfidenceHallucinations(
  detected: readonly DetectionRecord[],
  pairs: readonly Correspondence[],
  threshold: number,
): number {
  const correct = new Set(
    pairs.filter((pair) => isCorrectPair(pair)).map((pair) => pair.detection),
  );

  return detected.filter(
    (detection) => detection.confidence >= threshold && !correct.has(detection),
  ).length;
}

function isCorrectPair(pair: Correspondence): boolean {
  return (
    fuzzyEquals(pair.detection.author, pair.truth.author) &&
    fuzzyEquals(pair.detection.title, pair.truth.title)
  );
}

/** Micro-averages a set of per-photo scores: sum the counts, then derive the rates once. */
export function aggregate(scores: readonly PhotoScore[]): AggregateScore {
  const summed = scores.reduce<PhotoScore>(
    (totals, score) => ({
      truthCount: totals.truthCount + score.truthCount,
      detectedCount: totals.detectedCount + score.detectedCount,
      truePositives: totals.truePositives + score.truePositives,
      falsePositives: totals.falsePositives + score.falsePositives,
      falseNegatives: totals.falseNegatives + score.falseNegatives,
      correspondences: totals.correspondences + score.correspondences,
      authorCorrect: totals.authorCorrect + score.authorCorrect,
      titleCorrect: totals.titleCorrect + score.titleCorrect,
      swapped: totals.swapped + score.swapped,
      highConfidenceHallucinations:
        totals.highConfidenceHallucinations + score.highConfidenceHallucinations,
    }),
    EMPTY,
  );

  return {
    ...summed,
    recall: ratio(summed.truePositives, summed.truthCount),
    precision: ratio(summed.truePositives, summed.detectedCount),
    authorAccuracy: ratio(summed.authorCorrect, summed.correspondences),
    titleAccuracy: ratio(summed.titleCorrect, summed.correspondences),
  };
}

const EMPTY: PhotoScore = {
  truthCount: 0,
  detectedCount: 0,
  truePositives: 0,
  falsePositives: 0,
  falseNegatives: 0,
  correspondences: 0,
  authorCorrect: 0,
  titleCorrect: 0,
  swapped: 0,
  highConfidenceHallucinations: 0,
};

/** Zero rather than NaN when the denominator is zero — an empty run is not a failure. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
