import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
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
import {
  InvalidShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';

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

    try {
      // Rebuilt field by field: whatever else the use case may one day return, the id is
      // the only thing that leaves (FR-015).
      const { id } = await this.storeShelfPhoto.execute(command);
      return { id };
    } catch (error) {
      // `ShelfPhoto` refusing the image — empty, oversized, unsupported — is the caller's
      // mistake: a 400. Anything else (bucket, database) is ours, and stays a 500.
      if (error instanceof InvalidShelfPhoto) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/scan')
  // 200, not the 201 Nest defaults to on a POST: a scan creates nothing.
  @HttpCode(200)
  async scan(@Param('id') id: string): Promise<ScanShelfResult> {
    try {
      return await this.scanStoredShelfPhoto.execute({ id });
    } catch (error) {
      // A provider that is down or off-contract is not the caller's mistake: 502 names an
      // upstream failure, where 400 would blame the photo (FR-006).
      if (error instanceof ShelfScanFailed) {
        throw new BadGatewayException(error.message);
      }
      if (error instanceof ShelfScanNotFound) {
        throw new NotFoundException(error.message);
      }
      // Already completed or failed: scanning again would overwrite a result, or pay for a
      // VLM call nobody asked for (research.md §7).
      if (error instanceof ShelfScanAlreadyProcessed) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
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
