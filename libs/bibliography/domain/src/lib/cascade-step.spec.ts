import { describe, expect, it } from 'vitest';

import { CASCADE_STEPS, isCascadeStep } from './cascade-step.js';

describe('CascadeStep', () => {
  it('recognises every step of the cascade', () => {
    expect(CASCADE_STEPS.every((step) => isCascadeStep(step))).toBe(true);
  });

  it('refuses a value read back from storage that is not a step', () => {
    expect(isCascadeStep('author')).toBe(false);
    expect(isCascadeStep('')).toBe(false);
  });
});
