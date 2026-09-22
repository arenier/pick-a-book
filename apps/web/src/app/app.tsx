import { PhotoUploadScreen } from '../features/photo-upload/ui/photo-upload-screen';
import styles from './app.module.css';

/**
 * Frontend shell.
 *
 * Holds the page's frame and mounts the feature slices (ADR 0002) — one so far, uploading a
 * shelf photo. Nothing of the feature leaks up here: the shell does not know what a scan is.
 */
export function App() {
  return (
    <main className={styles.shell}>
      <h1>pick-a-book</h1>
      <p>
        Prendre une étagère en photo, en tirer des couples (auteur, titre), les réconcilier contre
        un référentiel bibliographique.
      </p>
      <PhotoUploadScreen />
    </main>
  );
}

export default App;
