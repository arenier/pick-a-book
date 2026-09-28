import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoPicker } from './photo-picker';

const aJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'IMG_0001.jpg', {
  type: 'image/jpeg',
});

const accepted = ['image/jpeg', 'image/png'] as const;
const ignore = vi.fn<(photo: File | undefined) => void>();

function renderPicker(onPick = vi.fn<(photo: File | undefined) => void>()) {
  render(
    <PhotoPicker label="Photo de l’étagère" accept={accepted} disabled={false} onPick={onPick} />,
  );
  return { onPick, input: screen.getByLabelText('Photo de l’étagère') };
}

describe('PhotoPicker', () => {
  // `capture` makes Chrome Android and Safari iOS open the camera straight away, with no way to
  // reach the gallery: without it, the phone offers both.
  it('leaves the choice between camera and gallery to the phone', () => {
    const { input } = renderPicker();

    expect(input.getAttribute('type')).toBe('file');
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('narrows the chooser to the accepted types', () => {
    const { input } = renderPicker();

    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png');
  });

  it('hands over the chosen photo', () => {
    const { input, onPick } = renderPicker();

    fireEvent.change(input, { target: { files: [aJpeg] } });

    expect(onPick).toHaveBeenCalledExactlyOnceWith(aJpeg);
  });

  it('hands over nothing when the choice is cancelled', () => {
    const { input, onPick } = renderPicker();

    fireEvent.change(input, { target: { files: [] } });

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('can be disabled', () => {
    render(<PhotoPicker label="Photo" accept={accepted} disabled onPick={ignore} />);

    expect(screen.getByLabelText('Photo')).toHaveProperty('disabled', true);
  });
});
