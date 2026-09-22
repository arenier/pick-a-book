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
  ShelfScanAlreadyProcessed,
  ShelfScanNotFound,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import type { ScanShelfResult, StoreShelfPhotoResult } from '@pick-a-book/recognition-application';
import { ShelfScanFailed } from '@pick-a-book/recognition-domain';

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
  /** The name the browser sent. Recorded for reference, never used to name anything (FR-015). */
  readonly originalname?: string;
}

/** 20 MB, matching what `ShelfPhoto` accepts — rejected by multer before reaching us. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Two routes, one submission: `POST /shelf-photos` keeps the photo, then
 * `POST /shelf-photos/{id}/scan` reads it.
 *
 * Split on purpose (specs/001-photo-upload/research.md §7): the VLM call is the longest
 * (~27 s, docs/decisions/0001) and the most fragile link in the chain, and a single request
 * carrying both would lose a photo the server already had whenever that call broke. The
 * frontend chains the two itself, so the user still sees one action (US1).
 *
 * Handles boundary DTOs only, never a domain object (ADR 0003).
 */
@Controller('shelf-photos')
export class ShelfPhotosController {
  constructor(
    private readonly storeShelfPhoto: StoreShelfPhotoUseCase,
    private readonly scanStoredShelfPhoto: ScanStoredShelfPhotoUseCase,
  ) {}

  /**
   * 201, and the id is the whole answer: a resource does come into being here — the kept
   * photo — and the second call names it.
   */
  @Post()
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async store(@UploadedFile() file?: UploadedImage): Promise<StoreShelfPhotoResult> {
    if (file === undefined) {
      throw new BadRequestException('Send a photo as multipart field "photo"');
    }

    try {
      return await this.storeShelfPhoto.execute({
        bytes: new Uint8Array(file.buffer),
        mediaType: file.mimetype,
        // multer leaves it out for a nameless part; the column is not nullable, and an empty
        // string says exactly what happened without inventing a name.
        originalFilename: file.originalname ?? '',
      });
    } catch (error) {
      // Everything that fails here comes from `ShelfPhoto` refusing the image — an empty
      // body, an oversized file, an unsupported media type. That is a 400, and nothing was
      // kept (FR-013).
      throw new BadRequestException(describe(error));
    }
  }

  /**
   * 200, not 201: the analysis creates no new resource — it fills in the one the first call
   * already made.
   */
  @Post(':id/scan')
  @HttpCode(200)
  async scan(@Param('id') id: string): Promise<ScanShelfResult> {
    try {
      return await this.scanStoredShelfPhoto.execute({ id });
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function toHttpError(error: unknown): Error {
  // A provider that is down or off-contract is not the caller's mistake: 502 names an
  // upstream failure, where 400 would blame the photo.
  if (error instanceof ShelfScanFailed) {
    return new BadGatewayException(error.message);
  }
  if (error instanceof ShelfScanNotFound) {
    return new NotFoundException(error.message);
  }
  // Already scanned: refusing beats overwriting a result, or paying a second time for a VLM
  // call that already answered (research.md §7).
  if (error instanceof ShelfScanAlreadyProcessed) {
    return new ConflictException(error.message);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
