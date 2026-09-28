import { useMessages } from '@pick-a-book/shared-i18n';
import { PhotoPreview as DesignSystemPhotoPreview } from '@pick-a-book/shared-ui';

export interface PhotoPreviewProps {
  readonly photo: File;
}

/**
 * The chosen photo, shown before and while it is analysed (specs/001-photo-upload, US5), worded
 * by this slice's catalog. Accepted but not displayable (HEIC outside Safari), it says so: the
 * recognition still reads it (FR-017).
 */
export function PhotoPreview({ photo }: PhotoPreviewProps) {
  const { t } = useMessages('photo-upload');

  return (
    <DesignSystemPhotoPreview
      photo={photo}
      alt={t('preview.alt')}
      unavailable={t('preview.unavailable')}
    />
  );
}
