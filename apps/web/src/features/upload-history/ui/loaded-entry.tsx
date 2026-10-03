import { useMemo } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { FallbackImage } from '@pick-a-book/shared-ui';

import { photoUrl, thumbnailUrl } from '../api/history-api';
import type { DetectedBook } from '../model/detected-book';
import type { HistoryEntry } from '../model/history-entry';
import type { RescanState } from '../model/history-state';
import { DetectedBooksList } from './detected-books-list';
import { RescanControls } from './rescan-controls';

export interface LoadedEntryProps {
  readonly entry: HistoryEntry;
  readonly books: readonly DetectedBook[] | undefined;
  readonly rescan: RescanState;
  readonly onRescan: () => void;
}

export function LoadedEntry({ entry, books, rescan, onRescan }: LoadedEntryProps) {
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
      {books === undefined ? (
        <>
          <NoBooks entry={entry} />
          <RescanControls state={rescan} onRescan={onRescan} />
        </>
      ) : (
        <DetectedBooksList books={books} />
      )}
    </>
  );
}

/** Why an upload has no books to list: its analysis failed, or never started. */
function NoBooks({ entry }: { readonly entry: HistoryEntry }) {
  const { t } = useMessages('upload-history');

  return <p>{entry.outcome.kind === 'failed' ? t('detail.failed') : t('detail.notStarted')}</p>;
}
