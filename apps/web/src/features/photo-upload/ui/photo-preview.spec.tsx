import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { PhotoPreview } from './photo-preview';

const aJpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });

const preview = () =>
  screen.getByRole<HTMLImageElement>('img', { name: 'Aperçu de l’étagère choisie' });

/**
 * One URL per file name, so a test can tell which photo an URL was made for. Returns the
 * revocation spy, read once the hooks have run.
 */
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
    render(<PhotoPreview photo={aJpeg('IMG_0001.jpg')} />);

    expect(preview().getAttribute('src')).toBe('blob:IMG_0001.jpg');
  });

  // FR-017: HEIC is accepted but only Safari can display it.
  it('says so when the browser cannot display the photo', () => {
    render(<PhotoPreview photo={aJpeg('IMG_0001.heic')} />);

    fireEvent.error(preview());

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Aperçu indisponible/u).textContent).toBe(
      'Aperçu indisponible pour ce format : la photo peut tout de même être analysée.',
    );
  });

  it('shows the next photo even after one could not be displayed', () => {
    const { rerender } = render(<PhotoPreview photo={aJpeg('IMG_0001.heic')} />);
    fireEvent.error(preview());

    rerender(<PhotoPreview photo={aJpeg('IMG_0002.jpg')} />);

    expect(preview().getAttribute('src')).toBe('blob:IMG_0002.jpg');
  });
});

// A phone keeps every photo tried in memory unless its URL is released.
describe('PhotoPreview, releasing the photo', () => {
  const spies = stubObjectUrls();

  it('shows the new photo when it changes, and releases the previous one', () => {
    const { rerender } = render(<PhotoPreview photo={aJpeg('IMG_0001.jpg')} />);

    rerender(<PhotoPreview photo={aJpeg('IMG_0002.jpg')} />);

    expect(preview().getAttribute('src')).toBe('blob:IMG_0002.jpg');
    expect(spies.revoke?.mock.calls).toStrictEqual([['blob:IMG_0001.jpg']]);
  });

  it('releases the photo once it is no longer shown', () => {
    const { unmount } = render(<PhotoPreview photo={aJpeg('IMG_0001.jpg')} />);

    unmount();

    expect(spies.revoke?.mock.calls).toStrictEqual([['blob:IMG_0001.jpg']]);
  });
});
