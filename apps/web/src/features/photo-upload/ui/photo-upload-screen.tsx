import { useCallback, useState } from 'react';

import { submitShelfPhoto } from '../api/scan-shelf-photo';
import { IDLE, type UploadState } from '../model/upload-state';
import { PhotoPicker } from './photo-picker';
import styles from './photo-upload-screen.module.css';
import { ScanResult } from './scan-result';

/**
 * The whole feature, on one screen: pick a photo, send it, read what came back.
 *
 * One state value drives everything (`UploadState`), so the screen can only ever be in one
 * of the four situations the feature has words for — never, say, loading and in error at
 * once (FR-004, FR-006).
 *
 * Text is French: it is what the user reads, which makes it product rather than code
 * (CLAUDE.md).
 */
export function PhotoUploadScreen() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>(IDLE);

  const uploading = state.status === 'uploading';

  const select = useCallback((file: File | null) => {
    setPhoto(file);
    setState(IDLE);
  }, []);

  const send = useCallback(() => {
    if (photo === null || uploading) {
      // FR-007: one analysis at a time. The trigger is already disabled — this is the guard
      // behind the guard, for the double tap that slips through anyway.
      return;
    }

    setState({ status: 'uploading' });
    // `void`: there is nothing to await on here — every outcome, failures included, comes
    // back as a state (`submitShelfPhoto` never rejects).
    void submitShelfPhoto(photo).then(setState);
  }, [photo, uploading]);

  const restart = useCallback(() => {
    setPhoto(null);
    setState(IDLE);
  }, []);

  return (
    <section className={styles.screen}>
      <PhotoPicker disabled={uploading} onSelect={select} />
      <button
        type="button"
        className={styles.submit}
        disabled={photo === null || uploading}
        onClick={send}
      >
        Analyser l&apos;étagère
      </button>
      <UploadOutcome state={state} onRestart={restart} />
    </section>
  );
}

/**
 * What there is to show of the current state — nothing at all while idle.
 *
 * "Recommencer" appears with the outcome it undoes, and only then: there is nothing to start
 * over before an answer has arrived (US4, FR-008).
 */
function UploadOutcome({ state, onRestart }: { state: UploadState; onRestart: () => void }) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'uploading') {
    return (
      // `output` rather than a `div` with `role="status"`: the same announcement to a screen
      // reader, in the tag the browser already has for it.
      <output className={styles.loading}>
        Analyse en cours, cela peut prendre une trentaine de secondes…
      </output>
    );
  }

  return (
    <>
      {state.status === 'error' ? (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      ) : (
        <ScanResult books={state.books} />
      )}
      <button type="button" className={styles.restart} onClick={onRestart}>
        Recommencer
      </button>
    </>
  );
}
