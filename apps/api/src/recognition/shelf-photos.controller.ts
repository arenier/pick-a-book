import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
  type ScanShelfResult,
  type StoreShelfPhotoCommand,
  type StoreShelfPhotoResult,
} from '@pick-a-book/recognition-application';

/**
 * The subset of an uploaded file this controller needs.
 *
 * Declared here rather than imported from Express's multer typings: the controller has no
 * reason to know the rest of that shape, and a local interface keeps the tests free of a
 * framework fixture.
 */
export interface UploadedImage {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
}

/** JSON alternative to multipart, for callers that would rather post base64. */
export interface StoreShelfPhotoRequestBody {
  readonly image: string;
  readonly mediaType: string;
  readonly filename?: string;
}

/** 20 MB, matching what `ShelfPhoto` accepts — rejected by multer before reaching us. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * A shelf photo is scanned in two requests (specs/001-photo-upload, research.md §7):
 *
 * - `POST /shelf-photos` keeps the photo and answers with its id;
 * - `POST /shelf-photos/{id}/scan` runs the VLM on the photo already kept.
 *
 * Two steps so that the photo is safe before the longest and most failure-prone call of the
 * chain (FR-014). Handles boundary DTOs only, never a domain object (ADR 0003).
 */
@Controller('shelf-photos')
export class ShelfPhotosController {
  constructor(
    private readonly storeShelfPhoto: StoreShelfPhotoUseCase,
    private readonly scanStoredShelfPhoto: ScanStoredShelfPhotoUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async store(
    @UploadedFile() file?: UploadedImage,
    @Body() body?: StoreShelfPhotoRequestBody,
  ): Promise<StoreShelfPhotoResult> {
    const command = readImage(file, body);

    try {
      // Rebuilt field by field: whatever else the use case may one day return, the id is
      // the only thing that leaves (FR-015).
      const { id } = await this.storeShelfPhoto.execute(command);
      return { id };
    } catch (error) {
      // At this point, a failure is `ShelfPhoto` refusing the image — an empty body, an
      // oversized file, an unsupported media type. That is a 400.
      throw new BadRequestException(describe(error));
    }
  }

  @Post(':id/scan')
  // 200, not the 201 Nest defaults to on a POST: a scan creates nothing.
  @HttpCode(200)
  async scan(@Param('id') id: string): Promise<ScanShelfResult> {
    return this.scanStoredShelfPhoto.execute({ id });
  }
}

function readImage(
  file: UploadedImage | undefined,
  body: StoreShelfPhotoRequestBody | undefined,
): StoreShelfPhotoCommand {
  if (file !== undefined) {
    return {
      bytes: new Uint8Array(file.buffer),
      mediaType: file.mimetype,
      originalFilename: file.originalname,
    };
  }

  if (body === undefined || typeof body.image !== 'string' || typeof body.mediaType !== 'string') {
    throw new BadRequestException(
      'Send a photo, either as multipart field "photo" or as JSON {"image": "<base64>", "mediaType": "image/jpeg"}',
    );
  }

  return {
    bytes: decodeBase64(body.image),
    mediaType: body.mediaType,
    originalFilename: typeof body.filename === 'string' ? body.filename : '',
  };
}

/**
 * `Buffer.from(…, 'base64')` never throws: it drops whatever it cannot decode, so garbage in
 * gives a short buffer rather than an error. Re-encoding and comparing is what turns that
 * silence into a 400.
 */
function decodeBase64(value: string): Uint8Array {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value.replaceAll(/\s/gu, '')) {
    throw new BadRequestException('The "image" field is not valid base64');
  }

  return new Uint8Array(decoded);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
