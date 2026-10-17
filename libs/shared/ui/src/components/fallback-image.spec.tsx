import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FallbackImage } from './fallback-image';

const texts = { alt: 'Photo de l’étagère', placeholderLabel: 'Image indisponible' } as const;

// Lists made once, outside the renders: a new array on each render would look like a new list.
const PHOTO_THEN_THUMBNAIL = ['/photo', '/thumbnail'];
const PHOTO = ['/photo'];
const THUMBNAIL = ['/thumbnail'];
const NOTHING: string[] = [];
const A_THEN_B = ['/a', '/b'];
const C_THEN_D = ['/c', '/d'];

const image = () => screen.getByRole<HTMLImageElement>('img', { name: texts.alt });
const placeholder = () => screen.getByRole('img', { name: texts.placeholderLabel });

/**
 * An image that may not load, and says what to show then (specs/002-upload-history, FR-008): the
 * photo, else the thumbnail, else a neutral indicator — a list of sources, tried in order.
 */
describe('FallbackImage, showing the first source', () => {
  it('shows the first source of the list, under its alternative text', () => {
    render(<FallbackImage sources={PHOTO_THEN_THUMBNAIL} {...texts} />);

    expect(image().getAttribute('src')).toBe('/photo');
  });

  it('does not show the indicator while a source holds', () => {
    render(<FallbackImage sources={PHOTO} {...texts} />);

    expect(screen.queryByRole('img', { name: texts.placeholderLabel })).toBeNull();
  });

  // The page of the history asks for a few dozen of them: only those that come into view.
  it('loads lazily when asked to', () => {
    render(<FallbackImage sources={PHOTO} loading="lazy" {...texts} />);

    expect(image().getAttribute('loading')).toBe('lazy');
  });

  it('passes its class to the image', () => {
    render(<FallbackImage sources={PHOTO} className="aspect-3/2" {...texts} />);

    expect(image().className).toContain('aspect-3/2');
  });
});

describe('FallbackImage, when a source fails', () => {
  it('falls back to the next source of the list', () => {
    render(<FallbackImage sources={PHOTO_THEN_THUMBNAIL} {...texts} />);

    fireEvent.error(image());

    expect(image().getAttribute('src')).toBe('/thumbnail');
  });

  it('shows the neutral indicator once the list is used up', () => {
    render(<FallbackImage sources={PHOTO_THEN_THUMBNAIL} {...texts} />);

    fireEvent.error(image());
    fireEvent.error(image());

    expect(placeholder()).toBeDefined();
    expect(screen.queryAllByRole('img')).toHaveLength(1);
  });

  it('shows the neutral indicator at once for a single source that fails', () => {
    render(<FallbackImage sources={THUMBNAIL} {...texts} />);

    fireEvent.error(image());

    expect(placeholder()).toBeDefined();
  });
});

describe('FallbackImage, with nothing to load', () => {
  // No source, no request: a thumbnail that does not exist is never asked for (FR-008).
  it('shows the indicator without making any request', () => {
    const { container } = render(<FallbackImage sources={NOTHING} {...texts} />);

    expect(placeholder()).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('passes its class to the indicator as well, so it takes the place of the image', () => {
    render(<FallbackImage sources={NOTHING} className="aspect-3/2" {...texts} />);

    expect(placeholder().className).toContain('aspect-3/2');
  });

  it('starts over from the first source when the list changes', () => {
    const { rerender } = render(<FallbackImage sources={A_THEN_B} {...texts} />);
    fireEvent.error(image());
    fireEvent.error(image());

    rerender(<FallbackImage sources={C_THEN_D} {...texts} />);

    expect(image().getAttribute('src')).toBe('/c');
  });
});
