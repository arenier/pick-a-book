import { useMessages } from '@pick-a-book/shared-i18n';
import { BookTitle, Button } from '@pick-a-book/shared-ui';
import { useCallback } from 'react';

import type { Reference } from '../model/reconciled-book';
import type { AmbiguityChoice } from '../model/reconciliation-failure';

export interface AmbiguityPickerProps {
  /** In the order the catalogue gave them. */
  readonly candidates: readonly Reference[];
  readonly onChoose: (choice: AmbiguityChoice) => void;
}

/**
 * The candidates of an ambiguous book, unfolded on demand: one button for each, and « none of
 * them » (specs/003, US2). The user's word is the last one — the catalogue only proposes.
 */
export function AmbiguityPicker({ candidates, onChoose }: AmbiguityPickerProps) {
  const { t } = useMessages('reconciliation');
  const none = useCallback(() => {
    onChoose({ choice: 'none' });
  }, [onChoose]);

  return (
    <details className="flex flex-col gap-2" open>
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
        {t('pick.label')}
      </summary>
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.recordId}>
            <CandidateButton candidate={candidate} onChoose={onChoose} />
          </li>
        ))}
        <li>
          <Button variant="ghost" className="h-11 w-full justify-start" onClick={none}>
            {t('pick.none')}
          </Button>
        </li>
      </ul>
    </details>
  );
}

function CandidateButton({
  candidate,
  onChoose,
}: {
  readonly candidate: Reference;
  readonly onChoose: (choice: AmbiguityChoice) => void;
}) {
  const { t } = useMessages('reconciliation');
  const { recordId } = candidate;
  const choose = useCallback(() => {
    onChoose({ choice: 'candidate', recordId });
  }, [onChoose, recordId]);

  return (
    <Button
      variant="outline"
      className="h-11 w-full justify-start text-left whitespace-normal"
      onClick={choose}
    >
      <span className="wrap-anywhere">
        <BookTitle>{candidate.title}</BookTitle>
        {candidate.authors.length > 0 && t('book.byAuthors', { authors: candidate.authors })}
      </span>
    </Button>
  );
}
