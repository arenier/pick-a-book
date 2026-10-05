import { useMemo } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { FallbackImage } from '@pick-a-book/shared-ui';

import { thumbnailUrl } from '../../api/history-api';
import type { HistoryEntry, HistoryOutcome } from '../../model/history-entry';

export interface HistoryEntryCardProps {
  readonly entry: HistoryEntry;
}

/**
 * One upload of the history: a thumbnail, when it was sent, how its analysis ended — and a link to
 * its detail (specs/002-upload-history, US1, FR-004, FR-005, FR-008). The whole card is the link, a
 * target far wider than 44 px.
 */
export function HistoryEntryCard({ entry }: HistoryEntryCardProps) {
  const { t } = useMessages('upload-history');
  // Stable between renders: a new list would look like a new image to load.
  const sources = useMemo(
    () => (entry.hasThumbnail ? [thumbnailUrl(entry.id)] : []),
    [entry.hasThumbnail, entry.id],
  );

  return (
    <a
      className="flex min-h-11 items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
      href={`#/historique/${entry.id}`}
    >
      <FallbackImage
        className="aspect-3/2 w-24 shrink-0 rounded-md"
        sources={sources}
        alt={t('entry.thumbnail')}
        placeholderLabel={t('entry.thumbnailUnavailable')}
        loading="lazy"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <time className="text-sm text-muted-foreground" dateTime={entry.sentAt.toISOString()}>
          {t('entry.sentAt', { date: entry.sentAt })}
        </time>
        <OutcomeText outcome={entry.outcome} />
      </span>
    </a>
  );
}

/** Words an outcome. A switch rather than a key built from its kind: each key stays typed. */
function OutcomeText({ outcome }: { readonly outcome: HistoryOutcome }) {
  const { t } = useMessages('upload-history');

  switch (outcome.kind) {
    case 'books': {
      return <span className="font-medium">{t('outcome.books', { count: outcome.count })}</span>;
    }
    case 'none': {
      return <span className="font-medium">{t('outcome.none')}</span>;
    }
    case 'failed': {
      return <span className="font-medium text-destructive">{t('outcome.failed')}</span>;
    }
    case 'notStarted': {
      return <span className="font-medium text-muted-foreground">{t('outcome.notStarted')}</span>;
    }
    default: {
      const unhandled: never = outcome;

      return unhandled;
    }
  }
}
