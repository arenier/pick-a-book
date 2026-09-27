import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import App from './app/app';
import { createI18n } from './i18n/create-i18n';
import { syncDocumentLanguage } from './i18n/sync-document-language';

// Checked rather than asserted with `as`: if index.html ever loses its mount point, this
// says so instead of failing later inside React.
const container = document.getElementById('root');
if (!container) {
  throw new Error('Mount point #root is missing from index.html');
}

// The catalogs are bundled, not fetched: this settles at once, before the first render.
const i18n = await createI18n();
syncDocumentLanguage(i18n, document.documentElement);

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
