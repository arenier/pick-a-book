import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import { createI18n, I18nProvider, syncDocumentLanguage } from '@pick-a-book/shared-i18n';

import App from './app/app';
import { resources } from './i18n/resources';

// Checked rather than asserted with `as`: if index.html ever loses its mount point, this
// says so instead of failing later inside React.
const container = document.getElementById('root');
if (!container) {
  throw new Error('Mount point #root is missing from index.html');
}

// The catalogs are bundled, not fetched: this settles at once, before the first render.
const i18n = await createI18n(resources);
syncDocumentLanguage(i18n, document.documentElement);

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>,
);
