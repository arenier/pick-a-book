import { useCallback } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';

import { submitShelfPhoto } from '../api/scan-shelf-photo';
import type { UploadState } from '../model/upload-state';
import { FailureMessage } from './failure-message';
import { PhotoPicker } from './photo-picker';
import { PhotoPreview } from './photo-preview';
import styles from './photo-upload-screen.module.css';
import { ScanResult } from './scan-result';
import { usePhotoUpload } from './use-photo-upload';

export interface PhotoUploadScreenProps {
  /** Sends the photo; injected by the specs, the real API client otherwise. */
  readonly submit?: (photo: File) => Promise<UploadState>;
}

/**
 * The upload screen: choose a shelf photo, send it, read the books found on it
 * (specs/001-photo-upload, US1, US2, US4, US5).
 */
export function PhotoUploadScreen({ submit = submitShelfPhoto }: PhotoUploadScreenProps) {
  const { t } = useMessages('photo-upload');
  const { photo, state, pickerKey, uploading, canSend, settled, pick, send, startOver } =
    usePhotoUpload(submit);

  const onSend = useCallback(() => {
    void send();
  }, [send]);

  return (
    <section className={styles['screen']}>
      <PhotoPicker key={pickerKey} disabled={uploading} onPick={pick} />
      {photo !== undefined && <PhotoPreview photo={photo} />}
      <button type="button" className={styles['send']} disabled={!canSend} onClick={onSend}>
        {t('send')}
      </button>

      {uploading && (
        // The VLM call takes around 30 s (docs/decisions/0001): saying so up front is what keeps
        // a user from reading the wait as a hang.
        <output>{t('uploading')}</output>
      )}
      {state.status === 'success' && <ScanResult books={state.books} />}
      {state.status === 'error' && <FailureMessage failure={state.failure} />}
      {settled && (
        <button type="button" className={styles['send']} onClick={startOver}>
          {t('startOver')}
        </button>
      )}
    </section>
  );
}
