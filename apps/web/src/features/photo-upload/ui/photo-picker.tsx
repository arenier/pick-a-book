import { useCallback, type ChangeEvent } from 'react';

import styles from './photo-upload-screen.module.css';

/** The media types the API accepts, as the browser's file picker understands them. */
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic';

/**
 * Where the photo comes from.
 *
 * A plain file input, with `capture="environment"`: a phone offers its back camera, and any
 * device without one — a desktop browser — falls back to picking an existing file, which is
 * what keeps the screen usable there (FR-001, FR-010).
 */
export function PhotoPicker({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (file: File | null) => void;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSelect(event.target.files?.[0] ?? null);
    },
    [onSelect],
  );

  return (
    <label className={styles.picker}>
      <span>Photo de l&apos;étagère</span>
      <input
        type="file"
        accept={ACCEPTED}
        capture="environment"
        disabled={disabled}
        onChange={handleChange}
      />
    </label>
  );
}
