import { useMessages } from '@pick-a-book/shared-i18n';
import { Alert, AlertDescription } from '@pick-a-book/shared-ui';

import type { UploadFailure } from '../model/upload-failure';

export interface FailureMessageProps {
  readonly failure: UploadFailure;
}

/**
 * Words a failure for the user (FR-006, FR-009). An explicit table rather than a key built from
 * the kind: each key stays typed, and a new kind of failure does not compile until it is worded
 * here (ADR 0011).
 */
export function FailureMessage({ failure }: FailureMessageProps) {
  const { t } = useMessages('photo-upload');

  const wordings: Record<UploadFailure, () => string> = {
    unsupportedType: () => t('failure.unsupportedType'),
    empty: () => t('failure.empty'),
    tooLarge: () => t('failure.tooLarge'),
    refused: () => t('failure.refused'),
    upstream: () => t('failure.upstream'),
    dailyQuota: () => t('failure.dailyQuota'),
    rateLimited: () => t('failure.rateLimited'),
    offline: () => t('failure.offline'),
    unexpected: () => t('failure.unexpected'),
  };

  return (
    <Alert variant="destructive">
      <AlertDescription>{wordings[failure]()}</AlertDescription>
    </Alert>
  );
}
