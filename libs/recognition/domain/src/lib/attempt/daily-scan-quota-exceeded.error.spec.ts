import { describe, expect, it } from 'vitest';

import { DailyScanQuotaExceeded } from './daily-scan-quota-exceeded.error.js';

describe('DailyScanQuotaExceeded', () => {
  it('says how many analyses a day are allowed', () => {
    const error = new DailyScanQuotaExceeded(50);

    expect(error.kind).toBe('daily-scan-quota-exceeded');
    expect(error.name).toBe('DailyScanQuotaExceeded');
    expect(error.limit).toBe(50);
    expect(error.message).toBe('Daily scan quota exceeded: 50 analyses a day at most');
  });
});
