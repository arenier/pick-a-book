import { useCallback } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { Button, Spinner } from '@pick-a-book/shared-ui';

import { submitShelfPhoto } from '../api/scan-shelf-photo';
import type { UploadState } from '../model/upload-state';
import { FailureMessage } from './failure-message';
import { PhotoPicker } from './photo-picker';
import { PhotoPreview } from './photo-preview';
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
    // A single column that holds from 360px wide up, with no horizontal scroll (SC-004).
    <section className="flex min-w-0 flex-col gap-4">
      <PhotoPicker key={pickerKey} disabled={uploading} onPick={pick} />
      {photo !== undefined && <PhotoPreview photo={photo} />}
      <Button className="w-full" disabled={!canSend} onClick={onSend}>
        {t('send')}
      </Button>

      {uploading && (
        // The VLM call takes around 30 s (docs/decisions/0001): saying so up front is what keeps
        // a user from reading the wait as a hang.
        // The spinner sits on the first line: the message wraps on a phone.
        <output className="flex items-start gap-2">
          <Spinner className="mt-1 shrink-0" />
          {t('uploading')}
        </output>
      )}
      {state.status === 'success' && <ScanResult books={state.books} />}
      {state.status === 'error' && <FailureMessage failure={state.failure} />}
      {settled && (
        <Button variant="outline" className="w-full" onClick={startOver}>
          {t('startOver')}
        </Button>
      )}
    </section>
  );
}
