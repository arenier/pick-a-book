import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { env, selectedProviders } from './config.js';
import { loadGroundTruth, loadPhotos } from './io.js';
import { renderReport } from './lib/render.js';
import type { ProviderRun } from './lib/render.js';
import { benchProvider, forEachSequential } from './runner.js';

/**
 * The manual quality bench of the two shelf-scanner adapters (#10, step 6).
 *
 * Live calls, never in CI: it reads the reference photos, sends each to every selected provider,
 * scores the reading against the human-verified ground truth, and writes the metrics table the
 * decision note carries. The photos and the raw output stay out of git; only the ground truth
 * (text) and the decision note are committed.
 *
 * Run it from the repo root, keys in the environment:
 *   nx build bench && node tools/bench/dist/main.js
 */
async function main(): Promise<void> {
  const photosDir = resolve(env('BENCH_PHOTOS_DIR') ?? 'fixtures/reference-photos');
  const truthPath = resolve(env('BENCH_GROUND_TRUTH') ?? 'tools/bench/ground-truth.yaml');
  const outputDir = resolve(env('BENCH_OUTPUT_DIR') ?? 'tools/bench/output');
  const highConfidence = Number(env('BENCH_HIGH_CONFIDENCE') ?? '0.8');

  await mkdir(outputDir, { recursive: true });

  const photos = await loadPhotos(photosDir);
  if (photos.length === 0) {
    throw new Error(`No reference photo in ${photosDir} — see tools/bench/README.md`);
  }
  const truth = await loadGroundTruth(truthPath);
  process.stdout.write(
    `Benching ${photos.length} photos${truth === undefined ? ' (no ground truth — contract only)' : ''}\n`,
  );

  const runs: ProviderRun[] = [];
  await forEachSequential(selectedProviders(), async (spec) => {
    process.stdout.write(`\n== ${spec.name} ==\n`);
    runs.push(await benchProvider(spec, photos, truth, highConfidence, outputDir));
  });

  const report = renderReport(runs);
  await writeFile(join(outputDir, 'report.md'), `${report}\n`, 'utf8');
  process.stdout.write(`\n${report}\n\nWritten to ${join(outputDir, 'report.md')}\n`);
}

await main();
