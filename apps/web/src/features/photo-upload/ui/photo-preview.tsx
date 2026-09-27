import { useCallback, useEffect, useState } from 'react';

import styles from './photo-upload-screen.module.css';

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
    return <p>Aperçu indisponible pour ce format : la photo peut tout de même être analysée.</p>;
  }

  return (
    <img
      className={styles['preview']}
      src={url}
      alt="Aperçu de l’étagère choisie"
      onError={onError}
    />
  );
}
