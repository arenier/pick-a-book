import { describe, expect, it } from 'vitest';

import { MAX_SIZE_IN_BYTES, photoProblem } from './photo-constraints';

const aPhoto = (type: string, size: number) => ({ type, size });

describe('photoProblem', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])('accepts %s', (type) => {
    expect(photoProblem(aPhoto(type, 1024))).toBeUndefined();
  });

  it.each(['application/pdf', 'image/gif', ''])('refuses the media type %p', (type) => {
    expect(photoProblem(aPhoto(type, 1024))).toBe(
      'Ce fichier n’est pas une photo prise en charge : choisissez une image JPEG, PNG, WebP ou HEIC.',
    );
  });

  it('accepts a photo of exactly 20 MB', () => {
    expect(MAX_SIZE_IN_BYTES).toBe(20_971_520);
    expect(photoProblem(aPhoto('image/jpeg', MAX_SIZE_IN_BYTES))).toBeUndefined();
  });

  it('refuses a photo over 20 MB', () => {
    expect(photoProblem(aPhoto('image/jpeg', MAX_SIZE_IN_BYTES + 1))).toBe(
      'Cette photo dépasse 20 Mo : choisissez-en une plus légère.',
    );
  });

  it('refuses an empty file', () => {
    expect(photoProblem(aPhoto('image/jpeg', 0))).toBe('Ce fichier est vide.');
  });
});
