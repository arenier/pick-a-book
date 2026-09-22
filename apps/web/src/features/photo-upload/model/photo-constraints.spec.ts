import { describe, expect, it } from 'vitest';

import { rejectionReason } from './photo-constraints';

const file = (type: string, size: number) => {
  const chosen = new File([new Uint8Array(1)], 'IMG_0001.jpg', { type });
  // `File` sizes itself from its content, and building a 20 MB one per test would be a lot
  // of memory for a number: the size is the only thing under test here.
  Object.defineProperty(chosen, 'size', { value: size });

  return chosen;
};

describe('rejectionReason, the media types the API accepts', () => {
  it('accepts the four supported image types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(rejectionReason(file(type, 1024))).toBeUndefined();
    }
  });

  // The same list the domain enforces (`ShelfPhoto`), repeated here on purpose: the boundary
  // forbids importing it (research.md §5), and the point is a refusal without a round trip.
  it('refuses anything that is not one of them, in plain words', () => {
    const reason = rejectionReason(file('application/pdf', 1024));

    expect(reason).toMatch(/format/iu);
    expect(reason).not.toMatch(/mime|media type/iu);
  });
});

describe('rejectionReason, the size the API accepts', () => {
  const MAX = 20 * 1024 * 1024;

  it('accepts a file right up to 20 MB', () => {
    expect(rejectionReason(file('image/jpeg', MAX))).toBeUndefined();
  });

  it('refuses a file past 20 MB, saying how big it may be', () => {
    expect(rejectionReason(file('image/jpeg', MAX + 1))).toMatch(/20 Mo/u);
  });

  // An empty file is refused by the domain too: nothing to read, no point in sending it.
  it('refuses an empty file', () => {
    expect(rejectionReason(file('image/jpeg', 0))).toBeDefined();
  });
});
