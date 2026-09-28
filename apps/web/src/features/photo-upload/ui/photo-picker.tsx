import { useMessages } from '@pick-a-book/shared-i18n';
import { PhotoPicker as DesignSystemPhotoPicker } from '@pick-a-book/shared-ui';

import { ACCEPTED_MEDIA_TYPES } from '../model/photo-constraints';

export interface PhotoPickerProps {
  readonly disabled: boolean;
  readonly onPick: (file: File | undefined) => void;
}

/**
 * The picker of the design system, worded by this slice's catalog: the camera as well as the
 * gallery on a phone (FR-001), a file chooser on a desktop without one (FR-010).
 *
 * `accept` narrows what the chooser shows, it does not validate: the constraints are checked
 * again before sending, and once more by the server.
 */
export function PhotoPicker({ disabled, onPick }: PhotoPickerProps) {
  const { t } = useMessages('photo-upload');

  return (
    <DesignSystemPhotoPicker
      label={t('picker.label')}
      accept={ACCEPTED_MEDIA_TYPES}
      disabled={disabled}
      onPick={onPick}
    />
  );
}
