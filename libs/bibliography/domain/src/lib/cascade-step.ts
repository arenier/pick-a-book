/** The step of the cascade of queries that concluded (ADR 0014, research §5). */
export const CASCADE_STEPS = ['title_and_author', 'author_only', 'title_only', 'segment'] as const;

export type CascadeStep = (typeof CASCADE_STEPS)[number];

/** Reads a step back from storage: a closed union is proven, not asserted. */
export function isCascadeStep(value: string): value is CascadeStep {
  return CASCADE_STEPS.some((step) => step === value);
}
