import { describe, expect, it } from 'vitest';

import { ReadBook } from './read-book.js';

function read(title: string, author?: string): ReadBook {
  const result = ReadBook.of(title, author);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe('ReadBook title', () => {
  it('keeps what was read, with its spaces collapsed', () => {
    expect(read('  La   Peste ').title).toBe('La Peste');
  });

  it.each([
    ['La Peste (Folio)', ['La Peste']],
    ['Le Silence de la mer (Robert Laffont) (J2690)', ['Le Silence de la mer']],
    ['Percy Jackson - La Mer des Monstres', ['Percy Jackson', 'La Mer des Monstres']],
    ['La Peste : roman', ['La Peste', 'roman']],
    ['Exercices de style / Queneau', ['Exercices de style', 'Queneau']],
    ['Jean-Christophe', ['Jean-Christophe']],
    ['Les Rougon-Macquart', ['Les Rougon-Macquart']],
  ])('splits "%s" into its segments', (title, segments) => {
    expect(read(title).segments).toStrictEqual(segments);
  });

  it('keeps the title as read when nothing but a parenthesis is left', () => {
    expect(read('(Folio)').segments).toStrictEqual(['(Folio)']);
  });

  it('offers the whole title as one comparable form', () => {
    expect(read('Percy Jackson - La Mer des Monstres').forms).toStrictEqual([
      'Percy Jackson La Mer des Monstres',
    ]);
  });

  it('refuses an empty title', () => {
    expect(ReadBook.of('   ').ok).toBe(false);
  });

  it('refuses a title of more than 500 characters', () => {
    expect(ReadBook.of('a'.repeat(501)).ok).toBe(false);
    expect(ReadBook.of('a'.repeat(500)).ok).toBe(true);
  });
});

describe('ReadBook volume', () => {
  it.each([
    ['Éternels (tome 3)', 3, ['Éternels']],
    ['Éternels Tome 3', 3, ['Éternels']],
    ['Les Cités obscures T2', 2, ['Les Cités obscures']],
    ['Les Cités obscures (t. 4)', 4, ['Les Cités obscures']],
    ['Astérix 2e', 2, ['Astérix']],
    ['Astérix - 2ème tome', 2, ['Astérix']],
  ])('extracts the mention of "%s"', (title, volume, segments) => {
    const book = read(title);

    expect(book.volume).toBe(volume);
    expect(book.segments).toStrictEqual(segments);
  });

  // A bare number is ambiguous (« Harry Potter 3 », « Apollo 13 »): it is kept in the title and
  // the title without it is offered as a second form.
  it('reads a trailing bare number as a volume, and keeps it in the title', () => {
    const book = read('Harry Potter 3');

    expect(book.volume).toBe(3);
    expect(book.segments).toStrictEqual(['Harry Potter 3']);
    expect(book.forms).toStrictEqual(['Harry Potter 3', 'Harry Potter']);
  });

  it.each(['Fahrenheit 451', '17 lunes', '1984', 'La Peste'])(
    'finds no volume in "%s"',
    (title) => {
      expect(read(title).volume).toBeUndefined();
    },
  );
});

describe('ReadBook author', () => {
  it('is absent when none was read', () => {
    const book = read('La Peste');

    expect(book.author).toBeUndefined();
    expect(book.names).toStrictEqual([]);
  });

  it('is never converted from blank to absent', () => {
    expect(ReadBook.of('La Peste', '').ok).toBe(false);
    expect(ReadBook.of('La Peste', '   ').ok).toBe(false);
  });

  it.each([
    ['Albert Camus', ['Albert Camus']],
    ['D. Pennac - J. Ferrandez', ['D. Pennac', 'J. Ferrandez']],
    ['Pennac / Ferrandez', ['Pennac', 'Ferrandez']],
    ['Pennac et Ferrandez', ['Pennac', 'Ferrandez']],
    ['Pennac & Ferrandez', ['Pennac', 'Ferrandez']],
    ['Pennac, Ferrandez', ['Pennac', 'Ferrandez']],
    ['Jean-Paul Sartre', ['Jean-Paul Sartre']],
  ])('splits "%s" into its names', (author, names) => {
    const book = read('La Peste', author);

    expect(book.author).toBe(author);
    expect(book.names).toStrictEqual(names);
  });
});
