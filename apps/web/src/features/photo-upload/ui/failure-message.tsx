import { useTranslation } from 'react-i18next';

import type { UploadFailure } from '../model/upload-failure';
import styles from './photo-upload-screen.module.css';

export interface FailureMessageProps {
  readonly failure: UploadFailure;
}

/**
 * Words a failure for the user (FR-006, FR-009). An explicit table rather than a key built from
 * the kind: each key stays typed, and a new kind of failure does not compile until it is worded
 * here (ADR 0011).
 */
export function FailureMessage({ failure }: FailureMessageProps) {
  const { t } = useTranslation('photo-upload');

  const wordings: Record<UploadFailure, () => string> = {
    unsupportedType: () => t('failure.unsupportedType'),
    empty: () => t('failure.empty'),
    tooLarge: () => t('failure.tooLarge'),
    refused: () => t('failure.refused'),
    upstream: () => t('failure.upstream'),
    offline: () => t('failure.offline'),
    unexpected: () => t('failure.unexpected'),
  };

  return (
    <p role="alert" className={styles['error']}>
      {wordings[failure]()}
    </p>
  );
}
