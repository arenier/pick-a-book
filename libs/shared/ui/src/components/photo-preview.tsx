import { useCallback, useEffect, useState } from 'react';

export interface PhotoPreviewProps {
  readonly photo: File;
  /** The image's alternative text, from the slice's catalog. */
  readonly alt: string;
  /** Said instead of the image when the browser cannot display it (HEIC outside Safari). */
  readonly unavailable: string;
}

/**
 * A photo chosen on the device, shown before any upload.
 *
 * Read from a local object URL rather than a data URL: a 20 MB photo would otherwise sit in memory
 * as a ~27 MB base64 string. The URL is created by the effect, not during render, so that
 * StrictMode's extra mount/unmount cannot leave the image pointing at a revoked URL — and it is
 * revoked as soon as the photo changes, not to keep every photo tried on a phone.
 */
export function PhotoPreview({ photo, alt, unavailable }: PhotoPreviewProps) {
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

  if (unreadableUrl === url) {
    return <p>{unavailable}</p>;
  }

  // Bounded in height so that what follows the photo stays within reach under a portrait photo.
  return (
    <img
      className="mx-auto block max-h-[50vh] max-w-full object-contain"
      src={url}
      alt={alt}
      onError={onError}
    />
  );
}
