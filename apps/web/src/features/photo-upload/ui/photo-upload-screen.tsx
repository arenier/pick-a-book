import { useCallback } from 'react';

import { submitShelfPhoto } from '../api/scan-shelf-photo';
import type { UploadState } from '../model/upload-state';
import { PhotoPicker } from './photo-picker';
import styles from './photo-upload-screen.module.css';
import { ScanResult } from './scan-result';
import { usePhotoUpload } from './use-photo-upload';

export interface PhotoUploadScreenProps {
  /** Sends the photo; injected by the specs, the real API client otherwise. */
  readonly submit?: (photo: File) => Promise<UploadState>;
}

/**
 * The upload screen: choose a shelf photo, send it, read the books found on it
 * (specs/001-photo-upload, US1, US2, US4).
 */
export function PhotoUploadScreen({ submit = submitShelfPhoto }: PhotoUploadScreenProps) {
  const { state, pickerKey, uploading, canSend, settled, pick, send, startOver } =
    usePhotoUpload(submit);

  const onSend = useCallback(() => {
    void send();
  }, [send]);

  return (
    <section className={styles['screen']}>
      <PhotoPicker key={pickerKey} disabled={uploading} onPick={pick} />
      <button type="button" className={styles['send']} disabled={!canSend} onClick={onSend}>
        Analyser la photo
      </button>

      {uploading && <output>Analyse de la photo en cours…</output>}
      {state.status === 'success' && <ScanResult books={state.books} />}
      {state.status === 'error' && (
        <p role="alert" className={styles['error']}>
          {state.message}
        </p>
      )}
      {settled && (
        <button type="button" className={styles['send']} onClick={startOver}>
          Recommencer
        </button>
      )}
    </section>
  );
}
