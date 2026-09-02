import { describe, expect, it } from 'vitest';

import { fuzzyEquals, normalizeText, similarity } from './text-match.js';

describe('normalizeText', () => {
  it('lowercases', () => {
    expect(normalizeText('Le Rouge et le Noir')).toBe('le rouge et le noir');
  });

  it('strips diacritics', () => {
    expect(normalizeText('À la recherche du temps perdu')).toBe('a la recherche du temps perdu');
    expect(normalizeText('Émile Zola')).toBe('emile zola');
  });

  it('folds punctuation and separators to single spaces', () => {
    expect(normalizeText('Voyage au bout de la nuit.')).toBe('voyage au bout de la nuit');
    expect(normalizeText('Saint-Exupéry')).toBe('saint exupery');
    expect(normalizeText('Fleurs du   mal')).toBe('fleurs du mal');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeText('  Proust  ')).toBe('proust');
  });

  it('keeps digits', () => {
    expect(normalizeText('1984')).toBe('1984');
  });

  it('returns an empty string for input with no alphanumerics', () => {
    expect(normalizeText('—  … !')).toBe('');
  });
});

describe('similarity', () => {
  it('is 1 for strings equal once normalized', () => {
    expect(similarity('Céline', 'celine')).toBe(1);
  });

  it('is 1 for two empty strings', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('is 0 when one side is empty and the other is not', () => {
    expect(similarity('', 'Zola')).toBe(0);
  });

  it('tolerates a single-character typo', () => {
    // "Céline" vs "Célnie": one transposition read as two edits over six characters.
    expect(similarity('Céline', 'Célnie')).toBeGreaterThan(0.6);
  });

  it('is low for unrelated strings', () => {
    expect(similarity('Zola', 'Proust')).toBeLessThan(0.4);
  });

  it('is symmetric', () => {
    expect(similarity('Flaubert', 'Flauber')).toBe(similarity('Flauber', 'Flaubert'));
  });
});

describe('fuzzyEquals', () => {
  it('accepts an exact match after normalization', () => {
    expect(fuzzyEquals('Marcel PROUST', 'marcel proust')).toBe(true);
  });

  it('accepts an OCR-level typo', () => {
    expect(fuzzyEquals('Le Rouge et le Noir', 'Le Rouge et le Noire')).toBe(true);
  });

  it('rejects a different title', () => {
    expect(fuzzyEquals('La Peste', 'La Chute')).toBe(false);
  });

  it('honours a caller-supplied threshold', () => {
    // A stricter threshold turns a borderline match into a rejection.
    expect(fuzzyEquals('Flaubert', 'Flauber', 1)).toBe(false);
    expect(fuzzyEquals('Flaubert', 'Flaubert', 1)).toBe(true);
  });
});
