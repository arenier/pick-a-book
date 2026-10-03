import { useMessages } from '@pick-a-book/shared-i18n';
import { Alert, AlertDescription, Button, Spinner } from '@pick-a-book/shared-ui';

import type { RescanFailure, RescanState } from '../model/history-state';

export interface RescanControlsProps {
  readonly state: RescanState;
  readonly onRescan: () => void;
}

/**
 * The way to run an analysis again, for an upload that has nothing to show
 * (specs/002-upload-history, US3): the button, the wait, and why it did not work. The button stays
 * after a failure — the next try is the user's — and is disabled while an analysis runs, since a
 * second one would pay for a call only one of them can keep.
 */
export function RescanControls({ state, onRescan }: RescanControlsProps) {
  const { t } = useMessages('upload-history');
  const running = state === 'running';

  return (
    <div className="flex flex-col gap-3">
      {typeof state === 'object' && <RescanFailureMessage failure={state.failure} />}
      <Button className="w-full" disabled={running} onClick={onRescan}>
        {t('rescan.button')}
      </Button>
      {running && (
        // The VLM call takes around 30 s (docs/decisions/0001): saying so keeps a user from
        // reading the wait as a hang.
        <output className="flex items-start gap-2">
          <Spinner className="mt-1 shrink-0" />
          {t('rescan.running')}
        </output>
      )}
    </div>
  );
}

/** Words why an analysis did not run again — a table, so a new kind does not compile unworded. */
function RescanFailureMessage({ failure }: { readonly failure: RescanFailure }) {
  const { t } = useMessages('upload-history');

  const wordings: Record<RescanFailure, () => string> = {
    upstream: () => t('rescan.failure.upstream'),
    dailyQuota: () => t('rescan.failure.dailyQuota'),
    inProgress: () => t('rescan.failure.inProgress'),
    rateLimited: () => t('rescan.failure.rateLimited'),
    offline: () => t('rescan.failure.offline'),
    unexpected: () => t('rescan.failure.unexpected'),
  };

  return (
    <Alert variant="destructive">
      <AlertDescription>{wordings[failure]()}</AlertDescription>
    </Alert>
  );
}
