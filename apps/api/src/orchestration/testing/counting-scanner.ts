import type {
  DetectedBook,
  ShelfPhoto,
  ShelfScanFailed,
  ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';
import type { Result } from '@pick-a-book/shared-result';

/** The stub scanner, counting the photos it is given. */
export class CountingScanner implements ShelfScannerPort {
  private readonly inner = new StubShelfScannerAdapter();
  scans = 0;

  async scan(photo: ShelfPhoto): Promise<Result<DetectedBook[], ShelfScanFailed>> {
    this.scans += 1;
    return this.inner.scan(photo);
  }
}
