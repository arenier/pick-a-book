import { useCallback, useState } from 'react';

import { photoProblem } from '../model/photo-constraints';
import type { UploadState } from '../model/upload-state';

/**
 * The state of the upload screen and its transitions (data-model.md#UploadState): pick a
 * photo, send it, start over.
 */
export function usePhotoUpload(submit: (photo: File) => Promise<UploadState>) {
  const [photo, setPhoto] = useState<File>();
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  // A file input cannot be emptied from React: bumping its key mounts a fresh one.
  const [pickerKey, setPickerKey] = useState(0);

  const uploading = state.status === 'uploading';

  // Checked on pick, before any request: a refused file never reaches the network (FR-003).
  const pick = useCallback((file: File | undefined) => {
    const problem = file === undefined ? undefined : photoProblem(file);
    setPhoto(problem === undefined ? file : undefined);
    setState(problem === undefined ? { status: 'idle' } : { status: 'error', message: problem });
  }, []);

  const send = useCallback(async () => {
    // The disabled button already prevents it; this also covers a click that slipped
    // through before React re-rendered (FR-007).
    if (photo === undefined || uploading) {
      return;
    }
    setState({ status: 'uploading' });
    setState(await submit(photo));
  }, [photo, uploading, submit]);

  // US4, FR-008: back to the start, without reloading the page.
  const startOver = useCallback(() => {
    setPhoto(undefined);
    setState({ status: 'idle' });
    setPickerKey((key) => key + 1);
  }, []);

  return {
    state,
    pickerKey,
    uploading,
    canSend: photo !== undefined && !uploading,
    settled: state.status === 'success' || state.status === 'error',
    pick,
    send,
    startOver,
  };
}
