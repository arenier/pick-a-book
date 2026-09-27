import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoPicker } from './photo-picker';

const ignore = vi.fn<(file: File | undefined) => void>();

describe('PhotoPicker', () => {
  // FR-001: the camera *or* an existing photo. `capture` makes Chrome Android and Safari iOS
  // open the camera straight away, with no way to reach the gallery.
  it('leaves the choice between camera and gallery to the phone', () => {
    render(<PhotoPicker disabled={false} onPick={ignore} />);

    expect(screen.getByLabelText('Photo de l’étagère').hasAttribute('capture')).toBe(false);
  });

  it('narrows the chooser to the accepted image types', () => {
    render(<PhotoPicker disabled={false} onPick={ignore} />);

    expect(screen.getByLabelText('Photo de l’étagère').getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp,image/heic',
    );
  });
});
