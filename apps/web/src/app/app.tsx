import styles from './app.module.css';

/**
 * Frontend shell.
 *
 * The split into feature slices (ADR 0002) starts with the first real feature — uploading a
 * shelf photo. Nothing to extract as long as there is nothing inside.
 */
export function App() {
  return (
    <main className={styles.shell}>
      <h1>pick-a-book</h1>
      <p>
        Prendre une etagere en photo, en tirer des couples (auteur, titre), les reconcilier contre
        un referentiel bibliographique.
      </p>
      <p className={styles.status}>Interface a construire.</p>
    </main>
  );
}

export default App;
