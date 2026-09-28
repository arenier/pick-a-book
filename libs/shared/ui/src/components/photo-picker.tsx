import { useCallback, type ChangeEvent } from 'react';

import { Input } from './input.js';

export interface PhotoPickerProps {
  /** The visible label, from the slice's catalog: the component holds no text of its own. */
  readonly label: string;
  /** Media types the chooser offers. It narrows the choice, it does not validate. */
  readonly accept: readonly string[];
  readonly disabled: boolean;
  /** The photo chosen, or `undefined` when the choice was cancelled. */
  readonly onPick: (photo: File | undefined) => void;
}

/**
 * Chooses a photo: on a phone the camera as well as the gallery, a file chooser on a desktop.
 *
 * No `capture` attribute: it makes Chrome Android and Safari iOS open the camera straight away,
 * with no way left to pick an existing photo.
 */
export function PhotoPicker({ label, accept, disabled, onPick }: PhotoPickerProps) {
  const pick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      // Indexed rather than `.item(0)`: a `FileList` is indexable, and so is what tests put in
      // its place. The annotation restores the `undefined` an empty list really gives.
      const photo: File | undefined = event.target.files?.[0];
      onPick(photo);
    },
    [onPick],
  );

  return (
    <label className="flex flex-col gap-2 font-semibold">
      <span>{label}</span>
      <Input
        className="font-normal"
        type="file"
        accept={accept.join(',')}
        disabled={disabled}
        onChange={pick}
      />
    </label>
  );
}
