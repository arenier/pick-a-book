import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library unmounts on its own only when Vitest injects its globals; the specs import what
// they use instead (ADR 0008), so the teardown is registered here.
afterEach(cleanup);
