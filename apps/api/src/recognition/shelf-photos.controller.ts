import {
  BadRequestException,
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
 *
 * The errors of the context cross it untranslated: `RecognitionExceptionFilter` says them in
 * HTTP, for every route at once.
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
  async store(@UploadedFile() file?: UploadedImage): Promise<StoreShelfPhotoResult> {
    const command = readImage(file);

    // Rebuilt field by field: whatever else the use case may one day return, the id is the
    // only thing that leaves (FR-015).
    const { id } = await this.storeShelfPhoto.execute(command);
    return { id };
  }

  @Post(':id/scan')
  // 200, not the 201 Nest defaults to on a POST: a scan creates nothing.
  @HttpCode(200)
  async scan(@Param('id') id: string): Promise<ScanShelfResult> {
    return this.scanStoredShelfPhoto.execute({ id });
  }
}

/**
 * Multipart only (contracts/scan-api.md §1). No file means nothing to store: a 400, whatever
 * else the body carries.
 */
function readImage(file: UploadedImage | undefined): StoreShelfPhotoCommand {
  if (file === undefined) {
    throw new BadRequestException('Send the photo as the multipart field "photo"');
  }

  return {
    bytes: new Uint8Array(file.buffer),
    mediaType: file.mimetype,
    originalFilename: file.originalname,
  };
}
