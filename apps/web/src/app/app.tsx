import { useMessages } from '@pick-a-book/shared-i18n';

import { PhotoUploadScreen } from '../features/photo-upload/ui/photo-upload-screen';
import styles from './app.module.css';

/** Frontend shell: mounts the feature slices (ADR 0002) — for now, the photo upload. */
export function App() {
  const { t } = useMessages('shell');

  return (
    <main className={styles.shell}>
      <h1>{t('title')}</h1>
      <p>{t('tagline')}</p>
      <PhotoUploadScreen />
    </main>
  );
}

export default App;
