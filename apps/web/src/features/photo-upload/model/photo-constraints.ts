/**
 * What the screen refuses before touching the network (FR-003, FR-009).
 *
 * The values are the ones the domain already enforces (`ShelfPhoto`, in
 * `libs/recognition/domain`), repeated here rather than imported: `scope:web` never depends
 * on `scope:api` (ADR 0002), and a shared lib for two constants would be the very drift the
 * ADR warns about (research.md §5). The server revalidates everything anyway — this check
 * buys an immediate answer, not safety.
 */
const ACCEPTED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

/** 20 MB, as bytes — the same ceiling `ShelfPhoto` applies. */
const MAX_SIZE_IN_BYTES = 20 * 1024 * 1024;

/**
 * Why this file cannot be sent, or `undefined` when it can.
 *
 * Answers a message rather than a boolean: the screen has nothing to add to it, and a
 * boolean would push the wording of the refusal somewhere that does not know its cause
 * (FR-009: no technical jargon).
 */
export function rejectionReason(file: File): string | undefined {
  if (!ACCEPTED_MEDIA_TYPES.has(file.type)) {
    return "Ce format d'image n'est pas pris en charge. Choisissez une photo JPEG, PNG, WebP ou HEIC.";
  }

  if (file.size === 0) {
    return 'Ce fichier est vide. Choisissez une autre photo.';
  }

  if (file.size > MAX_SIZE_IN_BYTES) {
    return 'Cette photo est trop lourde : 20 Mo au maximum. Choisissez une autre photo.';
  }

  return undefined;
}
