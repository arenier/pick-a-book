import { describe, expect, it, vi } from 'vitest';

import { makeThumbnail, type ThumbnailEnvironment } from './make-thumbnail';

const aPhoto = () => new File([new Uint8Array([1, 2, 3])], 'IMG_0001.jpg', { type: 'image/jpeg' });

/**
 * The browser's own decoding and canvas, replaced (specs/002-upload-history, research.md §5):
 * jsdom has neither, and what matters here is what is asked of them. The real thing is checked by
 * hand on a phone (quickstart, scenario 7).
 */
function anEnvironment(
  options: {
    readonly size?: { readonly width: number; readonly height: number };
    readonly blob?: Blob | null;
  } = {},
) {
  const { size = { width: 1200, height: 800 }, blob = new Blob([new Uint8Array(40_000)]) } =
    options;
  const bitmap = { ...size, close: vi.fn<() => void>() };
  const canvas = {
    draw: vi.fn<(image: typeof bitmap, width: number, height: number) => void>(),
    toBlob: vi.fn<(type: string, quality: number) => Promise<Blob | null>>(async () => blob),
  };
  const environment = {
    createImageBitmap: vi.fn<ThumbnailEnvironment['createImageBitmap']>(async () => bitmap),
    createCanvas: vi.fn<ThumbnailEnvironment['createCanvas']>(() => canvas),
  } satisfies ThumbnailEnvironment;

  return { environment, bitmap, canvas };
}

describe('makeThumbnail, the size', () => {
  it('is 480 px wide, the ratio kept', async () => {
    const { environment, canvas, bitmap } = anEnvironment({ size: { width: 1200, height: 800 } });

    await makeThumbnail(aPhoto(), environment);

    expect(environment.createCanvas).toHaveBeenCalledWith(480, 320);
    expect(canvas.draw).toHaveBeenCalledWith(bitmap, 480, 320);
  });

  it('keeps the ratio of a portrait photo', async () => {
    const { environment } = anEnvironment({ size: { width: 800, height: 1200 } });

    await makeThumbnail(aPhoto(), environment);

    expect(environment.createCanvas).toHaveBeenCalledWith(480, 720);
  });

  it('never enlarges a photo already smaller than that', async () => {
    const { environment } = anEnvironment({ size: { width: 300, height: 200 } });

    await makeThumbnail(aPhoto(), environment);

    expect(environment.createCanvas).toHaveBeenCalledWith(300, 200);
  });
});

describe('makeThumbnail, the image', () => {
  it('is a JPEG of quality 0.7', async () => {
    const { environment, canvas } = anEnvironment();

    await makeThumbnail(aPhoto(), environment);

    expect(canvas.toBlob).toHaveBeenCalledWith('image/jpeg', 0.7);
  });

  // An iPhone photo carries its orientation in EXIF: a thumbnail on its side would be a bug.
  it('asks the browser to apply the orientation of the photo', async () => {
    const { environment } = anEnvironment();
    const photo = aPhoto();

    await makeThumbnail(photo, environment);

    expect(environment.createImageBitmap).toHaveBeenCalledWith(photo, {
      imageOrientation: 'from-image',
    });
  });

  it('answers the blob the canvas made', async () => {
    const blob = new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' });
    const { environment } = anEnvironment({ blob });

    await expect(makeThumbnail(aPhoto(), environment)).resolves.toBe(blob);
  });

  it('lets go of the decoded photo, which holds its pixels in memory', async () => {
    const { environment, bitmap } = anEnvironment();

    await makeThumbnail(aPhoto(), environment);

    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

// The upload never waits on this: no thumbnail is a thumbnail the history shows a neutral
// indicator for, not a photo that cannot be sent (research.md §5).
describe('makeThumbnail, when it cannot', () => {
  it('answers nothing when the browser cannot decode the photo', async () => {
    const { environment } = anEnvironment();
    environment.createImageBitmap.mockRejectedValue(new Error('cannot decode image/heic'));

    await expect(makeThumbnail(aPhoto(), environment)).resolves.toBeUndefined();
  });

  it('answers nothing when the canvas gives no image', async () => {
    const { environment } = anEnvironment({ blob: null });

    await expect(makeThumbnail(aPhoto(), environment)).resolves.toBeUndefined();
  });

  it('answers nothing for a result over 256 KB, which the API would refuse', async () => {
    const { environment } = anEnvironment({ blob: new Blob([new Uint8Array(262_145)]) });

    await expect(makeThumbnail(aPhoto(), environment)).resolves.toBeUndefined();
  });

  it('keeps a result of exactly 256 KB', async () => {
    const { environment } = anEnvironment({ blob: new Blob([new Uint8Array(262_144)]) });

    expect((await makeThumbnail(aPhoto(), environment))?.size).toBe(262_144);
  });

  it('answers nothing when there is no browser API to ask — as in a test, or an old browser', async () => {
    await expect(makeThumbnail(aPhoto())).resolves.toBeUndefined();
  });
});
