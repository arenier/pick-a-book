import { useCallback } from 'react';

import { useMessages } from '@pick-a-book/shared-i18n';
import { Badge, BookTitle } from '@pick-a-book/shared-ui';

import type { ReadByRecognition, ReconciledBook, Reference } from '../model/reconciled-book';
import type { AmbiguityChoice, ReconciliationFailure } from '../model/reconciliation-failure';
import { AmbiguityPicker } from './ambiguity-picker';
import { FailureMessage } from './failure-message';

export interface ReconciledBookItemProps {
  readonly book: ReconciledBook;
  /** Records the user's choice for an ambiguous book. */
  readonly onChoose: (position: number, choice: AmbiguityChoice) => void;
  /** Shown under the choice when it could not be recorded. */
  readonly refusal?: ReconciliationFailure | undefined;
}

/**
 * One book of the list: the reference form when the catalogue confirmed it — and what was read
 * after it, if that differs —, what was read otherwise, and its status (specs/003, US1).
 */
export function ReconciledBookItem({ book, onChoose, refusal }: ReconciledBookItemProps) {
  const { t } = useMessages('reconciliation');
  const shown = book.status === 'confirmed' ? book.reference : undefined;
  const { position } = book;
  const choose = useCallback(
    (choice: AmbiguityChoice) => {
      onChoose(position, choice);
    },
    [onChoose, position],
  );

  return (
    <li className="flex flex-col gap-1">
      <span className="wrap-anywhere">
        {shown === undefined ? <Read read={book.read} /> : <Referenced reference={shown} />}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge book={book} />
        {book.status === 'confirmed' && book.titleOnly && (
          <span className="text-sm text-muted-foreground">{t('titleOnly')}</span>
        )}
      </span>
      {book.status === 'confirmed' && differs(book.read, book.reference) && (
        <span className="text-sm wrap-anywhere text-muted-foreground">
          <ReadMention read={book.read} />
        </span>
      )}
      {book.status === 'ambiguous' && (
        <AmbiguityPicker candidates={book.candidates} onChoose={choose} />
      )}
      {refusal !== undefined && <FailureMessage failure={refusal} />}
    </li>
  );
}

/** The title as read, then its author when there was one. */
function Read({ read }: { readonly read: ReadByRecognition }) {
  const { t } = useMessages('reconciliation');

  return (
    <>
      <BookTitle>{read.title}</BookTitle>
      {read.author !== undefined && t('book.byAuthor', { author: read.author })}
    </>
  );
}

function Referenced({ reference }: { readonly reference: Reference }) {
  const { t } = useMessages('reconciliation');

  return (
    <>
      <BookTitle>{reference.title}</BookTitle>
      {reference.authors.length > 0 && t('book.byAuthors', { authors: reference.authors })}
    </>
  );
}

function ReadMention({ read }: { readonly read: ReadByRecognition }) {
  const { t } = useMessages('reconciliation');

  return read.author === undefined
    ? t('read.titleOnly', { title: read.title })
    : t('read.withAuthor', { title: read.title, author: read.author });
}

function StatusBadge({ book }: { readonly book: ReconciledBook }) {
  const { t } = useMessages('reconciliation');
  // An explicit table rather than a key built from the status: each key stays typed (ADR 0011).
  const words: Record<ReconciledBook['status'], () => string> = {
    checking: () => t('status.checking'),
    pending: () => t('status.checking'),
    confirmed: () => t('status.confirmed'),
    ambiguous: () => t('status.ambiguous'),
    not_found: () => t('status.notFound'),
    not_verified: () => t('status.notVerified'),
  };

  return (
    <Badge variant={book.status === 'confirmed' ? 'default' : 'outline'}>
      {words[book.status]()}
    </Badge>
  );
}

/** Whether the reference says something other than what was read, accents and case aside. */
function differs(read: ReadByRecognition, reference: Reference): boolean {
  return (
    simplified(read.title) !== simplified(reference.title) ||
    simplified(read.author ?? '') !== simplified(reference.authors.join(' '))
  );
}

function simplified(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}
