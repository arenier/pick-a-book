import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScanShelfUseCase } from '@pick-a-book/recognition-application';
import type { ScanShelfResult } from '@pick-a-book/recognition-application';
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
}

/** JSON alternative to multipart, for callers that would rather post base64. */
export interface ScanRequestBody {
  readonly image: string;
  readonly mediaType: string;
}

/** 20 MB, matching what `ShelfPhoto` accepts — rejected by multer before reaching us. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * `POST /scan` — a shelf photo in, the (author, title, confidence) triples out.
 *
 * Handles boundary DTOs only, never a domain object (ADR 0003): the use case takes bytes and
 * a media type, and gives back a plain result that serialises as is.
 *
 * The photo is ephemeral in V1 — bytes in, JSON out, nothing persisted. Storing scans is a
 * later concern, and the bucket is not involved here.
 */
@Controller('scan')
export class ScanController {
  constructor(private readonly scanShelf: ScanShelfUseCase) {}

  @Post()
  // 200, not the 201 Nest defaults to on a POST: a scan creates nothing. The verb is POST
  // because a photo travels in the body, not because a resource comes into being.
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async scan(
    @UploadedFile() file?: UploadedImage,
    @Body() body?: ScanRequestBody,
  ): Promise<ScanShelfResult> {
    const { bytes, mediaType } = readImage(file, body);

    try {
      return await this.scanShelf.execute({ bytes, mediaType });
    } catch (error) {
      // A provider that is down or off-contract is not the caller's mistake: 502 names an
      // upstream failure, where 400 would blame the photo.
      if (error instanceof ShelfScanFailed) {
        throw new BadGatewayException(error.message);
      }
      // Everything else at this point comes from `ShelfPhoto` refusing the image — an empty
      // body, an oversized file, an unsupported media type. That is a 400.
      throw new BadRequestException(describe(error));
    }
  }
}

function readImage(
  file: UploadedImage | undefined,
  body: ScanRequestBody | undefined,
): { bytes: Uint8Array; mediaType: string } {
  if (file !== undefined) {
    return { bytes: new Uint8Array(file.buffer), mediaType: file.mimetype };
  }

  if (body === undefined || typeof body.image !== 'string' || typeof body.mediaType !== 'string') {
    throw new BadRequestException(
      'Send a photo, either as multipart field "photo" or as JSON {"image": "<base64>", "mediaType": "image/jpeg"}',
    );
  }

  return { bytes: decodeBase64(body.image), mediaType: body.mediaType };
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
