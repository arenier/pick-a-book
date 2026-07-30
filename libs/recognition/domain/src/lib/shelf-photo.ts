/**
 * Photo d'etagere soumise a la reconnaissance.
 *
 * Le domaine ne connait ni le bucket ni le systeme de fichiers : il recoit des octets
 * et un type de media. La cle de l'objet stocke reste une affaire d'infrastructure
 * (ADR 0004, ADR 0006).
 */
const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

export type ShelfPhotoMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/** 20 Mo : une photo de telephone tient tres largement dessous. */
const MAX_BYTES = 20 * 1024 * 1024;

export class ShelfPhoto {
  private constructor(
    readonly bytes: Uint8Array,
    readonly mediaType: ShelfPhotoMediaType,
  ) {}

  static of(bytes: Uint8Array, mediaType: string): ShelfPhoto {
    if (bytes.byteLength === 0) {
      throw new Error('ShelfPhoto : image vide');
    }
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(
        `ShelfPhoto : image trop lourde (${bytes.byteLength} octets, ${MAX_BYTES} au plus)`,
      );
    }
    if (!isSupported(mediaType)) {
      throw new Error(
        `ShelfPhoto : type de media non supporte (${mediaType}) — attendu ${SUPPORTED_MEDIA_TYPES.join(', ')}`,
      );
    }

    return new ShelfPhoto(bytes, mediaType);
  }
}

function isSupported(mediaType: string): mediaType is ShelfPhotoMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType);
}
