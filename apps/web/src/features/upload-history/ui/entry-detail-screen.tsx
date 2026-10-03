import { useCallback, useMemo } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { Button, FallbackImage, Spinner, buttonVariants, cn } from '@pick-a-book/shared-ui';

import { getShelfScan, photoUrl, thumbnailUrl } from '../api/history-api';
import type { DetectedBook } from '../model/detected-book';
import type { HistoryEntry } from '../model/history-entry';
import { DetectedBooksList } from './detected-books-list';
import { HistoryFailureMessage } from './history-failure-message';
import { useEntryDetail, type LoadDetail } from './use-entry-detail';

export interface EntryDetailScreenProps {
  /** The upload to show — the one the route names. */
  readonly id: string;
  /** Loads it; injected by the specs, the real API client otherwise. */
  readonly load?: LoadDetail;
}

const loadFromApi: LoadDetail = async (id) => getShelfScan(id);

/**
 * One upload of the history: its photo, and what the analysis found on it
 * (specs/002-upload-history, US2, FR-007, FR-008). Opened by a link of the history, or directly
 * from a pasted address — an upload that is not there has its own message, apart from a server
 * that cannot be reached.
 */
export function EntryDetailScreen({ id, load = loadFromApi }: EntryDetailScreenProps) {
  const { t } = useMessages('upload-history');
  const { state, reload } = useEntryDetail(id, load);
  const onRetry = useCallback(() => {
    void reload();
  }, [reload]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <a className={cn(buttonVariants({ variant: 'outline' }), 'w-full')} href="#/historique">
        {t('detail.back')}
      </a>
      {state.status === 'loading' && (
        <output className="flex items-start gap-2">
          <Spinner className="mt-1 shrink-0" />
          {t('detail.loading')}
        </output>
      )}
      {state.status === 'notFound' && <p>{t('detail.notFound')}</p>}
      {state.status === 'error' && (
        <>
          <HistoryFailureMessage failure={state.failure} />
          <Button variant="outline" className="w-full" onClick={onRetry}>
            {t('detail.retry')}
          </Button>
        </>
      )}
      {state.status === 'loaded' && <LoadedEntry entry={state.entry} books={state.books} />}
    </section>
  );
}

interface LoadedEntryProps {
  readonly entry: HistoryEntry;
  readonly books: readonly DetectedBook[] | undefined;
}

function LoadedEntry({ entry, books }: LoadedEntryProps) {
  const { t } = useMessages('upload-history');
  // The photo first; then its thumbnail, which still shows the shelf, if there is one; then the
  // neutral indicator. A HEIC a browser cannot draw, or a photo the bucket lost, never leaves a
  // broken image (FR-008).
  const sources = useMemo(
    () =>
      entry.hasThumbnail ? [photoUrl(entry.id), thumbnailUrl(entry.id)] : [photoUrl(entry.id)],
    [entry.hasThumbnail, entry.id],
  );

  return (
    <>
      <time className="text-sm text-muted-foreground" dateTime={entry.sentAt.toISOString()}>
        {t('entry.sentAt', { date: entry.sentAt })}
      </time>
      <FallbackImage
        className="max-h-[70vh] w-full rounded-lg object-contain"
        sources={sources}
        alt={t('detail.photo')}
        placeholderLabel={t('detail.photoUnavailable')}
      />
      {books === undefined ? <NoBooks entry={entry} /> : <DetectedBooksList books={books} />}
    </>
  );
}

/** Why an upload has no books to list: its analysis failed, or never started. */
function NoBooks({ entry }: { readonly entry: HistoryEntry }) {
  const { t } = useMessages('upload-history');

  return <p>{entry.outcome.kind === 'failed' ? t('detail.failed') : t('detail.notStarted')}</p>;
}
