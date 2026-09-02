import type { AggregateScore } from './scoring.js';

/**
 * Rendering of the bench result as a Markdown table — the artefact the decision note carries
 * (#10). A document, so it is written in French, unlike the code around it; the winner is
 * still a human call, this only lays the numbers side by side.
 */
export interface ProviderRun {
  readonly provider: string;
  readonly model: string;
  readonly photosScanned: number;
  /** Photos with a ground truth to score against — quality is undefined when this is zero. */
  readonly photosScored: number;
  /** Photos where the adapter threw `ShelfScanFailed`. */
  readonly failures: number;
  readonly score: AggregateScore;
  readonly medianLatencyMs: number;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  /** Total USD across the run, or `null` when the provider did not report usable usage. */
  readonly estimatedCostUsd: number | null;
}

export function renderReport(runs: readonly ProviderRun[]): string {
  const header = `| Métrique | ${runs.map((run) => run.provider).join(' | ')} |`;
  const divider = `|---|${runs.map(() => '---').join('|')}|`;

  const rows: { label: string; cell: (run: ProviderRun) => string }[] = [
    { label: 'Modèle', cell: (run) => `\`${run.model}\`` },
    { label: 'Photos scannées', cell: (run) => String(run.photosScanned) },
    { label: 'Photos notées (vérité terrain)', cell: (run) => String(run.photosScored) },
    { label: 'Échecs adapter', cell: (run) => String(run.failures) },
    { label: 'Rappel', cell: (run) => quality(run, percent(run.score.recall)) },
    { label: 'Précision', cell: (run) => quality(run, percent(run.score.precision)) },
    { label: 'Exactitude auteur', cell: (run) => quality(run, percent(run.score.authorAccuracy)) },
    { label: 'Exactitude titre', cell: (run) => quality(run, percent(run.score.titleAccuracy)) },
    {
      label: 'Erreurs de structuration (auteur/titre permutés)',
      cell: (run) => quality(run, String(run.score.swapped)),
    },
    {
      label: 'Hallucination haute confiance',
      cell: (run) => quality(run, String(run.score.highConfidenceHallucinations)),
    },
    { label: 'Latence médiane', cell: (run) => `${(run.medianLatencyMs / 1000).toFixed(1)} s` },
    {
      label: 'Tokens (prompt / complétion)',
      cell: (run) => `${run.totalPromptTokens} / ${run.totalCompletionTokens}`,
    },
    { label: 'Coût total', cell: (run) => cost(run.estimatedCostUsd) },
    {
      label: 'Coût / scan',
      cell: (run) =>
        run.estimatedCostUsd === null || run.photosScanned === 0
          ? 'n/a'
          : cost(run.estimatedCostUsd / run.photosScanned),
    },
  ];

  const body = rows
    .map((row) => `| ${row.label} | ${runs.map((run) => row.cell(run)).join(' | ')} |`)
    .join('\n');

  const warnings = runs
    .filter((run) => run.photosScored === 0)
    .map(
      (run) =>
        `> ⚠️ **${run.provider}** : aucune photo notée — vérité terrain absente, qualité non mesurée.`,
    );

  return [header, divider, body, ...warnings].join('\n');
}

/** Quality cells collapse to a dash when there is no ground truth to compute them against. */
function quality(run: ProviderRun, value: string): string {
  return run.photosScored === 0 ? '—' : value;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function cost(usd: number | null): string {
  return usd === null ? 'n/a' : `$${usd.toFixed(4)}`;
}
