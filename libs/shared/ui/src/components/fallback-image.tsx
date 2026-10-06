import { useCallback, useState } from 'react';
import { ImageOffIcon } from 'lucide-react';

import { cn } from '../lib/cn.js';

export interface FallbackImageProps {
  /**
   * What to try, in order — the photo, then its thumbnail, say. Empty: nothing to load, so the
   * indicator shows at once and no request is made.
   */
  readonly sources: readonly string[];
  /** The alternative text of the image, from the slice's catalog. */
  readonly alt: string;
  /** The name of the neutral indicator shown when no source loads, from the slice's catalog. */
  readonly placeholderLabel: string;
  readonly loading?: 'lazy' | 'eager';
  /** Sizes the image and, the same way, the indicator that takes its place. */
  readonly className?: string;
}

/**
 * An image that may not load, and what to show then (specs/002-upload-history, FR-008): each
 * source in turn when the one before fails, then a neutral indicator. A HEIC that most browsers
 * cannot draw, a photo the bucket lost, a thumbnail that never existed — none leaves a broken
 * image on screen.
 *
 * The count of failures is tied to the list it was counted on, so a new list starts again from
 * its first source instead of inheriting the failures of the previous one.
 */
export function FallbackImage({
  sources,
  alt,
  placeholderLabel,
  loading,
  className,
}: FallbackImageProps) {
  const key = sources.join('\n');
  const [failures, setFailures] = useState({ key, count: 0 });
  const count = failures.key === key ? failures.count : 0;
  const source = sources.at(count);

  const onError = useCallback(() => {
    setFailures({ key, count: count + 1 });
  }, [key, count]);

  if (source === undefined) {
    return (
      <div
        // An image in the accessibility tree, drawn from an icon: a `<div role="img">` is the one
        // way to name it, an `<img>` needing a file to point at.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={placeholderLabel}
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
      >
        <ImageOffIcon aria-hidden="true" className="size-6" />
      </div>
    );
  }

  return (
    <img
      className={cn('object-cover', className)}
      src={source}
      alt={alt}
      loading={loading}
      onError={onError}
    />
  );
}
