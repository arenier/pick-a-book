import { Module, type DynamicModule } from '@nestjs/common';
import {
  GetShelfReconciliationUseCase,
  ReconcileDetectedBooksUseCase,
} from '@pick-a-book/bibliography-application';
import { GetShelfScanUseCase } from '@pick-a-book/recognition-application';

import { GetShelfPhotoReconciliationUseCase } from './get-shelf-photo-reconciliation.use-case';
import { ReconcileShelfPhotoUseCase } from './reconcile-shelf-photo.use-case';
import { ShelfPhotoReconciliationController } from './shelf-photo-reconciliation.controller';

/**
 * The orchestrator (ADR 0003): the one place that knows more than one context. It imports the
 * modules of `recognition` and `bibliography`, which each export the use cases that are their
 * way out, and sequences them on boundary DTOs — it carries no rule of either.
 */
@Module({})
export class OrchestrationModule {
  /**
   * Given the two context modules, **the very objects** the root imports: built a second time they
   * could be instantiated a second time, with their own database archive.
   */
  static withContexts(recognition: DynamicModule, bibliography: DynamicModule): DynamicModule {
    return {
      module: OrchestrationModule,
      imports: [recognition, bibliography],
      controllers: [ShelfPhotoReconciliationController],
      providers: [
        {
          provide: ReconcileShelfPhotoUseCase,
          useFactory: (
            getShelfScan: GetShelfScanUseCase,
            reconcile: ReconcileDetectedBooksUseCase,
          ) => new ReconcileShelfPhotoUseCase(getShelfScan, reconcile),
          inject: [GetShelfScanUseCase, ReconcileDetectedBooksUseCase],
        },
        {
          provide: GetShelfPhotoReconciliationUseCase,
          useFactory: (
            getShelfScan: GetShelfScanUseCase,
            getReconciliation: GetShelfReconciliationUseCase,
          ) => new GetShelfPhotoReconciliationUseCase(getShelfScan, getReconciliation),
          inject: [GetShelfScanUseCase, GetShelfReconciliationUseCase],
        },
      ],
    };
  }
}
