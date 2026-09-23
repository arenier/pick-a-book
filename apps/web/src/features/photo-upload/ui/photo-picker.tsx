import { useCallback, type ChangeEvent } from 'react';

import styles from './photo-upload-screen.module.css';

export interface PhotoPickerProps {
  readonly disabled: boolean;
  readonly onPick: (file: File | undefined) => void;
}

/**
 * The native file input: on a phone it offers the camera as well as the gallery (FR-001),
 * and falls back to a file chooser on a desktop without one (FR-010).
 *
 * `accept` narrows what the chooser shows, it does not validate: the constraints are checked
 * again before sending, and once more by the server.
 */
export function PhotoPicker({ disabled, onPick }: PhotoPickerProps) {
  const pick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      // Indexed rather than `.item(0)`: a `FileList` is indexable, and so is what tests put
      // in its place. The annotation restores the `undefined` an empty list really gives.
      const file: File | undefined = event.target.files?.[0];
      onPick(file);
    },
    [onPick],
  );

  return (
    <label className={styles['picker']}>
      <span>Photo de l’étagère</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        disabled={disabled}
        onChange={pick}
      />
    </label>
  );
}
