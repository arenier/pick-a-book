import { useMessages } from '@pick-a-book/shared-i18n';
import { Alert, AlertDescription } from '@pick-a-book/shared-ui';

import type { ReconciliationFailure } from '../model/reconciliation-failure';

/** Why a check could not take place, in words — the kind is the model's, the sentence the catalogue's. */
export function FailureMessage({ failure }: { readonly failure: ReconciliationFailure }) {
  const { t } = useMessages('reconciliation');
  // An explicit table rather than a key built from the kind: each key stays typed (ADR 0011).
  const words: Record<ReconciliationFailure, () => string> = {
    offline: () => t('failure.offline'),
    rateLimited: () => t('failure.rateLimited'),
    unexpected: () => t('failure.unexpected'),
  };

  return (
    <Alert variant="destructive">
      <AlertDescription>{words[failure]()}</AlertDescription>
    </Alert>
  );
}
