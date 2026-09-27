import { useCallback, useEffect, useState } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';

export interface PhotoPreviewProps {
  readonly photo: File;
}

/**
 * The chosen photo, shown before and while it is analysed (specs/001-photo-upload, US5).
 *
 * Read from a local object URL rather than a data URL: a 20 MB photo would otherwise sit in
 * memory as a ~27 MB base64 string. The URL is created by the effect, not during render, so
 * that StrictMode's extra mount/unmount cannot leave the image pointing at a revoked URL — and
 * it is revoked as soon as the photo changes, not to keep every photo tried on a phone.
 */
export function PhotoPreview({ photo }: PhotoPreviewProps) {
  const { t } = useMessages('photo-upload');
  const [url, setUrl] = useState<string>();
  // Tied to a URL rather than a flag: a photo that cannot be displayed says nothing of the next.
  const [unreadableUrl, setUnreadableUrl] = useState<string>();

  useEffect(() => {
    const created = URL.createObjectURL(photo);
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
    };
  }, [photo]);

  const onError = useCallback(() => {
    setUnreadableUrl(url);
  }, [url]);

  if (url === undefined) {
    return null;
  }

  // Accepted but not displayable (HEIC outside Safari): the recognition still reads it (FR-017).
  if (unreadableUrl === url) {
    return <p>{t('preview.unavailable')}</p>;
  }

  // Bounded in height so the send button stays within reach under a portrait photo (SC-006).
  return (
    <img
      className="mx-auto block max-h-[50vh] max-w-full object-contain"
      src={url}
      alt={t('preview.alt')}
      onError={onError}
    />
  );
}
