import { describe, expect, it } from 'vitest';

import { aggregate, scorePhoto } from './scoring.js';
import type { BookRef, DetectionRecord } from './scoring.js';

const HIGH = 0.8;

function det(author: string, title: string, confidence: number): DetectionRecord {
  return { author, title, confidence };
}

function ref(author: string, title: string): BookRef {
  return { author, title };
}

describe('scorePhoto — a correct read', () => {
  it('counts a perfect read as all true positives', () => {
    const truth = [ref('Albert Camus', 'La Peste'), ref('Marcel Proust', 'Du côté de chez Swann')];
    const detected = [
      det('Albert Camus', 'La Peste', 0.9),
      det('Marcel Proust', 'Du côté de chez Swann', 0.95),
    ];

    expect(scorePhoto(detected, truth, HIGH)).toStrictEqual({
      truthCount: 2,
      detectedCount: 2,
      truePositives: 2,
      falsePositives: 0,
      falseNegatives: 0,
      correspondences: 2,
      authorGradable: 2,
      authorCorrect: 2,
      titleCorrect: 2,
      swapped: 0,
      highConfidenceHallucinations: 0,
    });
  });

  it('forgives OCR-level typos when matching a pair', () => {
    const truth = [ref('Céline', 'Voyage au bout de la nuit')];
    const detected = [det('Celine', 'Voyage au bout de la nuit.', 0.7)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.truePositives).toBe(1);
    expect(score.falsePositives).toBe(0);
    expect(score.falseNegatives).toBe(0);
  });
});

describe('scorePhoto — misses', () => {
  it('treats an undetected book as a false negative, not an error', () => {
    const truth = [ref('Albert Camus', 'La Peste'), ref('Franz Kafka', 'Le Procès')];
    const detected = [det('Albert Camus', 'La Peste', 0.9)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.truePositives).toBe(1);
    expect(score.falseNegatives).toBe(1);
    expect(score.falsePositives).toBe(0);
  });

  it('reads an empty detection of an empty shelf as nothing wrong', () => {
    const score = scorePhoto([], [], HIGH);

    expect(score.truePositives).toBe(0);
    expect(score.falsePositives).toBe(0);
    expect(score.falseNegatives).toBe(0);
  });
});

describe('scorePhoto — hallucination', () => {
  it('counts an invented book as a false positive', () => {
    const truth = [ref('Albert Camus', 'La Peste')];
    const detected = [
      det('Albert Camus', 'La Peste', 0.9),
      det('Jean Ficelle', 'Le Grand Néant', 0.6),
    ];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.truePositives).toBe(1);
    expect(score.falsePositives).toBe(1);
  });

  it('flags a high-confidence invention specifically', () => {
    const truth = [ref('Albert Camus', 'La Peste')];
    // One invention sure of itself, one hedged: only the confident one is the watched failure.
    const detected = [
      det('Jean Ficelle', 'Le Grand Néant', 0.95),
      det('Paul Brume', 'Ombres', 0.2),
    ];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.falsePositives).toBe(2);
    expect(score.highConfidenceHallucinations).toBe(1);
  });
});

describe('scorePhoto — structuring', () => {
  it('detects an author/title swap as a structuring error rather than a match', () => {
    const truth = [ref('Albert Camus', 'La Peste')];
    const detected = [det('La Peste', 'Albert Camus', 0.9)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.truePositives).toBe(0);
    expect(score.swapped).toBe(1);
    expect(score.correspondences).toBe(1);
  });

  it('credits the correct field when only one is right', () => {
    const truth = [ref('Albert Camus', 'La Peste')];
    const detected = [det('Albert Camus', 'La Chute', 0.9)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.truePositives).toBe(0);
    expect(score.authorCorrect).toBe(1);
    expect(score.titleCorrect).toBe(0);
    expect(score.correspondences).toBe(1);
  });
});

describe('scorePhoto — deduplication', () => {
  it('collapses repeated detections of the same book before scoring', () => {
    const truth = [ref('Albert Camus', 'La Peste')];
    // The exhaustive prompt makes the model list a spine twice, in an OCR variant.
    const detected = [det('Albert Camus', 'La Peste', 0.9), det('albert camus', 'La Peste.', 0.6)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.detectedCount).toBe(1);
    expect(score.truePositives).toBe(1);
    expect(score.falsePositives).toBe(0);
  });

  it('keeps genuinely distinct books by the same author', () => {
    const truth = [ref('Albert Camus', 'La Peste'), ref('Albert Camus', 'La Chute')];
    const detected = [det('Albert Camus', 'La Peste', 0.9), det('Albert Camus', 'La Chute', 0.9)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.detectedCount).toBe(2);
    expect(score.truePositives).toBe(2);
  });
});

describe('scorePhoto — a title-only truth (author not on the spine)', () => {
  it('counts a title match as a true positive, whatever the read author', () => {
    // ADR 0005 (2026-09-04): the spine carries no author, so the book is graded on its title.
    const truth = [ref('', 'La Peste')];
    const detected = [det('Albert Camus', 'La Peste', 0.9)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.truePositives).toBe(1);
    expect(score.titleCorrect).toBe(1);
    expect(score.falsePositives).toBe(0);
    expect(score.falseNegatives).toBe(0);
  });

  it('leaves an author-less book out of the author-accuracy denominator', () => {
    const truth = [ref('', 'La Peste')];
    const detected = [det('Albert Camus', 'La Peste', 0.9)];

    const score = scorePhoto(detected, truth, HIGH);

    expect(score.authorGradable).toBe(0);
    expect(score.authorCorrect).toBe(0);
  });
});

describe('aggregate', () => {
  it('micro-averages counts and derives the rates from the totals', () => {
    const first = scorePhoto(
      [det('Albert Camus', 'La Peste', 0.9)],
      [ref('Albert Camus', 'La Peste'), ref('Franz Kafka', 'Le Procès')],
      HIGH,
    );
    const second = scorePhoto(
      [det('Franz Kafka', 'Le Procès', 0.9), det('Jean Ficelle', 'Le Néant', 0.95)],
      [ref('Franz Kafka', 'Le Procès')],
      HIGH,
    );

    const totals = aggregate([first, second]);

    expect(totals.truthCount).toBe(3);
    expect(totals.detectedCount).toBe(3);
    expect(totals.truePositives).toBe(2);
    expect(totals.recall).toBeCloseTo(2 / 3, 5);
    expect(totals.precision).toBeCloseTo(2 / 3, 5);
    expect(totals.highConfidenceHallucinations).toBe(1);
  });

  it('reports zero rates rather than dividing by zero on an empty run', () => {
    const totals = aggregate([]);

    expect(totals.recall).toBe(0);
    expect(totals.precision).toBe(0);
    expect(totals.authorAccuracy).toBe(0);
    expect(totals.titleAccuracy).toBe(0);
  });
});

describe('aggregate — author accuracy', () => {
  it('derives author accuracy from gradable books only, not title-only ones', () => {
    const withAuthor = scorePhoto(
      [det('Albert Camus', 'La Peste', 0.9)],
      [ref('Albert Camus', 'La Peste')],
      HIGH,
    );
    const titleOnly = scorePhoto(
      [det('Someone', 'Les Choses', 0.9)],
      [ref('', 'Les Choses')],
      HIGH,
    );

    const totals = aggregate([withAuthor, titleOnly]);

    // Two correspondences, but only one book had an author to grade.
    expect(totals.correspondences).toBe(2);
    expect(totals.authorGradable).toBe(1);
    expect(totals.authorAccuracy).toBe(1);
    expect(totals.titleAccuracy).toBe(1);
  });
});
