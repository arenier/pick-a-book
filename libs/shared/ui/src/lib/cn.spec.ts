import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('lets a later Tailwind class override a conflicting earlier one', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('drops the values a condition turned off', () => {
    expect(cn('rounded-md', false, null)).toBe('rounded-md');
  });
});
