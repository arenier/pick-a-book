import { cleanup } from '@testing-library/react';
import { setI18n } from 'react-i18next';
import { afterEach } from 'vitest';

import { createI18n } from './i18n/create-i18n';

// Testing Library registers its own unmount only when Vitest injects its globals. The specs import
// what they use instead (ADR 0008), so the teardown is registered here — without it, renders pile
// up across tests and a query matching one element per render starts failing on the second test.
afterEach(cleanup);

// The specs read French, pinned here: jsdom announces `en-US`, which the interface would follow
// (ADR 0011). A spec about English switches language on its own instance.
//
// Both handlers throw, so that a test exercising a path with an unknown key or a missing
// interpolation value fails, instead of rendering the raw key or a sentence with a hole in it.
const i18n = await createI18n({
  lng: 'fr',
  saveMissing: true,
  missingKeyHandler: (_languages, namespace, key) => {
    throw new Error(`Missing translation: ${namespace}:${key}`);
  },
  missingInterpolationHandler: (text: string) => {
    throw new Error(`Missing interpolation value in: ${text}`);
  },
});
setI18n(i18n);
