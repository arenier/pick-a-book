import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  GetShelfPhotoImageUseCase,
  GetShelfScanUseCase,
  ListShelfScansUseCase,
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
  type ScanShelfResult,
  type ShelfScanDetailDto,
  type ShelfScanPageDto,
  type StoreShelfPhotoCommand,
  type StoreShelfPhotoResult,
} from '@pick-a-book/recognition-application';
import { ShelfPhotoStorageFailed } from '@pick-a-book/recognition-infrastructure';
import type { Result } from '@pick-a-book/shared-result';

import { ImmutablePrivateCacheInterceptor } from '../http/immutable-private-cache.interceptor';
import { toHttpException, type RecognitionError } from './recognition-http-error';

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

/**
 * The files of the multipart form of an upload: the photo, and the thumbnail the browser made of
 * it, if it could (specs/002-upload-history, contracts §5). Multer hands each field over as a
 * list.
 */
export interface UploadedFields {
  readonly photo?: readonly UploadedImage[];
  readonly thumbnail?: readonly UploadedImage[];
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
 * The use cases answer with a `Result` (ADR 0013): a failure of the context is an `Err`, and
 * `toHttpException` says it in HTTP, for every route at once. What is not an `Err` — a bucket
 * or a database that fails — is left to throw, for the global filter of the API to catch.
 */
@Controller('shelf-photos')
export class ShelfPhotosController {
  private readonly logger = new Logger(ShelfPhotosController.name);

  constructor(
    private readonly storeShelfPhoto: StoreShelfPhotoUseCase,
    private readonly scanStoredShelfPhoto: ScanStoredShelfPhotoUseCase,
    private readonly listShelfScans: ListShelfScansUseCase,
    private readonly getShelfPhotoImage: GetShelfPhotoImageUseCase,
    private readonly getShelfScan: GetShelfScanUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      // 20 MB for the photo; the thumbnail is judged by the domain (256 KB), which keeps the
      // photo and drops it when it is too heavy — it is never a reason to refuse the upload.
      { limits: { fileSize: MAX_UPLOAD_BYTES } },
    ),
  )
  async store(@UploadedFiles() files?: UploadedFields): Promise<StoreShelfPhotoResult> {
    const command = readUpload(files);

    // Rebuilt field by field: whatever else the use case may one day return, the id is the
    // only thing that leaves (FR-015). A thumbnail it dropped is for the logs, not the caller.
    const { id, ignoredThumbnail } = this.orRespondWithError(
      await this.storeShelfPhoto.execute(command),
    );
    if (ignoredThumbnail !== undefined) {
      this.logger.warn(`Thumbnail of ${id} ignored: ${ignoredThumbnail}`);
    }

    return { id };
  }

  /** One page of the history, newest first (contracts §1). Reads only. */
  @Get()
  async list(
    @Query('limit') limit?: unknown,
    @Query('cursor') cursor?: unknown,
  ): Promise<ShelfScanPageDto> {
    return this.orRespondWithError(
      await this.listShelfScans.execute({
        limit: readLimit(limit),
        cursor: typeof cursor === 'string' ? cursor : undefined,
      }),
    );
  }

  /** The thumbnail of a scan, straight from the bucket (contracts §4). */
  @Get(':id/thumbnail')
  @UseInterceptors(ImmutablePrivateCacheInterceptor)
  async thumbnail(@Param('id') id: string): Promise<StreamableFile> {
    return this.sendImage(id, 'thumbnail');
  }

  /** The photo as it was sent, straight from the bucket (contracts §3). */
  @Get(':id/photo')
  @UseInterceptors(ImmutablePrivateCacheInterceptor)
  async photo(@Param('id') id: string): Promise<StreamableFile> {
    return this.sendImage(id, 'photo');
  }

  /** How an upload ended and, if it completed, its books (contracts §2). Reads only. */
  @Get(':id')
  async detail(@Param('id') id: string): Promise<ShelfScanDetailDto> {
    return this.orRespondWithError(await this.getShelfScan.execute({ id }));
  }

  @Post(':id/scan')
  // 200, not the 201 Nest defaults to on a POST: a scan creates nothing.
  @HttpCode(200)
  async scan(@Param('id') id: string): Promise<ScanShelfResult> {
    return this.orRespondWithError(await this.scanStoredShelfPhoto.execute({ id }));
  }

  /**
   * An image of a scan, as a response. A bucket that lost it is the one failure of the context
   * the domain does not name (ADR 0013), yet the contract tells it from any other: 502, where
   * the `<img>` falls back like for any image that fails to load (contracts §3). The detail goes
   * to the logs; the caller only learns that the storage is unavailable.
   */
  private async sendImage(id: string, kind: 'photo' | 'thumbnail'): Promise<StreamableFile> {
    try {
      const image = this.orRespondWithError(await this.getShelfPhotoImage.execute({ id, kind }));

      return new StreamableFile(image.bytes, { type: image.mediaType });
    } catch (error) {
      if (error instanceof ShelfPhotoStorageFailed) {
        this.logger.error(error.message, error.stack);
        throw new BadGatewayException('The photo storage is unavailable');
      }

      throw error;
    }
  }

  /**
   * The value of a success, or the HTTP exception of a failure. The provider's own answer
   * — which can name a key, a quota or a model — goes to the logs, since the caller only
   * gets a generic message (contracts/scan-api.md §2).
   */
  private orRespondWithError<T>(result: Result<T, RecognitionError>): T {
    if (result.ok) {
      return result.value;
    }
    if (result.error.kind === 'shelf-scan-failed') {
      this.logger.error(result.error.message, result.error.stack);
    }

    throw toHttpException(result.error);
  }
}

/**
 * Multipart only (contracts/scan-api.md §1). No photo means nothing to store: a 400, whatever
 * else the body carries. The thumbnail is optional, and goes through as it came.
 */
function readUpload(files: UploadedFields | undefined): StoreShelfPhotoCommand {
  const photo = files?.photo?.at(0);
  if (photo === undefined) {
    throw new BadRequestException('Send the photo as the multipart field "photo"');
  }
  const thumbnail = files?.thumbnail?.at(0);

  return {
    bytes: new Uint8Array(photo.buffer),
    mediaType: photo.mimetype,
    originalFilename: photo.originalname,
    ...(thumbnail === undefined
      ? {}
      : { thumbnail: { bytes: new Uint8Array(thumbnail.buffer), mediaType: thumbnail.mimetype } }),
  };
}

/**
 * The page size of a query string: absent, or the number it spells. Anything else — text, an
 * empty value, a parameter given twice — is `NaN`, which the use case refuses as a bad page
 * size, so the 400 is the domain's word and not an HTTP convention of ours.
 */
function readLimit(raw: unknown): number | undefined {
  if (raw === undefined) {
    return undefined;
  }

  return typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
}
