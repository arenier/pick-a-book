import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ShelfScanFailed } from '@pick-a-book/recognition-domain';
import type { DetectedBook, ShelfScannerPort } from '@pick-a-book/recognition-domain';

import type { ProviderSpec } from './config.js';
import type { GroundTruth } from './lib/ground-truth.js';
import { booksFor } from './lib/ground-truth.js';
import type { ProviderRun } from './lib/render.js';
import { aggregate, scorePhoto } from './lib/scoring.js';
import type { DetectionRecord, PhotoScore } from './lib/scoring.js';
import type { PhotoItem } from './io.js';
import { estimateCost, recordingTransport } from './usage.js';
import type { CallMetrics } from './usage.js';

/** Runs the scans of one provider and gathers everything the report needs from them. */
interface Accumulator {
  readonly scores: PhotoScore[];
  readonly latencies: number[];
  readonly perPhoto: Record<string, unknown>;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  reportedCostUsd: number | null;
  scored: number;
}

/** Runs items one after another — the bench must not fan out and race the rate limits. */
export async function forEachSequential<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  await items.reduce<Promise<void>>(async (chain, item) => {
    await chain;
    await fn(item);
  }, Promise.resolve());
}

export async function benchProvider(
  spec: ProviderSpec,
  photos: readonly PhotoItem[],
  truth: GroundTruth | undefined,
  highConfidence: number,
  outputDir: string,
): Promise<ProviderRun> {
  const { transport, last } = recordingTransport();
  const adapter = spec.adapter(transport);
  const acc = emptyAccumulator();

  await forEachSequential(photos, async (item) => {
    await scanOne(spec.name, adapter, last, acc, item, truth, highConfidence);
  });

  await writeFile(
    join(outputDir, `${spec.name}.json`),
    JSON.stringify(acc.perPhoto, null, 2),
    'utf8',
  );
  return assembleRun(spec, photos.length, acc);
}

async function scanOne(
  providerName: string,
  adapter: ShelfScannerPort,
  last: () => CallMetrics | undefined,
  acc: Accumulator,
  item: PhotoItem,
  truth: GroundTruth | undefined,
  highConfidence: number,
): Promise<void> {
  let records: DetectionRecord[];
  try {
    records = toRecords(await adapter.scan(item.photo));
  } catch (error) {
    if (error instanceof ShelfScanFailed) {
      acc.failures++;
      acc.perPhoto[item.file] = { error: error.message };
      process.stdout.write(`  ${providerName}  ${item.file}  FAILED: ${error.message}\n`);
      return;
    }
    throw error;
  }

  const metrics = last();
  if (metrics !== undefined) {
    applyMetrics(acc, metrics);
  }
  acc.perPhoto[item.file] = { books: records };
  process.stdout.write(`  ${providerName}  ${item.file}  ${records.length} books\n`);

  const reference = truth === undefined ? undefined : booksFor(truth, item.file);
  if (reference !== undefined) {
    acc.scores.push(scorePhoto(records, reference, highConfidence));
    acc.scored++;
  }
}

function applyMetrics(acc: Accumulator, metrics: CallMetrics): void {
  acc.latencies.push(metrics.latencyMs);
  acc.promptTokens += metrics.promptTokens;
  acc.completionTokens += metrics.completionTokens;
  if (metrics.reportedCostUsd === null) {
    acc.reportedCostUsd = null;
  } else if (acc.reportedCostUsd !== null) {
    acc.reportedCostUsd += metrics.reportedCostUsd;
  }
}

function assembleRun(spec: ProviderSpec, scanned: number, acc: Accumulator): ProviderRun {
  return {
    provider: spec.name,
    model: spec.model,
    photosScanned: scanned,
    photosScored: acc.scored,
    failures: acc.failures,
    score: aggregate(acc.scores),
    medianLatencyMs: median(acc.latencies),
    totalPromptTokens: acc.promptTokens,
    totalCompletionTokens: acc.completionTokens,
    estimatedCostUsd: estimateCost(
      spec.name,
      acc.promptTokens,
      acc.completionTokens,
      acc.reportedCostUsd,
    ),
  };
}

function emptyAccumulator(): Accumulator {
  return {
    scores: [],
    latencies: [],
    perPhoto: {},
    failures: 0,
    promptTokens: 0,
    completionTokens: 0,
    reportedCostUsd: 0,
    scored: 0,
  };
}

function toRecords(books: readonly DetectedBook[]): DetectionRecord[] {
  return books.map((book) => ({
    author: book.author.value,
    title: book.title.value,
    confidence: book.confidence.value,
  }));
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
