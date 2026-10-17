import { describe, expect, it } from 'vitest';

import { DailyUploadQuotaExceeded } from './daily-upload-quota-exceeded.error.js';

describe('DailyUploadQuotaExceeded', () => {
  it('says how many uploads a day are allowed', () => {
    const error = new DailyUploadQuotaExceeded(100);

    expect(error.kind).toBe('daily-upload-quota-exceeded');
    expect(error.name).toBe('DailyUploadQuotaExceeded');
    expect(error.limit).toBe(100);
    expect(error.message).toBe('Daily upload quota exceeded: 100 uploads a day at most');
  });
});
