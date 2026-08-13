import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';

// Checked rather than asserted with `as`: if index.html ever loses its mount point, this
// says so instead of failing later inside React.
const container = document.getElementById('root');
if (!container) {
  throw new Error('Mount point #root is missing from index.html');
}

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
