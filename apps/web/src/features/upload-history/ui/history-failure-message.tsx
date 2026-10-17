import { useMessages } from '@pick-a-book/shared-i18n';
import { Alert, AlertDescription } from '@pick-a-book/shared-ui';

import type { HistoryFailure } from '../model/history-state';

export interface HistoryFailureMessageProps {
  readonly failure: HistoryFailure;
}

/**
 * Words a failure to load for the user (FR-010, FR-014). An explicit table rather than a key built
 * from the kind: each key stays typed, and a new kind does not compile until it is worded here
 * (ADR 0011). Never says « nothing here »: the history could not be read, which is another thing.
 */
export function HistoryFailureMessage({ failure }: HistoryFailureMessageProps) {
  const { t } = useMessages('upload-history');

  const wordings: Record<HistoryFailure, () => string> = {
    offline: () => t('failure.offline'),
    rateLimited: () => t('failure.rateLimited'),
    unexpected: () => t('failure.unexpected'),
  };

  return (
    <Alert variant="destructive">
      <AlertDescription>{wordings[failure]()}</AlertDescription>
    </Alert>
  );
}
