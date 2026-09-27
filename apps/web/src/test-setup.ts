import { createI18n, setDefaultI18n } from '@pick-a-book/shared-i18n';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { resources } from './i18n/resources';

// Testing Library registers its own unmount only when Vitest injects its globals. The specs import
// what they use instead (ADR 0008), so the teardown is registered here — without it, renders pile
// up across tests and a query matching one element per render starts failing on the second test.
afterEach(cleanup);

// The specs read French, pinned here: jsdom announces `en-US`, which the interface would follow
// (ADR 0011). A spec about English hands its own instance down through `I18nProvider`.
//
// Strict: a test exercising a path with an unknown key or a missing interpolation value fails,
// instead of rendering the raw key or a sentence with a hole in it.
setDefaultI18n(await createI18n(resources, { language: 'fr', strict: true }));
