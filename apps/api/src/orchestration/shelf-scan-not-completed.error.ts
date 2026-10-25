/**
 * The analysis exists but did not complete — it is pending or failed — so it has no detected
 * books to reconcile. An error of the orchestrator, not of either context: only it knows both
 * (specs/003, data-model.md §Orchestration).
 */
export class ShelfScanNotCompleted extends Error {
  readonly kind = 'shelf-scan-not-completed';

  constructor(readonly scanId: string) {
    super(`Shelf scan not completed: ${scanId}`);
    this.name = 'ShelfScanNotCompleted';
  }
}
