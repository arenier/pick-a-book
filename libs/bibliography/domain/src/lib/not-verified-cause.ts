/** Why a book is « not verified »: the catalogue could not answer for it. */
export const NOT_VERIFIED_CAUSES = ['unavailable', 'timeout', 'invalid_response'] as const;

export type NotVerifiedCause = (typeof NOT_VERIFIED_CAUSES)[number];

/** Reads a cause back from storage: a closed union is proven, not asserted. */
export function isNotVerifiedCause(value: string): value is NotVerifiedCause {
  return NOT_VERIFIED_CAUSES.some((cause) => cause === value);
}
