/**
 * The smaller image of a photo, made by the browser before the upload (specs/002-upload-history,
 * research.md §5). The browser decodes what the server cannot — a HEIC from an iPhone — and the
 * API does no image work at all: no CPU to pay for, no native dependency to ship.
 */

/** 480 px wide: a few dozen KB as a JPEG, enough for a card of the history. */
const THUMBNAIL_WIDTH = 480;

const THUMBNAIL_TYPE = 'image/jpeg';

const THUMBNAIL_QUALITY = 0.7;

/** What the API accepts of a thumbnail (`ShelfPhotoThumbnail`): over it, it would be dropped. */
const MAX_THUMBNAIL_BYTES = 256 * 1024;

export interface ThumbnailCanvas {
  draw(image: ImageBitmap, width: number, height: number): void;
  toBlob(type: string, quality: number): Promise<Blob | null>;
}

/**
 * The browser's decoding and canvas, handed in so a spec can replace them: jsdom has neither.
 * The real ones are checked by hand on a phone (quickstart, scenario 7).
 */
export interface ThumbnailEnvironment {
  createImageBitmap(photo: Blob, options: { imageOrientation: 'from-image' }): Promise<ImageBitmap>;
  createCanvas(width: number, height: number): ThumbnailCanvas;
}

const browserEnvironment: ThumbnailEnvironment = {
  // Called through `globalThis` so that a browser, or a test, without it fails here — where the
  // failure is caught — and not when this module loads.
  createImageBitmap: async (photo, options) => globalThis.createImageBitmap(photo, options),
  createCanvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    return {
      draw: (image, targetWidth, targetHeight) => {
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('no 2d canvas context');
        }
        context.drawImage(image, 0, 0, targetWidth, targetHeight);
      },
      toBlob: async (type, quality) =>
        new Promise((resolve) => {
          canvas.toBlob(resolve, type, quality);
        }),
    };
  },
};

/**
 * A JPEG of 480 px wide, the ratio kept, never enlarged — or nothing at all.
 *
 * Never rejects: whatever goes wrong (a format the browser cannot read, no canvas, a result the
 * API would refuse as too heavy) is « no thumbnail », and the photo goes up without one — the
 * history then shows a neutral indicator (FR-008). A thumbnail is never a reason to hold an
 * upload back.
 *
 * `imageOrientation: 'from-image'` has the browser apply the EXIF rotation: an iPhone photo taken
 * upright must not become a thumbnail on its side.
 */
export async function makeThumbnail(
  photo: Blob,
  environment: ThumbnailEnvironment = browserEnvironment,
): Promise<Blob | undefined> {
  try {
    const image = await environment.createImageBitmap(photo, { imageOrientation: 'from-image' });
    try {
      return await shrink(image, environment);
    } finally {
      // The decoded photo holds its pixels in memory until it is told to let go.
      image.close();
    }
  } catch {
    return undefined;
  }
}

async function shrink(image: ImageBitmap, environment: ThumbnailEnvironment) {
  const width = Math.min(THUMBNAIL_WIDTH, image.width);
  const height = Math.round((image.height * width) / image.width);
  const canvas = environment.createCanvas(width, height);
  canvas.draw(image, width, height);

  const blob = await canvas.toBlob(THUMBNAIL_TYPE, THUMBNAIL_QUALITY);

  return blob !== null && blob.size <= MAX_THUMBNAIL_BYTES ? blob : undefined;
}
