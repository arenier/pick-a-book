import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library registers its own unmount only when Vitest injects its globals. The specs import
// what they use instead (ADR 0008), so the teardown is registered here — without it, renders pile
// up across tests and a query matching one element per render starts failing on the second test.
afterEach(cleanup);
