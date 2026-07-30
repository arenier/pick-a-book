import styles from './app.module.css';

/**
 * Coquille du frontend.
 *
 * Le decoupage en feature-slices (ADR 0002) commencera avec la premiere fonctionnalite
 * reelle — televerser une photo d'etagere. Rien a extraire tant qu'il n'y a rien dedans.
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
