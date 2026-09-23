import { useCallback, useState } from 'react';

import { submitShelfPhoto } from '../api/scan-shelf-photo';
import type { UploadState } from '../model/upload-state';
import { PhotoPicker } from './photo-picker';
import styles from './photo-upload-screen.module.css';
import { ScanResult } from './scan-result';

export interface PhotoUploadScreenProps {
  /** Sends the photo; injected by the specs, the real API client otherwise. */
  readonly submit?: (photo: File) => Promise<UploadState>;
}

/**
 * The upload screen: choose a shelf photo, send it, read the books found on it
 * (specs/001-photo-upload, US1).
 */
export function PhotoUploadScreen({ submit = submitShelfPhoto }: PhotoUploadScreenProps) {
  const [photo, setPhoto] = useState<File>();
  const [state, setState] = useState<UploadState>({ status: 'idle' });

  const uploading = state.status === 'uploading';

  const send = useCallback(async () => {
    // The disabled button already prevents it; this also covers a click that slipped
    // through before React re-rendered (FR-007).
    if (photo === undefined || uploading) {
      return;
    }
    setState({ status: 'uploading' });
    setState(await submit(photo));
  }, [photo, uploading, submit]);

  const onSend = useCallback(() => {
    void send();
  }, [send]);

  return (
    <section className={styles['screen']}>
      <PhotoPicker disabled={uploading} onPick={setPhoto} />
      <button
        type="button"
        className={styles['send']}
        disabled={photo === undefined || uploading}
        onClick={onSend}
      >
        Analyser la photo
      </button>

      {uploading && <output>Analyse de la photo en cours…</output>}
      {state.status === 'success' && <ScanResult books={state.books} />}
    </section>
  );
}
