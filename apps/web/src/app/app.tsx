import { PhotoUploadScreen } from '../features/photo-upload/ui/photo-upload-screen';
import styles from './app.module.css';

/** Frontend shell: mounts the feature slices (ADR 0002) — for now, the photo upload. */
export function App() {
  return (
    <main className={styles.shell}>
      <h1>pick-a-book</h1>
      <p>Prenez une étagère en photo pour voir les livres qu’elle contient.</p>
      <PhotoUploadScreen />
    </main>
  );
}

export default App;
