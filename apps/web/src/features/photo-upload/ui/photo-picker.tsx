import { useCallback, type ChangeEvent } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { Input } from '@pick-a-book/shared-ui';

export interface PhotoPickerProps {
  readonly disabled: boolean;
  readonly onPick: (file: File | undefined) => void;
}

/**
 * The native file input: on a phone it offers the camera as well as the gallery (FR-001),
 * and falls back to a file chooser on a desktop without one (FR-010).
 *
 * No `capture` attribute: it makes Chrome Android and Safari iOS open the camera straight
 * away, with no way left to pick an existing photo.
 *
 * `accept` narrows what the chooser shows, it does not validate: the constraints are checked
 * again before sending, and once more by the server.
 */
export function PhotoPicker({ disabled, onPick }: PhotoPickerProps) {
  const { t } = useMessages('photo-upload');
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
    <label className="flex flex-col gap-2 font-semibold">
      <span>{t('picker.label')}</span>
      <Input
        className="font-normal"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        disabled={disabled}
        onChange={pick}
      />
    </label>
  );
}
