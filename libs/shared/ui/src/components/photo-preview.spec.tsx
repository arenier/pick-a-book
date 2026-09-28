import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { PhotoPreview } from './photo-preview';

const aJpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });

const texts = { alt: 'Aperçu de la photo', unavailable: 'Aperçu indisponible' } as const;

const preview = () => screen.getByRole<HTMLImageElement>('img', { name: texts.alt });

/** One URL per file name, so a test can tell which photo an URL was made for. */
function stubObjectUrls() {
  const spies: { revoke?: MockInstance<(url: string) => void> } = {};

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation((photo) =>
      photo instanceof File ? `blob:${photo.name}` : 'blob:unknown',
    );
    spies.revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return spies;
}

describe('PhotoPreview, showing the photo', () => {
  stubObjectUrls();

  it('shows the photo from a local URL, without any request', () => {
    render(<PhotoPreview photo={aJpeg('IMG_0001.jpg')} {...texts} />);

    expect(preview().getAttribute('src')).toBe('blob:IMG_0001.jpg');
  });

  // HEIC, for one, is a photo only Safari can display.
  it('says so when the browser cannot display the photo', () => {
    render(<PhotoPreview photo={aJpeg('IMG_0001.heic')} {...texts} />);

    fireEvent.error(preview());

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Aperçu indisponible')).toBeDefined();
  });

  it('shows the next photo even after one could not be displayed', () => {
    const { rerender } = render(<PhotoPreview photo={aJpeg('IMG_0001.heic')} {...texts} />);
    fireEvent.error(preview());

    rerender(<PhotoPreview photo={aJpeg('IMG_0002.jpg')} {...texts} />);

    expect(preview().getAttribute('src')).toBe('blob:IMG_0002.jpg');
  });
});

// A phone keeps every photo tried in memory unless its URL is released.
describe('PhotoPreview, releasing the photo', () => {
  const spies = stubObjectUrls();

  it('releases the previous photo when it changes', () => {
    const { rerender } = render(<PhotoPreview photo={aJpeg('IMG_0001.jpg')} {...texts} />);

    rerender(<PhotoPreview photo={aJpeg('IMG_0002.jpg')} {...texts} />);

    expect(spies.revoke?.mock.calls).toStrictEqual([['blob:IMG_0001.jpg']]);
  });

  it('releases the photo once it is no longer shown', () => {
    const { unmount } = render(<PhotoPreview photo={aJpeg('IMG_0001.jpg')} {...texts} />);

    unmount();

    expect(spies.revoke?.mock.calls).toStrictEqual([['blob:IMG_0001.jpg']]);
  });
});
